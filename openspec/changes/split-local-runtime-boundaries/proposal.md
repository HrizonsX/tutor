## Why

`src/local-gateway.js` currently acts as the HTTP gateway, Agent Runtime host, Provider Runtime, runtime provider config loader, and direct Local Memory Store client. This keeps local startup simple, but it blurs ownership boundaries and makes provider routing, memory persistence, explanation decisions, summarization, and HTTP protocol behavior harder to test or replace independently.

This change preserves the same local deployment model and endpoint surface while splitting the gateway into explicit local runtime modules: Gateway HTTP API, Local Agent Runtime, Memory Runtime, Provider Runtime, and runtime configuration.

## What Changes

- Narrow the Local Gateway HTTP API to request authentication, routing, JSON request/response handling, HTTP status mapping, and redacted request logging.
- Introduce a Local Agent Runtime assembly boundary that owns explain/rewrite decision flow, runtime memory injection, provider invocation orchestration, and provider-result persistence hooks.
- Introduce a Memory Runtime boundary over the existing Local Memory Store so HTTP gateway code no longer reads or writes `local-memory-store.js` directly.
- Move provider adapter dispatch, provider role validation, provider timeout handling, provider capability reporting, and provider role diagnostics into a Provider Runtime module.
- Make `runtime-config.js` the single source of gateway runtime provider defaults and remove duplicated provider default configuration from `local-gateway.js`.
- Preserve current gateway endpoint shapes, response contracts, redaction behavior, memory capability semantics, provider configuration semantics, and development stub behavior.
- Add tests that assert module boundaries and unchanged protocol behavior without requiring independent processes or a new deployment mode.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `local-agent-memory-gateway`: Clarify that the localhost gateway is the HTTP API boundary and delegates Agent, Memory, and Provider responsibilities to runtime modules instead of directly owning store and adapter internals.
- `provider-configuration`: Require `runtime-config.js` or equivalent runtime configuration code to be the single source of provider role defaults consumed by Provider Runtime.
- `local-memory-store`: Clarify that gateway memory endpoints use Local Memory Store through Memory Runtime or an equivalent runtime-owned memory interface.
- `runtime-observability`: Preserve redacted health, diagnostics, and logging while reporting runtime subcomponent state through the runtime boundary.

## Impact

- Affected code: `src/local-gateway.js`, `src/runtime-config.js`, `src/runtime-explain-pipeline.js`, `src/local-memory-store.js`, `src/provider-adapters.js`, `scripts/local-gateway-dev.js`, and gateway/runtime tests.
- Expected new modules: `src/local-agent-runtime.js`, `src/memory-runtime.js`, and `src/provider-runtime.js` or equivalent names following repository conventions.
- Public HTTP APIs are intended to remain compatible: `/health`, `/config`, `/explain`, `/rewrite`, `/embedding`, `/memory/events`, and `/memory/query`.
- No new external service, database, queue, browser permission, or standalone process is required.
