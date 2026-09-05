/**
 * background.js
 * ---------------
 * Listens for the main document response on every top-level navigation,
 * grades its headers via headers.js, and stores the result per tab for
 * the popup to read.
 */

importScripts("headers.js");

const tabReports = new Map(); // tabId -> { url, isHttps, result }

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.type !== "main_frame" || details.tabId < 0) return;

    const isHttps = details.url.startsWith("https://");
    const result = evaluateHeaders(details.responseHeaders || [], isHttps);

    tabReports.set(details.tabId, { url: details.url, isHttps, result });
    updateBadge(details.tabId, result);
  },
  { urls: ["<all_urls>"], types: ["main_frame"] },
  ["responseHeaders", "extraHeaders"]
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "get-header-report") {
    const report = tabReports.get(message.tabId);
    sendResponse(report || null);
    return true;
  }
});

const GRADE_COLOR = {
  A: "#46d6c7",
  B: "#46d6c7",
  C: "#e8a33d",
  D: "#e8a33d",
  F: "#e85c4a",
};

function updateBadge(tabId, result) {
  chrome.action.setBadgeBackgroundColor({ tabId, color: GRADE_COLOR[result.grade] });
  chrome.action.setBadgeText({ tabId, text: result.grade });
}

chrome.tabs.onRemoved.addListener((tabId) => {
  tabReports.delete(tabId);
});
