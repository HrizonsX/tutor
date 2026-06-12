## Context

The current local runtime already has the right product boundary: the browser extension talks to a paired localhost gateway, and the local runtime owns provider credentials, memory retrieval, explanation decisions, persistence, summarization, and relation discovery. The implementation boundary is less clear. `src/local-gateway.js` still imports Local Memory Store, creates the runtime explain pipeline, implements Provider Runtime dispatch, owns duplicated provider defaults, handles runtime config endpoints, and hosts HTTP server code.

The target is an in-process modular runtime, not a distributed service split. Local deployment should remain a single `npm run gateway:*` process for development and tests, while modules become independently testable and replaceable.

## Goals / Non-Goals

**Goals:**

- Keep the current HTTP endpoint surface and response contracts compatible.
- Make Local Gateway HTTP API responsible only for local protocol concerns: auth, routing, JSON, HTTP status mapping, and redacted request logging.
- Move Agent explain/rewrite orchestration behind a Local Agent Runtime boundary.
- Move provider role resolution, adapter dispatch, timeout handling, and provider diagnostics into Provider Runtime.
- Move direct Local Memory Store access behind Memory Runtime.
- Make `runtime-config.js` the only source of provider role defaults and runtime config merge/redaction helpers.
- Preserve explicit development stub mode and existing startup ergonomics.

**Non-Goals:**

- No new daemon, worker process, queue, database, cloud service, or browser permission.
- No redesign of SQLite schema, memory summarizer behavior, relation proposal semantics, or provider adapter schemas.
- No endpoint rename or request shape migration for browser extension callers.
- No behavior change to provider failure normalization, pairing, redaction, or memory privacy policy beyond the module ownership split.

## Decisions

### Decision: Split by runtime responsibility, not by process

Create or promote these in-process modules:

- `local-gateway`: HTTP handler and server.
- `local-agent-runtime`: explain/rewrite/embedding/memory/config orchestration surface consumed by the gateway.
- `memory-runtime`: runtime-owned memory interface over Local Memory Store.
- `provider-runtime`: provider role resolution, adapter dispatch, timeout handling, capability state, and provider role diagnostics.
- `runtime-config`: default config, config state, merge, validation, redaction, and hot-update classification.

Rationale: This keeps the operational simplicity of one local process while letting tests target runtime boundaries directly.

Alternative considered: split into independent local services immediately. That would create more realistic deployment boundaries, but it adds IPC, startup ordering, and health coordination before the module contracts are stable.

### Decision: Keep `local-gateway.js` as a compatibility entrypoint

Existing tests and scripts import gateway helpers from `src/local-gateway.js`. Preserve those exports where practical, but turn them into thin re-exports or wrappers around the new modules. The implementation should no longer live in that file when it belongs to provider, memory, or agent runtime.

Rationale: The architecture can improve without forcing a broad import migration in the same change.

Alternative considered: rename every import to the new modules immediately. That is cleaner in the final state, but increases churn and makes behavior regressions harder to isolate.

### Decision: Agent Runtime owns the intelligent request path

`local-agent-runtime` should create and own the runtime explain pipeline. It should receive a Memory Runtime and Provider Runtime, then expose methods such as `health`, `readConfig`, `updateConfig`, `explain`, `rewrite`, `createEmbedding`, `writeMemoryEvent`, and `queryMemory`.

Rationale: The gateway should not know whether `/explain` reuses memory, calls a provider, persists a version, schedules relation discovery, or returns degraded memory status. It should only delegate and serialize.

Alternative considered: leave explain pipeline construction in the gateway while moving only provider dispatch. That would reduce initial edits, but the gateway would still be coupled to explanation policy and memory lifecycle.

### Decision: Memory Runtime is a boundary over the existing store

The first Memory Runtime should wrap the current Local Memory Store rather than refactoring SQLite internals. It should expose the same needed operations: health, config update, event write, memory query, backlog processing, relation discovery scheduling, and close/dispose when present.

Rationale: This isolates gateway and agent code from store internals while keeping the risky storage implementation stable.

Alternative considered: split Local Memory Store internals at the same time. That would be attractive later, but it mixes architecture work with storage behavior work.

### Decision: Provider Runtime consumes runtime config per request

Provider Runtime should read effective runtime config through the current config state or a provided config getter for each dispatch. It should reuse existing adapter modules and validation behavior, and it should expose capabilities and provider role state from the same config source.

Rationale: This preserves hot-update behavior and avoids recreating gateway handlers after config updates.

Alternative considered: rebuild Provider Runtime on every config update. That is simple conceptually, but awkward for in-flight requests and unnecessary for lightweight adapter client creation.

### Decision: Runtime config owns provider defaults once

Provider role defaults and merge helpers should live in `runtime-config.js`. Gateway and Provider Runtime should import them or consume config state, not duplicate the constant.

Rationale: The existing duplicate defaults make relation proposer, structured output, timeout, and role settings easy to drift.

Alternative considered: keep the duplicate constant and add tests for equality. That catches drift later, but does not remove the source of drift.

## Risks / Trade-offs

- Import churn can hide behavior regressions -> Preserve public exports, move one responsibility at a time, and keep endpoint-level tests.
- Circular dependencies can appear between gateway, agent runtime, provider runtime, and config -> Make dependencies point inward: gateway depends on agent runtime interfaces, agent runtime depends on provider and memory runtime interfaces, provider runtime depends on config and adapters, memory runtime depends on store.
- Tests may overfit file names instead of behavior -> Prefer behavioral tests plus focused static boundary tests for forbidden direct imports.
- Runtime health could lose fields during aggregation -> Add tests comparing existing health/config/memory/provider fields before and after the split.
- Development stub could become a special case outside the runtime boundary -> Treat stubs as injected Agent Runtime handlers or a small runtime implementation, then keep HTTP handling unchanged.

## Migration Plan

1. Move provider runtime implementation and helper functions from `local-gateway.js` into `provider-runtime.js`, importing provider defaults from `runtime-config.js`.
2. Add `memory-runtime.js` as a thin wrapper around existing Local Memory Store creation and operations.
3. Add `local-agent-runtime.js` to compose runtime explain pipeline, Memory Runtime, Provider Runtime, runtime config, and stub handlers.
4. Refactor `createLocalGatewayHandler` to accept a runtime object and delegate endpoint behavior to it.
5. Keep `local-gateway.js` exports compatible by re-exporting helper constructors from the new modules where existing callers rely on them.
6. Update `scripts/local-gateway-dev.js` to assemble config state, memory runtime, provider runtime, agent runtime, and gateway server explicitly.
7. Add and update tests for unchanged endpoint behavior, config hot updates, provider dispatch, memory API behavior, startup script composition, and static module boundaries.

Rollback: keep the old endpoint behavior behind the compatibility exports during the refactor. If a new boundary fails, restore the previous composition while keeping `runtime-config.js` as the single provider default source.

## Open Questions

- Should the new runtime constructors live under flat `src/*.js` files first, or under a `src/runtime/` folder?
- Should `local-gateway.js` continue exporting memory store constructors long term, or should those re-exports be marked compatibility-only and removed in a future cleanup?
- Should static boundary tests assert exact forbidden imports, or should they assert allowed dependency directions by module group?
