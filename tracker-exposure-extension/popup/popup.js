const BAND_COLOR = {
  low: "#46d6c7",
  medium: "#e8a33d",
  high: "#e85c4a",
};

const BAND_TEXT = {
  low: "Low exposure",
  medium: "Moderate exposure",
  high: "High exposure",
};

const CATEGORY_CLASS = {
  Advertising: "cat-advertising",
  Analytics: "cat-analytics",
  Social: "cat-social",
  "Data broker": "cat-databroker",
  "Performance monitoring": "cat-performance",
};

function describeTechnique(t) {
  const map = {
    "canvas:toDataURL": "Canvas fingerprint read (toDataURL)",
    "canvas:getImageData": "Canvas pixel read (getImageData)",
    "audio:createOscillator": "Audio fingerprint probe (oscillator)",
    "audio:createAnalyser": "Audio fingerprint probe (analyser)",
    "navigator:plugins": "Browser plugin enumeration",
  };
  return map[t] || t;
}

// --- Gauge rendering (semicircle arc, 0-100 mapped to 180°-0°) ------------

function polarToCartesian(cx, cy, r, angleDeg) {
  const angleRad = ((angleDeg - 180) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  };
}

function arcPath(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function renderGauge(score, band) {
  const cx = 100, cy = 100, r = 80;
  document.getElementById("gauge-track").setAttribute("d", arcPath(cx, cy, r, 0, 180));

  const fillAngle = (score / 100) * 180;
  const fill = document.getElementById("gauge-fill");
  fill.setAttribute("d", arcPath(cx, cy, r, 0, Math.max(fillAngle, 0.001)));
  fill.setAttribute("stroke", BAND_COLOR[band]);
}

// --- Rendering --------------------------------------------------------

function renderReport(report) {
  document.getElementById("domain").textContent = report.mainDomain || "—";
  document.getElementById("score").textContent = report.score;
  document.getElementById("band-label").textContent = BAND_TEXT[report.band];
  document.getElementById("score").style.color = BAND_COLOR[report.band];
  renderGauge(report.score, report.band);

  document.getElementById("tracker-count").textContent = report.trackers.length;
  document.getElementById("cookie-count").textContent = report.thirdPartyCookieDomains.length;
  document.getElementById("fp-count").textContent = report.fingerprintTechniques.length;

  const trackerList = document.getElementById("tracker-list");
  if (report.trackers.length === 0) {
    trackerList.innerHTML = `<div class="empty-state">No third-party trackers observed yet.</div>`;
  } else {
    trackerList.innerHTML = report.trackers
      .sort((a, b) => b.count - a.count)
      .map(
        (t) => `
        <div class="tracker-row">
          <span class="dot ${CATEGORY_CLASS[t.category] || ""}"></span>
          <span class="tracker-domain" title="${t.domain}">${t.domain}</span>
          <span class="tracker-meta">${t.category} · ${t.count}</span>
        </div>`
      )
      .join("");
  }

  const fpSection = document.getElementById("fp-list-section");
  const fpList = document.getElementById("fp-list");
  if (report.fingerprintTechniques.length > 0) {
    fpSection.hidden = false;
    fpList.innerHTML = report.fingerprintTechniques
      .map(
        (t) => `
        <div class="tracker-row">
          <span class="dot" style="background:#e85c4a"></span>
          <span class="tracker-domain">${describeTechnique(t)}</span>
        </div>`
      )
      .join("");
  } else {
    fpSection.hidden = true;
  }
}

// --- Init ---------------------------------------------------------------

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  chrome.runtime.sendMessage({ type: "get-tab-report", tabId: tab.id }, (report) => {
    if (report) renderReport(report);
  });

  chrome.runtime.sendMessage({ type: "get-blocking-state" }, (res) => {
    document.getElementById("block-toggle").checked = !!(res && res.enabled);
  });

  document.getElementById("block-toggle").addEventListener("change", (e) => {
    chrome.runtime.sendMessage({ type: "set-blocking", enabled: e.target.checked });
  });
}

init();
