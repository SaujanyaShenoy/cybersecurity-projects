const assert = require("assert");
const { evaluateHeaders, gradeFromScore } = require("../headers.js");

function test(name, fn) {
  try {
    fn();
    console.log(`  ok  - ${name}`);
  } catch (e) {
    console.error(`FAIL  - ${name}`);
    console.error(e);
    process.exitCode = 1;
  }
}

function h(name, value) {
  return { name, value };
}

test("no headers at all on an https page scores near zero and grades F", () => {
  const result = evaluateHeaders([], true);
  assert.strictEqual(result.grade, "F");
  assert.ok(result.score < 20);
});

test("a fully hardened https page scores 100 and grades A", () => {
  const headers = [
    h("Content-Security-Policy", "default-src 'self'; object-src 'none'"),
    h("X-Frame-Options", "DENY"),
    h("X-Content-Type-Options", "nosniff"),
    h("Strict-Transport-Security", "max-age=31536000; includeSubDomains"),
    h("Referrer-Policy", "strict-origin-when-cross-origin"),
    h("Permissions-Policy", "geolocation=()"),
  ];
  const result = evaluateHeaders(headers, true);
  assert.strictEqual(result.score, 100);
  assert.strictEqual(result.grade, "A");
});

test("CSP with unsafe-inline is flagged as weak, not good", () => {
  const headers = [h("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'")];
  const result = evaluateHeaders(headers, true);
  const csp = result.checks.find((c) => c.id === "csp");
  assert.strictEqual(csp.status, "weak");
  assert.ok(csp.points < csp.maxPoints);
});

test("CSP with only upgrade-insecure-requests/report-uri (no real restriction) is flagged weak, not good", () => {
  // Real-world example: this is Amazon's actual enforced CSP as of testing.
  // It looks "present" but restricts nothing since it has no default-src/
  // script-src/style-src/object-src directive.
  const headers = [h("Content-Security-Policy", "upgrade-insecure-requests;report-uri https://metrics.example.com/")];
  const result = evaluateHeaders(headers, true);
  const csp = result.checks.find((c) => c.id === "csp");
  assert.strictEqual(csp.status, "weak");
  assert.ok(csp.detail.includes("doesn't actually restrict"));
});

test("CSP frame-ancestors satisfies clickjacking protection even without X-Frame-Options", () => {
  const headers = [h("Content-Security-Policy", "frame-ancestors 'self'")];
  const result = evaluateHeaders(headers, true);
  const ck = result.checks.find((c) => c.id === "clickjacking");
  assert.strictEqual(ck.status, "good");
});

test("HSTS is marked not-applicable on http pages, not penalized", () => {
  const result = evaluateHeaders([], false);
  const hsts = result.checks.find((c) => c.id === "hsts");
  assert.strictEqual(hsts.status, "n/a");
  assert.strictEqual(hsts.maxPoints, 0);
});

test("HSTS with short max-age is weak, not good", () => {
  const headers = [h("Strict-Transport-Security", "max-age=3600")];
  const result = evaluateHeaders(headers, true);
  const hsts = result.checks.find((c) => c.id === "hsts");
  assert.strictEqual(hsts.status, "weak");
});

test("X-Frame-Options ALLOW-FROM is weak (deprecated), not good", () => {
  const headers = [h("X-Frame-Options", "ALLOW-FROM https://example.com")];
  const result = evaluateHeaders(headers, true);
  const ck = result.checks.find((c) => c.id === "clickjacking");
  assert.strictEqual(ck.status, "weak");
});

test("grade boundaries are inclusive at the stated thresholds", () => {
  assert.strictEqual(gradeFromScore(90), "A");
  assert.strictEqual(gradeFromScore(89), "B");
  assert.strictEqual(gradeFromScore(75), "B");
  assert.strictEqual(gradeFromScore(60), "C");
  assert.strictEqual(gradeFromScore(40), "D");
  assert.strictEqual(gradeFromScore(39), "F");
});

console.log("\nAll header-grading tests completed.");
