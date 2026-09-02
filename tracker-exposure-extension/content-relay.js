/**
 * Runs in the ISOLATED world (the normal content-script context), which is
 * the only place chrome.runtime is available. Its only job is to relay
 * fingerprinting reports from content-inject.js (MAIN world) to the
 * background service worker, deduplicated per technique per page load.
 */
(function () {
  const seen = new Set();

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "tracker-exposure-monitor") return;

    const technique = data.technique;
    if (seen.has(technique)) return; // only count each technique once per page
    seen.add(technique);

    chrome.runtime.sendMessage({
      type: "fingerprint-attempt",
      technique,
      url: window.location.href,
    });
  });
})();
