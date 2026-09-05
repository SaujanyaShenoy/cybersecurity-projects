const GRADE_COLOR = {
  A: "#46d6c7",
  B: "#46d6c7",
  C: "#e8a33d",
  D: "#e8a33d",
  F: "#e85c4a",
};

function polarToCartesian(cx, cy, r, angleDeg) {
  const angleRad = ((angleDeg - 180) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function arcPath(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function renderGauge(score, grade) {
  const cx = 100, cy = 100, r = 80;
  document.getElementById("gauge-track").setAttribute("d", arcPath(cx, cy, r, 0, 180));
  const fillAngle = (score / 100) * 180;
  const fill = document.getElementById("gauge-fill");
  fill.setAttribute("d", arcPath(cx, cy, r, 0, Math.max(fillAngle, 0.001)));
  fill.setAttribute("stroke", GRADE_COLOR[grade]);
}

let selectedCheckId = null;

function renderChecks(checks) {
  const list = document.getElementById("checks-list");
  const applicable = checks.filter((c) => c.status !== "n/a");

  list.innerHTML = applicable
    .map(
      (c) => `
      <div class="check-row" data-id="${c.id}">
        <span class="status-dot ${c.status}"></span>
        <div class="check-body">
          <div class="check-label">${c.label}</div>
          <div class="check-detail">${c.detail}</div>
        </div>
      </div>`
    )
    .join("");

  list.querySelectorAll(".check-row").forEach((row) => {
    row.addEventListener("click", () => {
      const check = applicable.find((c) => c.id === row.dataset.id);
      showFix(check);
    });
  });
}

function showFix(check) {
  const section = document.getElementById("fix-section");
  const snippet = document.getElementById("fix-snippet");
  if (!check || !check.fix) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  snippet.textContent = check.fix;
}

function renderReport(url, result) {
  let hostname = url;
  try {
    hostname = new URL(url).hostname;
  } catch (e) {
    /* keep raw url as fallback */
  }

  document.getElementById("domain").textContent = hostname;
  document.getElementById("grade").textContent = result.grade;
  document.getElementById("grade").style.color = GRADE_COLOR[result.grade];
  document.getElementById("score-label").textContent = `${result.score} / 100`;
  renderGauge(result.score, result.grade);
  renderChecks(result.checks);
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  chrome.runtime.sendMessage({ type: "get-header-report", tabId: tab.id }, (report) => {
    if (report) {
      renderReport(report.url, report.result);
    } else {
      document.getElementById("domain").textContent = tab.url ? new URL(tab.url).hostname : "—";
      document.getElementById("score-label").textContent = "Reload the page to scan it";
    }
  });
}

init();
