/**
 * headers.js
 * -----------
 * Pure evaluation logic for grading a page's security headers. Kept in its
 * own file (no chrome.* calls) so it can be unit-tested outside the browser.
 *
 * Each check returns: { id, label, status: "good"|"weak"|"missing", detail, points, maxPoints, fix }
 *
 * Scoring: points earned / points possible * 100, banded into a letter grade.
 * HSTS is excluded from maxPoints entirely on http:// pages, since it's
 * meaningless without TLS -- the denominator shrinks rather than penalizing
 * a plain http page for something that doesn't apply to it.
 */

function getHeader(headers, name) {
  const lower = name.toLowerCase();
  const found = headers.find((h) => h.name.toLowerCase() === lower);
  return found ? found.value : null;
}

function checkCSP(headers) {
  const csp = getHeader(headers, "content-security-policy");
  const id = "csp";
  const label = "Content-Security-Policy";
  const maxPoints = 25;

  if (!csp) {
    return {
      id, label, status: "missing", points: 0, maxPoints,
      detail: "No CSP header found. This is your strongest defense against XSS and data injection.",
      fix: "Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'",
    };
  }

  // A CSP with none of the directives that actually restrict content
  // loading (default-src, script-src, style-src, object-src) provides
  // essentially no protection, even if it looks "present" -- e.g. Amazon's
  // real-world CSP of just `upgrade-insecure-requests;report-uri ...` sets
  // zero restrictions on what scripts can execute.
  const hasRestrictiveDirective = /(^|;)\s*(default-src|script-src|style-src|object-src)\b/i.test(csp);
  if (!hasRestrictiveDirective) {
    return {
      id, label, status: "weak", points: 5, maxPoints,
      detail: "CSP header is present but has no default-src/script-src/style-src/object-src directive, so it doesn't actually restrict what content can load or execute.",
      fix: "Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'",
    };
  }

  const weak = /unsafe-inline|unsafe-eval|(^|\s)\*(\s|;|$)/.test(csp);
  if (weak) {
    return {
      id, label, status: "weak", points: 12, maxPoints,
      detail: "CSP is present but allows 'unsafe-inline', 'unsafe-eval', or a wildcard source, which significantly weakens its protection.",
      fix: "Remove 'unsafe-inline'/'unsafe-eval' and replace wildcard sources with an explicit allowlist.",
    };
  }

  return {
    id, label, status: "good", points: 25, maxPoints,
    detail: "CSP is present with no obviously unsafe directives.",
    fix: null,
  };
}

function checkClickjacking(headers) {
  const xfo = getHeader(headers, "x-frame-options");
  const csp = getHeader(headers, "content-security-policy") || "";
  const hasFrameAncestors = /frame-ancestors/i.test(csp);
  const id = "clickjacking";
  const label = "Clickjacking protection";
  const maxPoints = 20;

  if (hasFrameAncestors) {
    return {
      id, label, status: "good", points: 20, maxPoints,
      detail: "CSP frame-ancestors directive is present, which supersedes X-Frame-Options in modern browsers.",
      fix: null,
    };
  }

  if (!xfo) {
    return {
      id, label, status: "missing", points: 0, maxPoints,
      detail: "No X-Frame-Options or CSP frame-ancestors found. The page can be embedded in an iframe on any site, enabling clickjacking.",
      fix: "X-Frame-Options: DENY   (or SAMEORIGIN if you need to frame it yourself)",
    };
  }

  const value = xfo.toUpperCase();
  if (value === "DENY" || value === "SAMEORIGIN") {
    return {
      id, label, status: "good", points: 20, maxPoints,
      detail: `X-Frame-Options: ${xfo} correctly blocks unauthorized framing.`,
      fix: null,
    };
  }

  return {
    id, label, status: "weak", points: 8, maxPoints,
    detail: `X-Frame-Options: ${xfo} is a deprecated/non-standard value (e.g. ALLOW-FROM) with inconsistent browser support.`,
    fix: "X-Frame-Options: DENY",
  };
}

