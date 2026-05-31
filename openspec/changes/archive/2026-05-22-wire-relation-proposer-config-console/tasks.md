## 1. Runtime Config Model

- [x] 1.1 Add runtime config schema/defaults for browser-local settings, gateway-owned settings, hot-update metadata, and restart-required field metadata.
- [x] 1.2 Add relation proposer provider role config with disabled, reuse-explain-provider, and independent-provider modes.
- [x] 1.3 Add config validation, merge, redaction, and secret-presence helpers shared by diagnostics and config APIs.
- [x] 1.4 Add persistent mutable gateway config storage loaded after environment startup defaults.
- [x] 1.5 Add tests for config merging, validation failures, redaction, token presence, and restart-required field classification.

## 2. Gateway Config API

- [x] 2.1 Add paired gateway config read and update endpoints or equivalent protocol actions.
- [x] 2.2 Enforce local pairing on config read/update without exposing config data to unpaired callers.
- [x] 2.3 Apply provider, relation proposer, recall policy, and report policy hot-updates to the next relevant gateway request.
- [x] 2.4 Reject or mark restart-required updates for host, port, memory store mode/path, schema version, and destructive maintenance fields.
- [x] 2.5 Invalidate provider health/config caches after successful hot updates.
- [x] 2.6 Add gateway tests for config read, valid update, invalid update, pairing rejection, redaction, and restart-required reporting.

## 3. Browser Config Console

- [x] 3.1 Add background message types and service handlers for config read and update.
- [x] 3.2 Persist browser-local settings such as overlay enablement, behavior thresholds, inference thresholds, composer limits, privacy limits, and local gateway connection config.
- [x] 3.3 Forward gateway-owned provider, relation proposer, and memory strategy settings to the paired gateway instead of storing provider secrets in content scripts.
- [x] 3.4 Replace the read-only options dashboard with editable sections for general, provider, relation proposer, local gateway, memory, diagnostics, and privacy settings.
- [x] 3.5 Broadcast or expose browser-local policy updates so active content scripts use new settings before the next evaluation.
- [x] 3.6 Add options/background tests for loading effective config, saving config, rendering redacted secrets, and refreshing diagnostics after save.

## 4. Provider Runtime Hot Updates

- [x] 4.1 Refactor gateway provider runtime to read the latest config reference per explain, rewrite, embedding, and relation proposer dispatch.
- [x] 4.2 Ensure explain provider updates affect the next `/explain` and `/rewrite` request without gateway restart.
- [x] 4.3 Ensure embedding provider updates affect the next `/embedding` request without gateway restart.
- [x] 4.4 Preserve structured unavailable results for disabled, off, missing endpoint, missing path, invalid adapter, and unsupported structured output modes.
- [x] 4.5 Add tests proving provider endpoint, token, model, timeout, and structured output updates are used on the next request.

## 5. Relation Proposer Dispatch

- [x] 5.1 Add adapter/client support for dispatching relation proposal requests through reuse-explain-provider and independent relation proposer modes.
- [x] 5.2 Wire scheduled relation discovery after successful provider persistence to pass a configured relation proposer into `runRelationDiscovery`.
- [x] 5.3 Validate relation proposer JSON and map parse or schema failures into non-blocking relation discovery errors.
- [x] 5.4 Gate every returned relation candidate before persistence and keep weak daily-summary inference as candidate unless evidence is strong enough.
- [x] 5.5 Preserve current behavior when relation proposer is disabled or unavailable: no fabricated candidates and no failed explanation response.
- [x] 5.6 Add tests proving real gateway `/explain` success can produce gated relation proposals and later `memoryBridges`.

## 6. Memory Recall And Diagnostics

- [x] 6.1 Ensure memory queries continue returning empty `memoryBridges` when no active relations exist.
- [x] 6.2 Ensure active gated relations produce bounded `memoryBridges` and `relatedMemories` in later memory packets.
- [x] 6.3 Add relation proposer diagnostics for enabled state, role mode, model name, token presence, backlog, cache hits/misses, last run, and last error.
- [x] 6.4 Add runtime config diagnostics for config version, last update status, hot-update class, validation failures, and restart-required attempts.
- [x] 6.5 Verify diagnostics and exported snapshots redact tokens, secret endpoint query parameters, raw event payloads, full page text, and evidence snippets.

## 7. End-To-End Verification

- [x] 7.1 Run unit and integration tests covering config helpers, gateway config API, options/background config flow, provider hot updates, relation proposer dispatch, and memory bridge recall.
- [x] 7.2 Add or update Chrome/browser automation smoke coverage for editing provider/relation proposer config from options without restarting the gateway.
- [x] 7.3 Add an end-to-end scenario where a first provider-backed explanation schedules relation discovery and a later explanation receives `memoryBridges`.
- [x] 7.4 Update README or developer docs to describe browser-managed config, hot-update limits, relation proposer setup, and restart-required settings.
