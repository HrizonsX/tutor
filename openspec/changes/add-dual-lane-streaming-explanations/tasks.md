## 1. Streaming Contracts And Test Fixtures

- [x] 1.1 Define lane ids, stream event kinds, session ids, sequence fields, and final lane result shapes in the shared browser/runtime contract area.
- [x] 1.2 Add tests for valid stream event ordering: `session_start`, lane lifecycle events, lane deltas, lane finals, and `session_done`.
- [x] 1.3 Add tests proving browser-provided memory fields are ignored for streaming sessions.
- [x] 1.4 Add fixtures for direct lane, association lane with one bridge, association lane with multiple bridges, no bridge, weak candidates only, and canceled sessions.

## 2. Provider Adapter Streaming

- [x] 2.1 Add an OpenAI-compatible plain-text streaming chat method for explanation lanes without changing existing structured JSON methods.
- [x] 2.2 Parse provider streaming chunks into ordered internal text delta events and accumulated final text.
- [x] 2.3 Add lane-specific prompt builders for direct explanation and association explanation.
- [x] 2.4 Enforce association prompt constraints: explain relationships, label recalled concepts as local learning context, expand at most three bridges, mention overflow briefly, and end with a concise summary.
- [x] 2.5 Normalize streaming provider auth, rate limit, unsupported model, malformed stream, timeout, and unavailable failures.
- [x] 2.6 Add provider adapter tests for direct deltas, association deltas, stream completion metadata, and streaming failure normalization.

## 3. Gateway And Runtime Streaming Orchestration

- [x] 3.1 Add a paired local gateway streaming endpoint or equivalent protocol action for dual-lane explanation sessions.
- [x] 3.2 Advertise streaming explanation capability in gateway health or capability discovery.
- [x] 3.3 Implement direct lane orchestration that bypasses runtime memory recall and starts provider streaming immediately.
- [x] 3.4 Implement association lane recall in parallel with direct streaming using runtime-owned memory query and active bridge policy.
- [x] 3.5 Finalize association lane as `no_memory_bridge` or `weak_candidates_only` without provider dispatch when no reliable bridge is available.
- [x] 3.6 Build association provider requests from selected runtime memory bridges and bounded display groups.
- [x] 3.7 Wrap successful lane output in stable Agent result metadata, including lane id, target, provider metadata, version metadata, and runtime recall metadata where applicable.
- [x] 3.8 Implement gateway-side stream cancellation and late-work cleanup.
- [x] 3.9 Add gateway/runtime tests for direct-before-recall behavior, multi-bridge association formatting inputs, no-association final state, structured lane failures, and existing `/explain` compatibility.

## 4. Background Streaming Mediation

- [x] 4.1 Add local gateway client support for reading streaming response events from the paired gateway.
- [x] 4.2 Add a long-lived background-to-content stream channel for explanation sessions.
- [x] 4.3 Preserve pairing-token handling inside background and prevent provider secrets from reaching content.
- [x] 4.4 Forward lane events to the originating content context with session id, sequence, event kind, and lane metadata intact.
- [x] 4.5 Implement cancellation from content to background and abort the gateway stream when possible.
- [x] 4.6 Fall back to the existing non-stream explain path when streaming capability is unavailable.
- [x] 4.7 Add background service tests for event forwarding, gateway failure normalization, cancellation, fallback, and no browser-local memory usage.

## 5. Content And Overlay Experience

- [x] 5.1 Add content-side stream session lifecycle management with request ids, stale-event filtering, and feature-disable cleanup.
- [x] 5.2 Render a two-lane overlay prompt with independent direct and association output areas.
- [x] 5.3 Show association pending state while recall is running.
- [x] 5.4 Show recall indicators for bounded bridge names when reliable associations are found.
- [x] 5.5 Show no-association copy when association final reason is `no_memory_bridge` or `weak_candidates_only`.
- [x] 5.6 Render multi-bridge association text with readable section boundaries while keeping the card low-interruption.
- [x] 5.7 Preserve dismissal, feedback, regeneration, and close behavior while streaming is active.
- [x] 5.8 Add content and overlay tests for lane deltas, independent lane updates, no-association display, multiple bridge display, cancellation, and late-event suppression.

## 6. Diagnostics, Logging, And Documentation

- [x] 6.1 Extend diagnostics with last streaming session state, lane statuses, normalized lane failure reasons, and recall counts without exposing secrets or raw memory.
- [x] 6.2 Add product-oriented gateway/background logs for stream session start, lane final, lane error, and cancellation.
- [x] 6.3 Update README or local development notes with streaming capability behavior, fallback behavior, and troubleshooting tips.
- [x] 6.4 Ensure logs and diagnostics keep provider tokens, pairing tokens, full page text, and raw memory payloads redacted.

## 7. Verification

- [x] 7.1 Run targeted provider adapter, gateway, background, content, overlay, and diagnostics tests.
- [x] 7.2 Run the full `npm test` suite and fix regressions.
- [x] 7.3 Smoke-test gateway startup with streaming disabled/fallback and streaming enabled.
- [x] 7.4 Browser-smoke the visible two-lane overlay, no-association state, multi-bridge association state, and stream cancellation.
- [x] 7.5 Run `openspec validate add-dual-lane-streaming-explanations --strict` and resolve all issues.
