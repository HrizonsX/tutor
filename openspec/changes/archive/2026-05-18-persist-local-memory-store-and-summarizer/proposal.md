## Why

The local gateway memory repository is specified as the shared source of truth, but the current gateway store is still process-local and disappears on restart. We need a persistent Local Memory Store plus an asynchronous summarization pipeline so raw learning events can become stable, evidence-backed user profile, concept state, and explanation preference context for future explanations.

## What Changes

- Add a persistent Local Memory Store owned by the Local Agent Runtime behind the gateway, with schema versioning, migrations, and restart-safe storage for raw learning events, profile events, explanation versions, summaries, graph edges, and optional vectors.
- Add an asynchronous Memory Summarizer that consumes raw event backlog and produces derived memory views with evidence event ids, timestamps, source metadata, and uncertainty.
- Split memory into immutable-ish raw event evidence and recomputable summarized views for user profile, concept/object state, related objects, and explanation preferences.
- Move memory retrieval and summarized context injection for explain/rewrite requests behind the Local Agent Runtime boundary.
- Keep the browser extension focused on event capture, background mediation, and overlay rendering; it must not own long-term summarization, raw memory search, or provider-context assembly when the local runtime is available.
- Preserve browser IndexedDB fallback and migration behavior for degraded/offline continuity, but keep it non-authoritative when local memory capability is available.
- Expose redacted health/diagnostics for store persistence, summarizer backlog, degraded memory states, and schema migration status.

## Capabilities

### New Capabilities
- `local-memory-store`: Persistent Local Agent Runtime memory storage and asynchronous summarization of raw learning events into evidence-backed memory views.

### Modified Capabilities
- `learning-memory`: Clarify raw-event storage, derived summary records, evidence requirements, migration behavior, and local runtime source-of-truth semantics.
- `local-agent-memory-gateway`: Require the gateway/runtime to expose persistent memory, summarizer, query, and injection capabilities without leaking raw private context.
- `background-service-mediation`: Keep background as the browser-side gateway client while preventing browser-owned memory summarization or explain-context assembly when local runtime memory is available.
- `short-explanation-composer`: Require explain/rewrite requests to consume runtime-injected summarized memory context as learning state rather than raw events or world knowledge.

## Impact

- Affected code: `src/local-gateway.js`, `src/memory-repository.js`, `src/memory.js`, `src/knowledge-agent.js`, `src/agent-service.js`, `src/provider-registry.js`, `src/diagnostics.js`, gateway startup scripts, and repository tests.
- Affected APIs: `/memory/events`, `/memory/query`, `/health`, `/explain`, `/rewrite`, and local gateway client memory methods.
- New runtime components: persistent store adapter, migration layer, summarizer queue/backlog processor, derived summary query builder, and diagnostics state for memory health.
- Possible dependency impact: likely local runtime storage support such as SQLite or an equivalent durable file-backed repository; embeddings remain optional.
- Privacy impact: raw events remain minimal and local; summarized memory injected into provider requests must be sanitized, evidence-backed, uncertainty-labeled, and never treated as authoritative world knowledge.
