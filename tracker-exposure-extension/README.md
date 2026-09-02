# Tracker & Privacy Exposure Monitor

A Chrome extension (Manifest V3) that shows, in real time, how much of the
page you're looking at is talking to third parties: ad/analytics trackers,
third-party cookies, and fingerprinting-style script behavior — condensed
into a single 0-100 exposure score.

## Why this exists

Most people have no idea how many third parties a single page load talks
to. This isn't a full privacy suite — it's a focused, honest instrument:
open it on any page and see what's actually happening, with the option to
block the trackers it recognizes.

## What it detects

| Signal | How |
|---|---|
| **Trackers** | Every outbound request's domain is checked against a curated list of ~60 known ad/analytics/social/data-broker domains, categorized (see `trackers.json`). Subdomains match their parent (`stats.g.doubleclick.net` → `doubleclick.net`). |
| **Third-party cookies** | Any `Set-Cookie` response header coming from a domain other than the page's own is counted. |
| **Fingerprinting signals** | The page's own JS environment is instrumented (before page scripts run) to detect canvas fingerprinting (`toDataURL`/`getImageData`), audio fingerprinting (`AudioContext` oscillator/analyser), and `navigator.plugins` enumeration. |

The **exposure score** is a simple weighted sum (trackers × 8 + cookies × 6
+ fingerprint signals × 18, capped at 100) — intentionally simple and
inspectable rather than a black-box ML score.

## Install (load unpacked, for now)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select this folder
4. Visit any site and click the extension icon

The badge on the toolbar icon shows the live tracker count, colored by
exposure band (teal = low, amber = medium, coral = high).

## Blocking trackers

The toggle at the bottom of the popup enables a `declarativeNetRequest`
ruleset (`rules/tracker_rules.json`, generated from the same tracker list)
that blocks requests to known tracker domains — device-wide, not
per-site, in this v1.

## Architecture

```
content-inject.js   (MAIN world)      → wraps fingerprinting APIs, posts detections
content-relay.js    (ISOLATED world)  → relays detections to the background worker
background.js       (service worker)  → tracks requests/cookies per tab, computes score
popup/               popup UI          → renders the gauge, lists, and blocking toggle
trackers.json                          → source of truth for known tracker domains
rules/tracker_rules.json               → declarativeNetRequest rules, generated from trackers.json
```

Fingerprinting detection needs two content scripts because Chrome's MAIN
world (the page's real JS context, needed to intercept API calls before
the page uses them) can't call `chrome.runtime` directly — only the
isolated content-script world can. So the MAIN-world script posts a
`window.postMessage`, and the isolated-world script relays it onward.

## Known limitations

- **Domain parsing is a simplified public-suffix approximation** (`co.uk`,
  `com.au`, etc. are hardcoded), not a full PSL implementation — good
  enough for demo purposes, would want the `psl` npm package for
  production use.
- **Tracker list is a curated ~60-domain sample**, not a full blocklist
  like EasyPrivacy/Disconnect. Easy to extend — it's just a JSON file.
- **Fingerprinting detection is heuristic.** Plenty of legitimate sites use
  canvas/audio APIs for real functionality (games, audio editors); a
  detection here is a signal, not proof of tracking intent.
- **Blocking is global, not per-site**, in this version.
- **A handful of the very first sub-resource requests on a page load may be missed** if they fire in the brief window between navigation start and the navigation actually committing (see the comment in `background.js` above the `onCommitted` listener). This was a deliberate fix for a worse bug: originally the tool used `onBeforeNavigate`, which reports the URL *before* redirects resolve, so clicking a Google search/ad result that redirects through `google.com` before landing on the real page (e.g. `amazon.com`) caused the whole page's trackers to be attributed to the wrong "home" domain. `onCommitted` (post-redirect) fixes that at the cost of the small gap above.

## Possible extensions

- Per-site allow/block toggle instead of a single device-wide switch
- Import a real blocklist (EasyPrivacy) instead of the curated sample
- Historical view: exposure trend across recent sites you've visited
- Export a report (this pairs naturally with a portfolio write-up)

## Tests

Pure logic (domain parsing, tracker matching, scoring) is covered outside
the browser:

```bash
node tests/logic.test.js
```

(Chrome APIs like `chrome.webRequest` can't run outside the browser, so
this covers the testable core logic rather than the full extension.)

## License

MIT
