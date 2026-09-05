# Security Headers Checker

A Chrome extension (Manifest V3) that grades any page's HTTP security
headers (A-F) and explains exactly what's missing, weak, or good — with a
copy-pasteable fix for anything that needs one.

Companion tool to the [Tracker & Privacy Exposure Monitor](../tracker-exposure-extension) — same visual language, opposite purpose: that one measures what a site exposes *about you*, this one measures what a site does to protect *itself and its users*.

## What it checks

| Header | Why it matters | What counts as "weak" here |
|---|---|---|
| **Content-Security-Policy** | Primary defense against XSS/injection | Contains `unsafe-inline`, `unsafe-eval`, or a wildcard source |
| **Clickjacking protection** (X-Frame-Options or CSP `frame-ancestors`) | Prevents the page being framed for UI-redress attacks | Deprecated `ALLOW-FROM` value |
| **X-Content-Type-Options** | Stops MIME-sniffing based content-type confusion | Present but not exactly `nosniff` |
| **Strict-Transport-Security** | Forces https, prevents downgrade attacks | Short `max-age` or missing `includeSubDomains` — n/a entirely on http pages |
| **Referrer-Policy** | Controls how much URL data leaks to other sites via the Referer header | Anything looser than `strict-origin-when-cross-origin` |
| **Permissions-Policy** | Restricts which browser features (camera, geolocation, etc.) the page can use | Simple presence check |

This is intentionally **not** a copy of Mozilla Observatory or securityheaders.com — it's scoped to the checks that are easy to verify from a single response and explain in one sentence, aimed at being something you can defend line-by-line in an interview.

## Install

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this folder
3. Visit any site, click the icon

The toolbar badge shows the letter grade immediately, color-coded (teal = A/B, amber = C/D, coral = F).

## How grading works

Each check is worth points (CSP and clickjacking protection weigh the most,
since they matter most). Points earned ÷ points possible × 100 = score,
banded into A (90+), B (75+), C (60+), D (40+), F (below 40).

**HSTS is excluded from the denominator on http:// pages** rather than
counted as a failure — it's meaningless without TLS, so a plain http page
isn't penalized for something that doesn't apply to it.

Click any check in the popup to see the exact header line that would fix it.

## Architecture

```
headers.js            → pure evaluation logic (no chrome.* calls, unit-testable)
background.js         → captures main-frame response headers per tab via
                          webRequest.onHeadersReceived, calls headers.js, stores per-tab
popup/                → renders the grade gauge and per-check breakdown
```

`headers.js` is deliberately framework-free and has no Chrome API calls, so
the whole grading engine is tested with plain Node — no browser automation
needed for the logic that actually matters.

## Real-world validation

Testing against `amazon.com` surfaced a genuine gap in the original CSP
check: Amazon's actual enforced CSP is just
`upgrade-insecure-requests;report-uri https://metrics.media-amazon.com/` —
no `default-src`, `script-src`, or any directive that restricts what
scripts can run. The original check only looked for *unsafe* directives
(`unsafe-inline`, `unsafe-eval`, wildcards) and would have scored this as
"good" simply because none of those specific strings were present, even
though the policy restricts nothing. Fixed by also requiring at least one
of `default-src`/`script-src`/`style-src`/`object-src` to be present
before a CSP counts as meaningfully restrictive — see the test case named
after this exact scenario in `tests/headers.test.js`.

## Known limitations

- Only evaluates the **main document response**, not headers on subresources (scripts, iframes, etc.)
- Doesn't parse CSP into a full directive-by-directive breakdown — checks for specific known-bad patterns (`unsafe-inline`, `unsafe-eval`, wildcards) rather than modeling the whole policy
- No historical tracking — each popup open reflects only the current page load, not the page's headers over time
- Doesn't check `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` (COOP/COEP) yet — a natural next check to add

## Tests

```bash
node tests/headers.test.js
```

8 tests covering the grading engine, including the trickier edge cases:
CSP with unsafe directives, `ALLOW-FROM` (deprecated), and the http/HSTS
interaction.

## License

MIT
