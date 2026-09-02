/**
 * Runs in the page's own JS context (MAIN world) so it can wrap APIs
 * before the page's own scripts get a chance to call them. Reports
 * attempts via window.postMessage to content-relay.js (ISOLATED world),
 * which forwards them to the background service worker.
 *
 * Detects three common fingerprinting techniques:
 *   - Canvas fingerprinting (toDataURL / getImageData on a canvas)
 *   - AudioContext fingerprinting (oscillator + analyser pattern)
 *   - Enumerating navigator.plugins / navigator.mimeTypes
 *
 * This is a heuristic signal, not proof of malicious intent -- plenty of
 * legitimate sites use canvas or audio APIs for real functionality.
 */
(function () {
  const MSG_SOURCE = "tracker-exposure-monitor";

  function report(technique) {
    window.postMessage({ source: MSG_SOURCE, technique }, "*");
  }

  // --- Canvas fingerprinting -------------------------------------------
  try {
    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      report("canvas:toDataURL");
      return origToDataURL.apply(this, args);
    };

    const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function (...args) {
      report("canvas:getImageData");
      return origGetImageData.apply(this, args);
    };
  } catch (e) {
    /* API not available in this context, ignore */
  }

  // --- Audio fingerprinting ---------------------------------------------
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      const origCreateOscillator = AC.prototype.createOscillator;
      AC.prototype.createOscillator = function (...args) {
        report("audio:createOscillator");
        return origCreateOscillator.apply(this, args);
      };

      const origCreateAnalyser = AC.prototype.createAnalyser;
      AC.prototype.createAnalyser = function (...args) {
        report("audio:createAnalyser");
        return origCreateAnalyser.apply(this, args);
      };
    }
  } catch (e) {
    /* ignore */
  }

  // --- Plugin/mimeType enumeration --------------------------------------
  try {
    const pluginsDesc = Object.getOwnPropertyDescriptor(
      Navigator.prototype,
      "plugins"
    );
    if (pluginsDesc && pluginsDesc.configurable && pluginsDesc.get) {
      const origGetter = pluginsDesc.get;
      Object.defineProperty(Navigator.prototype, "plugins", {
        configurable: true,
        get() {
          report("navigator:plugins");
          return origGetter.call(this);
        },
      });
    }
  } catch (e) {
    /* ignore -- some browsers make this non-configurable */
  }
})();
