# Troubleshooting a TLS Certificate Validation Failure in Chrome

## Overview

While accessing Microsoft Word for the Web through Google Chrome, I encountered an HTTPS certificate validation error:

```text
NET::ERR_CERT_AUTHORITY_INVALID
```

The website had been working normally previously, so the goal was to determine whether the issue originated from:

* The Microsoft website
* DNS resolution
* The local network
* The Windows certificate trust store
* Google Chrome
* A proxy or VPN
* Browser extensions/security software

Rather than bypassing the certificate warning, I investigated the TLS connection and progressively isolated the problem.

---

## 1. Initial Problem

When navigating to:

```text
https://word.cloud.microsoft/en-us/
```

Chrome displayed:

```text
Your connection is not private

NET::ERR_CERT_AUTHORITY_INVALID
```

Chrome also prevented bypassing the warning because the Microsoft domain uses **HTTP Strict Transport Security (HSTS)**.

### What the Error Means

`NET::ERR_CERT_AUTHORITY_INVALID` indicates that Chrome cannot establish a trusted certificate chain between the certificate presented by the server and a trusted Certificate Authority (CA).

A normal certificate trust relationship looks approximately like:

```text
Website Certificate
        |
        v
Intermediate CA
        |
        v
Trusted Root CA
        |
        v
Browser Trusts Connection
```

Possible causes include:

* Self-signed certificates
* Missing intermediate certificates
* Untrusted Certificate Authorities
* TLS inspection
* Proxy interception
* Antivirus HTTPS inspection
* Incorrect system time
* Network interception
* Server certificate misconfiguration

Because this was a legitimate Microsoft service, bypassing the certificate warning would not have been an appropriate solution.

---

## 2. Inspecting the Certificate

I opened Chrome's certificate viewer to inspect the certificate presented for:

```text
word.cloud.microsoft
```

The certificate showed:

```text
Issued To:
CN = word.cloud.microsoft

Issued By:
CN = word.cloud.microsoft
```

The certificate hierarchy also contained only:

```text
word.cloud.microsoft
```

This was unusual.

Normally, a public Microsoft service should present a certificate that chains back through one or more trusted Certificate Authorities.

Instead, the certificate appeared to be self-signed:

```text
word.cloud.microsoft
        |
        +---- Signed by itself
```

Because Chrome did not trust this certificate as a root CA, certificate validation failed.

### Initial Hypothesis

At this point, possible explanations included:

1. Microsoft was presenting an incorrect certificate.
2. DNS was directing the browser to an unexpected server.
3. A local proxy was intercepting HTTPS.
4. Security software was performing TLS/HTTPS inspection.
5. Something specific to Chrome was affecting the connection.

More testing was necessary before identifying the cause.

---

## 3. Checking Whether the Problem Was System-Wide

The next step was to determine whether certificate validation was failing for all HTTPS websites.

I tested Google.

The certificate showed approximately:

```text
Issued To:
*.google.com

Issued By:
WE2
Google Trust Services
```

Chrome trusted the connection.

```text
Google
   |
   v
Google Trust Services
   |
   v
Trusted
```

### Result

```text
google.com             -> PASS
word.cloud.microsoft   -> FAIL
```

This indicated that Chrome was capable of validating normal public TLS certificates.

Therefore, this was unlikely to be a complete failure of the Windows or Chrome certificate trust system.

---

## 4. Testing Another Microsoft Service

Next, I tested:

```text
https://www.microsoft.com
```

The certificate showed:

```text
Issued To:
www.microsoft.com

Issued By:
Microsoft TLS G2 RSA CA OCSP 04
```

The certificate was trusted and the website loaded normally.

### Result

```text
google.com             -> PASS
microsoft.com          -> PASS
word.cloud.microsoft   -> FAIL
```

This was important because it showed that the problem did not affect every Microsoft domain.

The investigation could therefore be narrowed further.

---

## 5. Investigating DNS

One possible explanation was incorrect or manipulated DNS resolution.

I first queried the system-configured DNS server:

```bash
nslookup word.cloud.microsoft
```

The local ISP DNS server returned a chain involving Microsoft's traffic management infrastructure and ultimately:

```text
172.171.91.252
```

I then queried Google's public DNS server directly:

```bash
nslookup word.cloud.microsoft 8.8.8.8
```

Google DNS returned Microsoft's WAC/MS Edge infrastructure and addresses including:

```text
52.108.9.12
52.108.8.12
```

along with IPv6 addresses.

The DNS responses were different, but this does not automatically indicate malicious activity.

Large cloud services commonly use:

* Geographic load balancing
* CDNs
* Traffic managers
* Anycast
* Regional endpoints
* IPv4/IPv6 routing

