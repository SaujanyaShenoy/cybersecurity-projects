/**
 * background.js
 * ---------------
 * Central state lives here, keyed by tabId:
 *
 *   tabState[tabId] = {
 *     mainDomain: "example.com",
 *     trackerHits: { "doubleclick.net": { category: "Advertising", count: 3 }, ... },
 *     thirdPartyCookieDomains: Set<string>,
 *     fingerprintTechniques: Set<string>,
 *   }
 *
 * The popup asks for this data on open via chrome.runtime.sendMessage.
 */

let TRACKERS = {}; // domain -> category, loaded once at startup

const tabState = new Map();

async function loadTrackerList() {
  const url = chrome.runtime.getURL("trackers.json");
  const res = await fetch(url);
  TRACKERS = await res.json();
}
loadTrackerList();

function freshTabState(mainDomain) {
  return {
    mainDomain,
    trackerHits: {},
    thirdPartyCookieDomains: new Set(),
    fingerprintTechniques: new Set(),
  };
}

// --- Domain helpers --------------------------------------------------------

// Two-part public suffixes we handle specially so "bbc.co.uk" doesn't
// collapse to "co.uk". Not a full public-suffix-list implementation --
// documented as a known limitation in the README.
const TWO_PART_SUFFIXES = new Set([
  "co.uk", "org.uk", "gov.uk", "ac.uk",
  "co.in", "co.jp", "com.au", "com.br", "co.nz",
]);

function registrableDomain(hostname) {
  const parts = hostname.split(".").filter(Boolean);
  if (parts.length <= 2) return hostname;

  const lastTwo = parts.slice(-2).join(".");
  if (TWO_PART_SUFFIXES.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }
  return lastTwo;
}

function matchTrackerCategory(hostname) {
  // Check the hostname itself and each parent domain against the list,
  // e.g. "sub.doubleclick.net" should still match "doubleclick.net".
  const parts = hostname.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join(".");
    if (TRACKERS[candidate]) return { domain: candidate, category: TRACKERS[candidate] };
  }
  return null;
}

function getState(tabId) {
  if (!tabState.has(tabId)) {
    tabState.set(tabId, freshTabState(null));
  }
  return tabState.get(tabId);
}

// --- Track main-frame navigation to know what "third-party" means ---------
//
// IMPORTANT: we use onCommitted, not onBeforeNavigate. onBeforeNavigate
// fires with the URL *before* any redirects are followed -- if you click a
// Google search/ad result that redirects through google.com/googleadservices.com
// before landing on the real page (e.g. amazon.com), onBeforeNavigate would
// give us "google.com" as the "home" domain, and every tracker on the actual
// amazon.com page would be miscompared against it. onCommitted fires with
// the final, post-redirect URL, which is what we actually want.
//
// Trade-off: a handful of the very first sub-resource requests fired in the
// gap between navigation start and commit may load before mainDomain is set
// and won't be attributed. Acceptable for this tool -- see README.

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return;
  // Clear stale state immediately so the popup doesn't show the previous
  // page's data while the new page is loading, but don't set mainDomain
  // yet -- we don't know the final domain until onCommitted.
  tabState.set(details.tabId, freshTabState(null));
  updateBadge(details.tabId);
});

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return; // only top-level navigations
  try {
    const hostname = new URL(details.url).hostname;
    const state = getState(details.tabId);
    state.mainDomain = registrableDomain(hostname);
    updateBadge(details.tabId);
  } catch (e) {
    /* ignore invalid URLs like about:blank */
  }
});

// --- Observe outgoing requests for third-party tracker domains ------------

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0) return; // not associated with a tab (e.g. extension itself)
    let hostname;
    try {
      hostname = new URL(details.url).hostname;
    } catch (e) {
      return;
    }

    const state = getState(details.tabId);
    const requestDomain = registrableDomain(hostname);

    if (state.mainDomain && requestDomain !== state.mainDomain) {
      const match = matchTrackerCategory(hostname);
      if (match) {
        const key = match.domain;
        if (!state.trackerHits[key]) {
          state.trackerHits[key] = { category: match.category, count: 0 };
        }
        state.trackerHits[key].count += 1;
        updateBadge(details.tabId);
      }
    }
  },
  { urls: ["<all_urls>"] }
);

// --- Observe Set-Cookie responses from third-party domains -----------------

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId < 0) return;
    let hostname;
    try {
      hostname = new URL(details.url).hostname;
    } catch (e) {
      return;
    }

    const state = getState(details.tabId);
    const requestDomain = registrableDomain(hostname);
    if (!state.mainDomain || requestDomain === state.mainDomain) return;

    const headers = details.responseHeaders || [];
    const setsCookie = headers.some((h) => h.name.toLowerCase() === "set-cookie");
    if (setsCookie) {
      state.thirdPartyCookieDomains.add(requestDomain);
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders", "extraHeaders"]
);

// --- Receive fingerprinting reports from content-relay.js ------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "fingerprint-attempt" && sender.tab) {
    const state = getState(sender.tab.id);
    state.fingerprintTechniques.add(message.technique);
    updateBadge(sender.tab.id);
    return;
  }

  if (message.type === "get-tab-report") {
    const state = getState(message.tabId);
    sendResponse(buildReport(state));
    return true;
  }

  if (message.type === "set-blocking") {
    chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: message.enabled ? ["tracker_block"] : [],
      disableRulesetIds: message.enabled ? [] : ["tracker_block"],
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "get-blocking-state") {
    chrome.declarativeNetRequest.getEnabledRulesets((ids) => {
      sendResponse({ enabled: ids.includes("tracker_block") });
    });
    return true;
  }
});

// --- Scoring -----------------------------------------------------------

function computeScore(state) {
  const trackerCount = Object.keys(state.trackerHits).length;
  const cookieCount = state.thirdPartyCookieDomains.size;
  const fpCount = state.fingerprintTechniques.size;

  const raw = trackerCount * 8 + cookieCount * 6 + fpCount * 18;
  return Math.min(100, raw);
}

function scoreBand(score) {
  if (score < 25) return "low";
  if (score < 60) return "medium";
  return "high";
}

function buildReport(state) {
  const score = computeScore(state);
  return {
    mainDomain: state.mainDomain,
    score,
    band: scoreBand(score),
    trackers: Object.entries(state.trackerHits).map(([domain, v]) => ({
      domain,
      category: v.category,
      count: v.count,
    })),
    thirdPartyCookieDomains: Array.from(state.thirdPartyCookieDomains),
    fingerprintTechniques: Array.from(state.fingerprintTechniques),
  };
}

function updateBadge(tabId) {
  const state = getState(tabId);
  const score = computeScore(state);
  const band = scoreBand(score);
  const color = band === "high" ? "#E85C4A" : band === "medium" ? "#E8A33D" : "#46D6C7";
  const trackerCount = Object.keys(state.trackerHits).length;

  chrome.action.setBadgeBackgroundColor({ tabId, color });
  chrome.action.setBadgeText({ tabId, text: trackerCount > 0 ? String(trackerCount) : "" });
}

// Clean up state when a tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  tabState.delete(tabId);
});