function checkContentTypeOptions(headers) {
  const value = getHeader(headers, "x-content-type-options");
  const id = "nosniff";
  const label = "X-Content-Type-Options";
  const maxPoints = 15;

  if (!value) {
    return {
      id, label, status: "missing", points: 0, maxPoints,
      detail: "Missing. Without this, browsers may MIME-sniff responses, which can turn a file upload into an XSS vector.",
      fix: "X-Content-Type-Options: nosniff",
    };
  }

  if (value.toLowerCase().trim() === "nosniff") {
    return { id, label, status: "good", points: 15, maxPoints, detail: "Correctly set to nosniff.", fix: null };
  }

  return {
    id, label, status: "weak", points: 5, maxPoints,
    detail: `Present but set to an unexpected value ("${value}") instead of "nosniff".`,
    fix: "X-Content-Type-Options: nosniff",
  };
}

function checkHSTS(headers, isHttps) {
  const id = "hsts";
  const label = "Strict-Transport-Security";

  if (!isHttps) {
    return { id, label, status: "n/a", points: 0, maxPoints: 0, detail: "Page is served over http:// -- HSTS only applies to https.", fix: null };
  }

  const maxPoints = 20;
  const value = getHeader(headers, "strict-transport-security");

  if (!value) {
    return {
      id, label, status: "missing", points: 0, maxPoints,
      detail: "No HSTS header on an https page. Without it, a user's first visit (or a stripped connection) can be downgraded to http.",
      fix: "Strict-Transport-Security: max-age=31536000; includeSubDomains",
    };
  }

  const maxAgeMatch = value.match(/max-age=(\d+)/i);
  const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 0;
  const hasSubdomains = /includesubdomains/i.test(value);

  if (maxAge >= 31536000 && hasSubdomains) {
    return { id, label, status: "good", points: 20, maxPoints, detail: `HSTS set with a strong max-age (${maxAge}s) and includeSubDomains.`, fix: null };
  }

  return {
    id, label, status: "weak", points: 10, maxPoints,
    detail: `HSTS present but max-age is short (${maxAge}s) or includeSubDomains is missing.`,
    fix: "Strict-Transport-Security: max-age=31536000; includeSubDomains",
  };
}

function checkReferrerPolicy(headers) {
  const value = getHeader(headers, "referrer-policy");
  const id = "referrer";
  const label = "Referrer-Policy";
  const maxPoints = 10;
  const strongValues = ["no-referrer", "strict-origin", "strict-origin-when-cross-origin", "same-origin"];

  if (!value) {
    return {
      id, label, status: "missing", points: 0, maxPoints,
      detail: "Missing. Browsers default to a permissive policy that can leak full URLs (including query params) to third parties.",
      fix: "Referrer-Policy: strict-origin-when-cross-origin",
    };
  }

  if (strongValues.includes(value.toLowerCase().trim())) {
    return { id, label, status: "good", points: 10, maxPoints, detail: `Set to a privacy-conscious value ("${value}").`, fix: null };
  }

  return {
    id, label, status: "weak", points: 4, maxPoints,
    detail: `Set to "${value}", which leaks more referrer information than necessary.`,
    fix: "Referrer-Policy: strict-origin-when-cross-origin",
  };
}

function checkPermissionsPolicy(headers) {
  const value = getHeader(headers, "permissions-policy");
  const id = "permissions";
  const label = "Permissions-Policy";
  const maxPoints = 10;

  if (!value) {
    return {
      id, label, status: "missing", points: 0, maxPoints,
      detail: "Missing. This header restricts which browser features (camera, geolocation, etc.) the page and any embedded content can use.",
      fix: "Permissions-Policy: geolocation=(), camera=(), microphone=()",
    };
  }

  return { id, label, status: "good", points: 10, maxPoints, detail: "Present, restricting browser feature access.", fix: null };
}

function gradeFromScore(score) {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

function evaluateHeaders(headers, isHttps) {
  const checks = [
    checkCSP(headers),
    checkClickjacking(headers),
    checkContentTypeOptions(headers),
    checkHSTS(headers, isHttps),
    checkReferrerPolicy(headers),
    checkPermissionsPolicy(headers),
  ];

  const applicable = checks.filter((c) => c.status !== "n/a");
  const earned = applicable.reduce((sum, c) => sum + c.points, 0);
  const possible = applicable.reduce((sum, c) => sum + c.maxPoints, 0);
  const score = possible > 0 ? Math.round((earned / possible) * 100) : 0;

  return {
    score,
    grade: gradeFromScore(score),
    checks,
  };
}

if (typeof module !== "undefined") {
  module.exports = { evaluateHeaders, gradeFromScore, getHeader };
}
