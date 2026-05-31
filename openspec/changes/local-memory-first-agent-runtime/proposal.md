## Why

The product value is shifting from "call a model to explain a term" to a local, durable learning memory system that decides when and how explanation should happen. The browser extension must remain a stateless sensing and display layer, while the Local Agent Runtime becomes the only intelligent entrypoint for filtering, memory retrieval, decision policy, provider calls, and memory updates.

## What Changes

- **BREAKING**: Browser extension code SHALL NOT persist, cache, derive, or query long-term memory, explanation history, user profile, concept familiarity, retrieval packets, memory summaries, or memory vectors.
- **BREAKING**: Browser-originated explain/rewrite requests become stateless current-interaction requests; any browser-provided memory/profile fields are ignored by the runtime.
- Add a Runtime explain pipeline that performs input filtering, context filtering, runtime memory retrieval, and decision policy before any provider call.
- Add policy outcomes that allow the runtime to return existing explanations, reject invalid/noisy requests, return degraded/unavailable responses, or call an external provider only when needed.
- Require provider-backed explanation generation to return validated structured JSON through the runtime provider adapter boundary.
- Require successful provider-backed explanations to be persisted by the Local Agent Runtime as explanation versions, raw memory events, and memory candidates before asynchronous summarization updates long-term derived memory.
- Upgrade the Local Memory Store contract to SQLite as the local durable source of truth for raw events, explanation versions, memory candidates, concept states, profile summary, retrieval summaries, and summarizer jobs.
- Preserve event-sourced memory: explain and feedback synchronous paths write raw evidence and candidates only; concept state, profile summary, and retrieval summaries are updated only by the Memory Summarizer.
- Keep the first-stage summarizer rule-based and in-process, with SQLite jobs/backlog tracking; future LLM summarization remains optional.

## Capabilities

### New Capabilities

- `runtime-explain-decision-policy`: Runtime-owned input/context filters, retrieval packet assembly, decision policy outcomes, LLM call gating, and post-explain write behavior.

### Modified Capabilities

- `local-agent-memory-gateway`: Clarify that the localhost gateway is the Local Agent Runtime HTTP boundary and the only intelligent entrypoint for plugin explain/rewrite/memory requests.
- `local-memory-store`: Require SQLite as the durable local memory source of truth and define the raw-event, explanation-version, candidate, derived-state, and jobs storage boundary.
- `learning-memory`: Clarify event-sourced raw evidence, memory candidates, summarizer-only long-term updates, evidence-backed concept state, and profile summary derivation.
- `agent-provider-architecture`: Move provider invocation behind runtime decision policy so LLM/provider calls are conditional, not the default explain path.
- `provider-adapter-structured-json`: Require runtime provider adapters to return validated structured JSON suitable for persisted explanation versions and memory candidates.
- `background-service-mediation`: Preserve background as a browser-side gateway client only; remove any durable memory or provider-context assembly responsibilities.
- `short-explanation-composer`: Treat composer/provider generation as one possible runtime decision outcome and require runtime-summarized memory context rather than browser memory context.
- `runtime-observability`: Report filter, decision, provider, store, and summarizer status without exposing raw memory, full page text, or secrets.

## Impact

- Affected runtime code: `src/local-gateway.js`, `src/local-memory-store.js`, `src/memory-repository.js`, `src/knowledge-agent.js`, `src/provider-adapters.js`, `src/agent-service.js`, `src/diagnostics.js`, and gateway startup scripts.
- Affected browser code: `src/content.js`, `src/background.js`, `src/provider-registry.js`, and overlay feedback plumbing, primarily to keep requests stateless and remove any memory-cache fallback assumptions.
- New runtime components: explain pipeline filters, decision policy, SQLite memory store adapter, schema migrations, jobs table/in-process worker, memory candidate writer, and summarizer processor.
- Dependency impact: add local SQLite support through `better-sqlite3`; SQLite FTS5 is used for local text lookup, while vector retrieval remains optional and deferred.
- API impact: `/explain`, `/rewrite`, `/memory/events`, `/memory/query`, `/health`, and diagnostics responses gain structured decision, memory freshness, persistence, and summarizer state metadata.
- Privacy impact: only minimal current context and sanitized summarized memory may reach provider calls; raw events, full page text, profile internals, provider tokens, and pairing tokens stay local and redacted.