Both responses pointed toward Microsoft-related infrastructure.

Therefore, DNS remained a consideration but there was not enough evidence to identify it as the root cause.

---

## 6. Testing TLS Outside Chrome Using curl

The next step was to determine whether the problem occurred outside Chrome.

I used:

```bash
curl -Iv https://word.cloud.microsoft
```

The connection succeeded.

Relevant output included:

```text
Host word.cloud.microsoft:443 was resolved.

Trying [IPv6 address]:443...

Established connection to word.cloud.microsoft

HTTP/1.1 301 Moved Permanently

Location: /en-us/
```

The response also contained Microsoft-specific headers such as:

```text
X-MSEdge-Ref
```

### Why This Test Was Important

If the operating system/network could establish a valid TLS connection but Chrome could not, the problem was less likely to be:

* General Internet connectivity
* Microsoft being completely unavailable
* A system-wide TLS failure
* A general DNS failure

The troubleshooting scope could now be narrowed toward Chrome.

At this point:

```text
                  word.cloud.microsoft
                          |
              +-----------+-----------+
              |                       |
             curl                   Chrome
              |                       |
             PASS                    FAIL
              |                       |
              +-----------+-----------+
                          |
                  Investigate Chrome
```

---

## 7. Testing Chrome Incognito Mode

To determine whether the issue was associated with the normal Chrome profile, I opened an Incognito window:

```text
Ctrl + Shift + N
```

I then accessed:

```text
https://word.cloud.microsoft/en-us/
```

The website loaded successfully.

The resulting Microsoft service certificate was valid and trusted.

### Result

```text
Normal Chrome Profile    -> FAIL
Incognito Chrome         -> PASS
curl                     -> PASS
```

This was a major clue.

Incognito mode normally starts with a more isolated browser environment and disables most extensions unless they have explicitly been permitted to run in Incognito.

Therefore, browser extensions became a strong suspect.

---

## 8. Investigating Chrome Extensions

I opened:

```text
chrome://extensions/
```

The installed extensions included:

```text
Adobe Acrobat
Google Docs Offline
McAfee WebAdvisor
```

McAfee WebAdvisor was enabled in the normal Chrome profile.

Because security/browser-protection extensions can inspect or modify browser traffic, I tested whether WebAdvisor was associated with the certificate issue.

Importantly, I did **not** uninstall the extension immediately.

Instead, I disabled it temporarily so that only one variable changed during the test.

---

## 9. Testing the McAfee WebAdvisor Hypothesis

I disabled:

```text
McAfee WebAdvisor
```

I then closed the failed Microsoft Word tab, opened a new normal Chrome tab, and accessed the website again.

The website loaded successfully.

### Before

```text
McAfee WebAdvisor
       ON
        |
        v
word.cloud.microsoft
        |
        v
Untrusted/self-signed certificate observed
        |
        v
NET::ERR_CERT_AUTHORITY_INVALID
        |
        v
Connection blocked
```

### After

```text
McAfee WebAdvisor
       OFF
        |
        v
word.cloud.microsoft
        |
        v
Valid Microsoft TLS connection
        |
        v
Website loads successfully
```

This isolated the problem to behavior associated with McAfee WebAdvisor in the normal Chrome profile.

---

## 10. Root Cause Isolation

The investigation produced the following results:

| Test                       | Result                                     |
| -------------------------- | ------------------------------------------ |
| Google HTTPS               | PASS                                       |
| Microsoft.com HTTPS        | PASS                                       |
| Word in normal Chrome      | FAIL                                       |
| Certificate inspection     | Self-signed/untrusted certificate observed |
| DNS resolution             | Microsoft-related infrastructure returned  |
| `curl` HTTPS request       | PASS                                       |
| Chrome Incognito           | PASS                                       |
| Chrome normal profile      | FAIL                                       |
| McAfee WebAdvisor enabled  | FAIL                                       |
| McAfee WebAdvisor disabled | PASS                                       |

The evidence strongly associated the certificate validation failure with **McAfee WebAdvisor's browser integration**.

The exact internal mechanism used by WebAdvisor was not independently verified, so it would be inaccurate to claim definitively that WebAdvisor generated or intercepted the certificate.

The defensible conclusion is:

> The TLS validation failure occurred while McAfee WebAdvisor was enabled and disappeared when the extension was disabled. Testing therefore isolated WebAdvisor as the component associated with the issue.

---

## 11. Resolution

Temporarily disabling McAfee WebAdvisor restored access to Microsoft Word for the Web.

This disabled the WebAdvisor Chrome extension but did not necessarily disable other McAfee security components such as:

* Antivirus scanning
* Real-time malware protection
* Other endpoint security capabilities

