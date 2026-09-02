/**
 * Lightweight tests for the pure logic in background.js (domain parsing,
 * tracker matching, and scoring). These functions are copied here rather
 * than imported because background.js runs as a Chrome service worker and
 * isn't a standard ES module -- see README for why.
 *
 * Run with: node tests/logic.test.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const TRACKERS = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "trackers.json"), "utf8")
);

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
  const parts = hostname.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join(".");
    if (TRACKERS[candidate]) return { domain: candidate, category: TRACKERS[candidate] };
  }
  return null;
}

function computeScore(trackerCount, cookieCount, fpCount) {
  const raw = trackerCount * 8 + cookieCount * 6 + fpCount * 18;
  return Math.min(100, raw);
}

// --- Tests ---------------------------------------------------------------

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

test("simple two-part domain stays as-is", () => {
  assert.strictEqual(registrableDomain("example.com"), "example.com");
});

test("subdomain collapses to registrable domain", () => {
  assert.strictEqual(registrableDomain("www.example.com"), "example.com");
  assert.strictEqual(registrableDomain("sub.doubleclick.net"), "doubleclick.net");
});

test("known two-part suffix is handled (co.uk)", () => {
  assert.strictEqual(registrableDomain("bbc.co.uk"), "bbc.co.uk");
  assert.strictEqual(registrableDomain("www.bbc.co.uk"), "bbc.co.uk");
});

test("direct tracker domain match", () => {
  const match = matchTrackerCategory("google-analytics.com");
  assert.ok(match);
  assert.strictEqual(match.domain, "google-analytics.com");
  assert.strictEqual(match.category, "Analytics");
});

test("subdomain of a tracker domain still matches", () => {
  const match = matchTrackerCategory("stats.g.doubleclick.net");
  assert.ok(match);
  assert.strictEqual(match.domain, "doubleclick.net");
});

test("non-tracker domain does not match", () => {
  assert.strictEqual(matchTrackerCategory("example.com"), null);
});

test("score is zero with no signals", () => {
  assert.strictEqual(computeScore(0, 0, 0), 0);
});

test("score increases with trackers, cookies, and fingerprinting", () => {
  const noSignals = computeScore(0, 0, 0);
  const withTrackers = computeScore(3, 0, 0);
  const withAll = computeScore(3, 2, 1);
  assert.ok(withTrackers > noSignals);
  assert.ok(withAll > withTrackers);
});

test("score caps at 100", () => {
  assert.strictEqual(computeScore(50, 50, 50), 100);
});

console.log("\nAll logic tests completed.");
