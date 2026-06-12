# Security

## Threat model in one paragraph

The gateway binds to `127.0.0.1` and is the only component holding provider
credentials and durable memory. The extension content script runs under
`<all_urls>`, so **web pages are treated as hostile**: requests to the gateway
require a pairing token (constant-time compared), cross-site `Origin`s are
rejected, request bodies are content-type- and size-guarded, `/config`
provider routes are validated against endpoint/adapter allow-rules, and
page-readable diagnostics plus page-event control channels only exist in dev
mode. Gateway modules are excluded from `web_accessible_resources`.

## Privacy contract

Learning events leave the browser with hashed URL/title metadata; logs and
diagnostics redact endpoints and never carry tokens or raw page text. The
README privacy section documents the one deliberate exception (explain
requests carry the trimmed fragment being explained). Tests under `test/`
(privacy, redaction, characterization) enforce this contract — treat them as
normative.

## Reporting a vulnerability

Open a GitHub security advisory (Security → "Report a vulnerability") on this
repository, or a private issue if advisories are unavailable. Please include
a reproduction. Since the gateway is local-only, the most valuable reports
are: pairing/origin-guard bypasses, prompt-injection paths that persist
attacker-controlled memory, and anything that leaks tokens or raw page
content into logs, diagnostics, or provider requests.