A longer-term resolution would involve investigating the WebAdvisor installation/configuration, checking for updates, or reinstalling/troubleshooting the affected component rather than weakening Chrome's TLS validation.

---

## 12. Why the Certificate Warning Was Not Bypassed

An important security decision during troubleshooting was **not attempting to bypass the certificate warning**.

The browser expected:

```text
Microsoft Website
       |
       v
Trusted Certificate Authority
       |
       v
Valid TLS Connection
```

Instead, the affected Chrome session received an untrusted certificate.

Blindly trusting or manually installing that certificate would remove an important security control without understanding why the unexpected certificate was being presented.

Additionally, HSTS correctly prevented Chrome from allowing an insecure exception.

---

## 13. Security Concepts Demonstrated

This troubleshooting exercise involved several security and networking concepts.

### TLS Certificate Validation

A browser must establish a chain of trust from the website's certificate to a trusted Certificate Authority.

### Certificate Authorities

Trusted CAs allow browsers to verify that certificates presented by websites are legitimate.

### Self-Signed Certificates

A self-signed certificate signs itself rather than chaining to an independently trusted CA.

They can be appropriate in controlled environments but should not unexpectedly appear for public services such as Microsoft 365.

### HSTS

HTTP Strict Transport Security instructs browsers to use HTTPS and prevents users from easily bypassing certain certificate errors.

### DNS Troubleshooting

`nslookup` was used to compare name resolution using the ISP DNS server and Google Public DNS.

### HTTP/TLS Testing

`curl` was used to determine whether HTTPS connectivity worked independently of Chrome.

### Environment Isolation

Chrome Incognito mode provided a cleaner environment that helped distinguish a browser-profile/extension problem from a system-wide network problem.

### Hypothesis-Driven Troubleshooting

Rather than immediately reinstalling software or changing security settings, each test reduced the number of possible causes.

---

## 14. Troubleshooting Methodology

The most important lesson from this incident was the troubleshooting process itself.

```text
Observe the error
       |
       v
Inspect certificate
       |
       v
Identify abnormal trust chain
       |
       v
Test unrelated HTTPS site
       |
       v
Test another Microsoft site
       |
       v
Investigate DNS
       |
       v
Test TLS outside browser with curl
       |
       v
Compare normal vs Incognito Chrome
       |
       v
Inspect extensions
       |
       v
Disable suspected extension
       |
       v
Retest
       |
       v
Problem isolated
```

Each test answered a specific question rather than making unrelated configuration changes.

For example:

```text
Does HTTPS generally work?
        |
       YES
        |
        v
Is Microsoft generally affected?
        |
       NO
        |
        v
Does the endpoint work outside Chrome?
        |
       YES
        |
        v
Does it work in isolated Chrome?
        |
       YES
        |
        v
What differs between Chrome environments?
        |
        v
Extensions
        |
        v
Test extensions individually
```

---

## 15. Commands Used

### DNS lookup using configured DNS server

```bash
nslookup word.cloud.microsoft
```

### DNS lookup using Google Public DNS

```bash
nslookup word.cloud.microsoft 8.8.8.8
```

### Test HTTPS/TLS connectivity

```bash
curl -Iv https://word.cloud.microsoft
```

### Chrome Extensions

```text
chrome://extensions/
```

### Chrome Incognito

```text
Ctrl + Shift + N
```

---

## Key Takeaways

* `NET::ERR_CERT_AUTHORITY_INVALID` should be investigated rather than bypassed.
* Certificate inspection can reveal whether the expected chain of trust is being presented.
* A valid certificate on other websites helps rule out system-wide trust-store problems.
* `curl` is useful for separating browser problems from network/TLS connectivity problems.
* Incognito mode can help isolate Chrome profile and extension issues.
* Security software and browser extensions can affect HTTPS behavior.
* DNS responses from large cloud providers may differ because of distributed infrastructure.
* HSTS provides valuable protection against bypassing certificate errors.
* Change one variable at a time during troubleshooting.
* Avoid claiming a root-cause mechanism that has not actually been demonstrated.

## Final Finding

The Microsoft Word web application failed in the normal Chrome profile with:

```text
NET::ERR_CERT_AUTHORITY_INVALID
```

Certificate inspection revealed an unexpected self-signed certificate. Network, DNS, general certificate validation, and Microsoft connectivity were progressively tested.

The application worked through `curl` and Chrome Incognito mode, narrowing the issue to the normal Chrome environment.

Disabling McAfee WebAdvisor caused the application to load successfully.

Therefore, the troubleshooting process isolated **McAfee WebAdvisor as the component associated with the TLS certificate validation failure**, while avoiding unsupported assumptions about its exact internal certificate-handling mechanism.
