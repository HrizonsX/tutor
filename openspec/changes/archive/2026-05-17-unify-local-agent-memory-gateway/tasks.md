## 1. Contracts And Configuration

- [x] 1.1 Replace provider kind contracts with `off`, `local`, `custom`, and `cloud` modes while preserving structured unavailable behavior.
- [x] 1.2 Add Agent capability constants and request kinds for health, explain, rewrite, embedding, memory event write, and memory query.
- [x] 1.3 Define stable Agent request and response validators, including schema version, capability kind, target identity, structured status, provider metadata, and diagnostics-safe error reasons.
- [x] 1.4 Extend runtime configuration for local gateway endpoint, pairing token storage key, health cache TTL, provider mode, and memory repository mode.

## 2. Provider Registry And Gateway Client

- [x] 2.1 Implement a provider registry that resolves the active provider from runtime config and returns mode, endpoint, credentials, capabilities, and unavailable reasons.
- [x] 2.2 Implement a localhost gateway client for health, explain, rewrite, embedding, memory event write, and memory query calls.
- [x] 2.3 Add pairing token handling for local gateway calls without exposing the token to content scripts or diagnostics output.
- [x] 2.4 Normalize provider errors for off mode, unreachable localhost service, pairing-required, pairing-rejected, timeout, rate-limit, invalid response, and unsupported capability.

## 3. Background Mediation

- [x] 3.1 Route existing explanation, regeneration, and embedding messages through the provider registry and unified Agent protocol.
- [x] 3.2 Add background message handlers for provider health refresh, diagnostics snapshot, memory event write, and memory query.
- [x] 3.3 Ensure content script clients only use runtime messaging and cannot directly call provider, localhost gateway, embedding, or memory repository endpoints.
- [x] 3.4 Preserve timeout, cache, rate-limit, privacy trimming, and structured error handling for all provider modes.

## 4. Memory Repository Boundary

- [x] 4.1 Define a memory repository interface for learning events, profile hints, explanation versions, agent summaries, graph relationships, vectors, and migrations.
- [x] 4.2 Wrap the existing IndexedDB/localStorage implementation in a browser-local repository adapter for fallback and migration.
- [x] 4.3 Implement a local gateway repository adapter that reads and writes memory through background-mediated localhost calls.
- [x] 4.4 Refactor learning memory and reading profile orchestration to depend on repository interfaces instead of direct IndexedDB, chrome.storage, or localStorage assumptions.
- [x] 4.5 Add repository-mediated migration support from browser-local memory into local gateway memory when local repository capability is available.

## 5. Localhost Agent/Gateway MVP

- [x] 5.1 Add a minimal local HTTP gateway service or development stub that binds to `127.0.0.1` and exposes health, explain, rewrite, embedding, memory event write, and memory query protocol shapes.
- [x] 5.2 Implement a simple local memory store for MVP testing with schema version, learning events, profile hints, explanation versions, summaries, graph edges, and optional vectors.
- [x] 5.3 Enforce MVP local pairing token checks in the gateway service or stub.
- [x] 5.4 Make unsupported local capabilities return structured unavailable responses instead of fabricated knowledge content.

## 6. Runtime Observability

- [x] 6.1 Add a diagnostics state module that records provider mode, health, capabilities, permission status, pairing status, memory repository status, last decision, suppression reasons, and last Agent result.
- [x] 6.2 Expose a read-only diagnostics snapshot to debug, popup, and options callers without triggering explanation generation or memory writes.
- [x] 6.3 Update content-side debug state to include normalized Agent and suppression summaries while avoiding secrets, full page text, and unsanitized memory.

## 7. Tests And Validation

- [x] 7.1 Add contract tests for provider modes, health/capability discovery, Agent request/response validation, and structured unavailable reasons.
- [x] 7.2 Add background tests proving content scripts do not call localhost gateway, provider endpoints, embedding APIs, or memory repository APIs directly.
- [x] 7.3 Add memory repository tests for browser fallback, local gateway adapter, migration, degraded-memory state, and cross-browser repository semantics.
- [x] 7.4 Add local gateway MVP tests for health, pairing token handling, memory event write, memory query, unsupported capabilities, and unavailable responses.
- [x] 7.5 Add diagnostics tests for provider status, permission status, pairing status, last decision, suppression reasons, last Agent result, and secret redaction.
- [x] 7.6 Run the full test suite and OpenSpec validation for `unify-local-agent-memory-gateway`.
