## Context

Gateway / Local Agent Runtime already normalizes browser `/explain` requests, queries the Local Memory Store, injects active `memoryBridges`, dispatches to the provider, persists successful explanations, and schedules relation discovery. The relation discovery implementation can select day blocks, cache proposal output, gate relation candidates, and persist active/candidate/rejected relation records. The missing production link is that the scheduled path calls `runRelationDiscovery({ canonicalName })` without a configured `relationProposer`, which means the default proposal output is empty and no active relation is created for later explanations.

Provider routing is also mostly fixed at startup. `createGatewayRuntimeConfig()` reads environment variables, `scripts/local-gateway-dev.js` creates `providerRuntime` once, and `createGatewayProviderRuntime()` closes over the resulting config. Meanwhile the browser options page already looks like a configuration console, but it only reads diagnostics and health snapshots.

## Goals / Non-Goals

**Goals:**

- Make real gateway `/explain` and `/rewrite` success paths able to schedule LLM-backed relation proposals.
- Keep relation proposals asynchronous and non-blocking for the primary explanation request.
- Gate every LLM relation proposal before it can become active memory.
- Add browser options/background/gateway configuration read and update flows.
- Hot-update provider routing, relation proposer settings, recall limits, and intervention strategy settings for the next request or next browser evaluation.
- Redact tokens and secret-bearing endpoints in diagnostics, health, and exported snapshots.
- Preserve runtime ownership of memory, relation discovery, and provider credentials.

**Non-Goals:**

- No browser-owned memory graph, relation proposal cache, or daily summary cache.
- No direct active relation writes from ungated LLM output.
- No automatic hot update guarantee for gateway listener host/port, memory store mode/path, SQLite schema version, or destructive memory maintenance.
- No requirement to backfill historical relations from old events in the first implementation.
- No replacement for the rule-based `memory_edges` work in `add-memory-association-linker`.

## Decisions

### Add a runtime configuration control plane

Introduce a small runtime configuration API surface with three layers:

1. Browser options stores browser-local connection and UI policy values in extension storage.
2. Background exposes config read/update messages and forwards gateway-owned settings to the paired gateway.
3. Gateway persists mutable runtime configuration and validates updates before applying them.

The gateway should return config metadata such as `configVersion`, `updatedAt`, `hotUpdateStatus`, and redacted role state. Provider tokens may be entered in the browser UI and sent to the paired localhost gateway, but they should be persisted by the gateway and never returned in diagnostics or exported snapshots.

Alternative considered: keep all provider settings in Chrome storage and have the browser forward them on every request. That would make the browser own runtime secrets and provider routing, weakening the existing stateless memory/runtime boundary.

### Classify hot updates by resource risk

Treat settings as one of three classes:

- Browser-evaluation hot updates: overlay enablement, inference thresholds, cooldowns, behavior thresholds, composer limits, and local gateway connection settings.
- Gateway next-request hot updates: explain/rewrite/embedding provider routing, relation proposer routing, structured output mode, timeouts, recall limits, relation proposal concurrency, bridge caps, report limits, and forgetting window.
- Restart or maintenance settings: gateway host/port, memory store mode/path, schema version, migrations, destructive memory clearing, and listener-level security choices.

The UI can show restart-required settings, but ordinary save actions should not promise immediate effect for them.

Alternative considered: make every setting hot-updatable. That would require socket rebinding, store reopening, and migration orchestration in the same change, increasing risk around memory durability and gateway availability.

### Resolve provider runtime from current config per request

Refactor provider runtime so dispatch reads the latest gateway config reference when handling explain, rewrite, embedding, or relation proposal calls. The provider adapter client can still be created per request because it is lightweight and already validates provider role configuration. Health caches must be invalidated when relevant config changes.

Alternative considered: recreate the whole gateway handler on each config update. That is simpler conceptually, but awkward for an already-running HTTP server and easy to get wrong around in-flight requests.

### Add a relation proposer role

Relation proposer configuration should support:

- `enabled`
- `provider` / `adapter`
- `endpoint`
- `token`
- `modelName`
- `chatPath`
- `structuredOutput`
- `timeoutMs`
- `reuseExplainProvider`

When `reuseExplainProvider` is true, relation proposal uses the current explain role routing with relation-proposal-specific schema and prompt construction. When false, it uses its independent role config. When disabled or unavailable, relation discovery records a skipped/degraded state and leaves active relations unchanged.

Alternative considered: always reuse explain provider. That is a useful default, but relation proposal can be more expensive or require a different model/temperature, so it should be independently configurable.

### Keep relation discovery asynchronous and gated

After a successful provider result is persisted, the runtime schedules relation discovery for the target. The scheduled worker builds day blocks from runtime daily summaries, invokes the configured relation proposer, validates structured JSON, and passes every candidate through `gateRelationProposal()` before upsert.

The first explanation remains fast and may not use newly proposed bridges. Later explanations can retrieve active relations as `memoryBridges`. If relation proposal fails, explanation persistence remains successful and diagnostics expose the relation proposer error.

Alternative considered: block `/explain` until relation proposal completes. That maximizes first-turn continuity but adds latency and makes optional memory enrichment part of the critical path.

### Use diagnostics as the user-facing safety rail

Diagnostics should distinguish:

- Provider capability status
- Relation proposer enabled/routing status
- Relation discovery backlog/cache/last error
- Config version and last successful update
- Unsupported hot-update attempts

Diagnostics must not reveal provider tokens, pairing tokens, raw event payloads, full page text, or evidence snippets.

Alternative considered: only update the options form and rely on health. Health alone is not enough to explain why relation discovery is idle, disabled, skipped, cached, or failing validation.

## Risks / Trade-offs

- Relation proposer creates noisy associations -> Gate all proposals, cap bridge injection, and keep weak inference as candidate unless evidence basis is strong.
- Provider token exposure through UI flows -> Send secrets only to the paired localhost gateway, persist them runtime-side, and return only token presence.
- Config update breaks provider calls -> Validate before commit when possible, use versioned updates, invalidate health cache, and keep previous config on validation failure.
- In-flight requests see mixed config -> Accept next-request consistency; do not attempt transactional reconfiguration across active requests.
- Browser and gateway configs drift -> Include config version and endpoint identity in diagnostics, and refresh the options page after saves.
- Relation proposer cost grows -> Use day selection, cache keying by target/day summary/proposer version, concurrency limits, and disabled-by-default or explicit enablement.

## Migration Plan

1. Add runtime config schema defaults and redaction helpers without changing current startup behavior.
2. Add gateway config read/update endpoints and persist mutable config with existing env config as startup defaults.
3. Add background messages and options UI forms for browser-local and gateway-owned config.
4. Refactor provider runtime to read current config per request and invalidate health cache after updates.
5. Add relation proposer provider role dispatch and wire it into scheduled relation discovery.
6. Add diagnostics fields for config and relation proposer state.
7. Keep existing env variables as boot defaults and document that UI-saved config overrides startup defaults until reset.
8. Roll back by disabling relation proposer and ignoring saved mutable config; raw memory events and explanation versions remain valid.

## Open Questions

- Should relation proposer be disabled by default until the user configures a real provider, or enabled by default when explain provider is enabled?
- Should the options UI expose restart-required settings as read-only diagnostics or editable maintenance controls?
- Should gateway config persistence live in the memory directory or a separate config directory?
- Should relation proposal run after selected-term/encounter events with enough context, or only after successful provider explanations in the first implementation?
