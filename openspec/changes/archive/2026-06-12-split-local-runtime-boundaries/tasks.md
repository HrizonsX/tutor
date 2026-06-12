## 1. Provider Runtime Boundary

- [x] 1.1 Add Provider Runtime unit tests covering explain, rewrite, embedding, and relation proposer dispatch with current behavior expectations.
- [x] 1.2 Move `createGatewayProviderRuntime` and provider dispatch helpers from `src/local-gateway.js` into `src/provider-runtime.js`.
- [x] 1.3 Move provider role validation, capability calculation, provider role diagnostics, unavailable-provider result construction, and provider timeout handling into Provider Runtime.
- [x] 1.4 Update Provider Runtime to consume provider defaults and merge helpers from `src/runtime-config.js`.
- [x] 1.5 Remove duplicated provider default configuration and duplicate helper implementations from `src/local-gateway.js`.

## 2. Memory Runtime Boundary

- [x] 2.1 Add Memory Runtime tests for health, event write, memory query, config update, relation discovery scheduling, and close/dispose delegation.
- [x] 2.2 Add `src/memory-runtime.js` as a thin runtime-owned interface over the existing Local Memory Store.
- [x] 2.3 Route memory event writes, memory queries, memory health, memory config updates, and relation discovery scheduling through Memory Runtime.
- [x] 2.4 Preserve existing Local Memory Store behavior, persistence semantics, summarizer behavior, and redacted health shape.

## 3. Local Agent Runtime Boundary

- [x] 3.1 Add Local Agent Runtime tests showing explain/rewrite requests query memory, run decision policy, call Provider Runtime only when needed, and persist results through Memory Runtime.
- [x] 3.2 Add `src/local-agent-runtime.js` to compose runtime explain pipeline, Memory Runtime, Provider Runtime, runtime config state, and optional stub handlers.
- [x] 3.3 Move explain/rewrite pipeline construction out of the HTTP gateway and into Local Agent Runtime.
- [x] 3.4 Implement Local Agent Runtime methods for health, config read/update, explain, rewrite, embedding, memory event write, and memory query.
- [x] 3.5 Ensure memory cognitive policy hot updates are applied through Memory Runtime rather than direct store calls from gateway code.

## 4. Gateway HTTP Refactor

- [x] 4.1 Refactor `createLocalGatewayHandler` so it accepts a Local Agent Runtime object and delegates endpoint behavior after auth and JSON parsing.
- [x] 4.2 Preserve pairing rejection, method rejection, HTTP status mapping, JSON serialization, and unsupported-capability behavior.
- [x] 4.3 Keep `startLocalGatewayServer` focused on HTTP server lifecycle and redacted inbound request logging.
- [x] 4.4 Preserve compatibility exports from `src/local-gateway.js` for existing tests and scripts by re-exporting from new runtime modules where needed.
- [x] 4.5 Remove unused gateway-local memory injection helpers after Local Agent Runtime owns memory injection.

## 5. Startup And Observability

- [x] 5.1 Update `scripts/local-gateway-dev.js` to assemble runtime config state, Memory Runtime, Provider Runtime, Local Agent Runtime, and Local Gateway server explicitly.
- [x] 5.2 Preserve explicit development stub mode through Local Agent Runtime or an injected runtime handler.
- [x] 5.3 Update health and diagnostics aggregation so gateway health reports redacted runtime config, provider role state, capabilities, and memory repository state through runtime boundaries.
- [x] 5.4 Preserve redacted inbound gateway logging and provider adapter logging after moving implementation code.
- [x] 5.5 Add static boundary tests asserting `src/local-gateway.js` no longer imports Local Memory Store, Provider Adapter, or runtime explain pipeline implementation directly.

## 6. Verification

- [x] 6.1 Run provider runtime, gateway, runtime config, memory store, diagnostics, and agent service tests affected by the boundary split.
- [x] 6.2 Run the full test suite if targeted tests pass.
- [x] 6.3 Inspect `src/local-gateway.js`, `src/provider-runtime.js`, `src/memory-runtime.js`, and `src/local-agent-runtime.js` for dependency direction and compatibility exports.
- [x] 6.4 Update any OpenSpec task status or notes after implementation verification.
