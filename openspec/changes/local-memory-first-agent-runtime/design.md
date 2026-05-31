## Context

The current codebase has already moved toward a localhost gateway boundary: the browser sends current interaction data to the background worker, the background calls the local gateway, and the gateway can inject local memory before provider dispatch. The local memory implementation is still JSON snapshot / JSONL ledger based, and the explain path does not yet have a first-class runtime decision pipeline that can filter requests, reuse memory, gate LLM calls, and persist explanation output as runtime-owned evidence.

This design makes the Local Agent Runtime the product center. The browser plugin senses and displays. The runtime owns memory, filtering, decision policy, provider invocation, persistence, and summarization. SQLite becomes the only durable memory source for the local runtime.

## Goals / Non-Goals

**Goals:**

- Make `/explain` and `/rewrite` enter a runtime pipeline before any provider call.
- Keep browser-originated requests stateless and limited to selected text, current page context, URL/title/language, current action, and browser-safe constraints.
- Let runtime policy return without calling an LLM when memory or policy is sufficient.
- Persist raw events, explanation versions, and memory candidates on the synchronous path.
- Restrict long-term concept state, profile summary, and retrieval summaries to summarizer output.
- Replace durable JSON snapshot memory with SQLite tables, migrations, FTS5 lookup, and jobs/backlog tracking.
- Keep vector retrieval optional and out of the first implementation.

**Non-Goals:**

- No cloud memory service or account sync.
- No browser memory cache or browser-side long-term profile store.
- No Redis, Postgres, external queue, standalone vector database, or multi-process worker.
- No synchronous explain-path mutation of long-term profile summary or concept mastery state.
- No first-stage LLM summarizer requirement; rule summarization is acceptable.

## Decisions

### Decision: Treat the runtime explain pipeline as the single intelligent entrypoint

Runtime `/explain` and `/rewrite` requests flow through these stages:

1. Normalize stateless browser request.
2. Run input filter.
3. Run context filter.
4. Build retrieval packet from SQLite memory.
5. Run decision policy.
6. Return policy result or call provider adapter.
7. Normalize provider structured JSON.
8. Persist raw evidence, explanation version, and memory candidates.
9. Enqueue summarizer work.

Rationale: This keeps LLM invocation behind local policy and makes memory useful even when no provider call is required.

Alternative considered: keep provider dispatch as the first action and add memory writes afterward. That keeps the old product shape where memory is an accessory instead of the runtime's control plane.

### Decision: Browser requests are stateless and memory fields are ignored

The background worker may mediate local gateway requests, pairing tokens, timeouts, and diagnostics, but it does not assemble retrieval packets, apply durable feedback policy, or cache explanations as memory. If browser requests include memory-like fields, the runtime strips or ignores them.

Rationale: Page and extension state are easy to refresh, duplicate, or corrupt. Long-term personalization must come from the local runtime repository.

Alternative considered: allow browser-provided memory packets as optimization hints. This risks stale or fabricated personalization and undermines the source-of-truth boundary.

### Decision: SQLite is the durable memory source

The Local Memory Store uses SQLite with migrations and tables for:

- `raw_memory_events`
- `explanation_versions`
- `memory_candidates`
- `concept_states`
- `profile_summary`
- `retrieval_summaries`
- `summarizer_jobs`
- `schema_migrations`

FTS5 indexes are used for bounded local text lookup over canonical targets, aliases, summaries, and explanation metadata. Optional vector storage can be added later through sqlite-vec or another runtime-owned extension, but exact/FTS/recency retrieval must work without vectors.

Rationale: SQLite is local, durable, transactional, easy to inspect, and sufficient for a single-user local runtime.

Alternative considered: keep JSON snapshot plus JSONL ledger. That is easy to prototype but fragile for migrations, indexes, concurrent writes, jobs, and explain-path transactions.

### Decision: Synchronous writes create evidence and candidates only

The explain path may write:

- raw event records such as requested, filtered, reused, provider called, explanation generated, displayed, and feedback received;
- explanation version records for valid provider or reused explanation versions;
- memory candidates such as possible unfamiliarity, possible style preference, too-hard feedback, or low trust in a version.

The explain path must not directly update `concept_states`, `profile_summary`, or `retrieval_summaries`.

Rationale: A single click, model output, or accidental dismissal should not immediately become a durable user trait.

Alternative considered: update concept state inline for faster personalization. That creates memory pollution and makes state harder to audit.

### Decision: Summarizer is an in-process worker backed by SQLite jobs

The first summarizer is rule based. It runs on a timer, after event thresholds, and on startup backlog detection. It consumes raw events and memory candidates, writes derived views with evidence ids and uncertainty, and records job status in SQLite.

Rationale: SQLite-backed jobs keep the first version simple and restart-safe without introducing a queue service.

Alternative considered: use an LLM summarizer immediately. LLM summarization can be added later, but the first version needs deterministic evidence handling and low operational complexity.

### Decision: Decision policy returns structured outcomes

The runtime decision result is recorded and returned with stable fields such as status, decision kind, reasons, memory freshness, provider call status, and version metadata. Expected decision kinds include:

- `reject_invalid_input`
- `reject_noise`
- `reject_muted`
- `return_existing_explanation`
- `return_degraded`
- `call_provider`

Rationale: Tests, diagnostics, and UI behavior should not infer runtime decisions from text.

Alternative considered: only return final Agent status. That hides why the runtime skipped a provider call or reused memory.

## Risks / Trade-offs

- SQLite dependency install or native build fails -> Keep dependency isolated behind the Local Memory Store adapter and document dev setup clearly.
- Existing JSON file memory is already present -> Provide a one-time local runtime migration path or start a fresh SQLite store with degraded history; do not import browser-local memory implicitly.
- Runtime decision policy becomes too aggressive -> Start conservative: reject clear noise, honor mute/recently-explained state, and call provider when policy confidence is low.
- Summarizer backlog grows -> Track jobs, backlog size, stale targets, and last error in health; process bounded batches in-process.
- Provider output could pollute memory candidates -> Persist candidates with source version id, reason, uncertainty, and require summarizer evidence thresholds before derived state updates.
- Browser UI may expect immediate personalization -> Return structured degraded/reused/unavailable decisions and keep overlay quiet when runtime cannot provide enough confidence.

## Migration Plan

1. Add SQLite store adapter and migrations behind the existing memory repository interface.
2. Add runtime explain pipeline modules while preserving current gateway endpoint shapes.
3. Route `/explain` and `/rewrite` through filters, retrieval, decision policy, provider adapter, and post-result write hooks.
4. Add memory candidate persistence and summarizer job enqueueing.
5. Add in-process summarizer worker and health/diagnostic state.
6. Remove or disable durable JSON snapshot mode for production; keep in-memory mode only for explicit tests/dev.
7. Update browser/background behavior and tests to assert no durable browser memory cache or provider-context assembly.

Rollback: keep the previous gateway provider dispatch path available behind a development flag while preserving the SQLite file. If the SQLite store cannot open, return structured degraded/unavailable memory status rather than falling back to browser storage.

## Open Questions

- Should existing local JSON gateway memory be migrated automatically into SQLite, or should migration be an explicit dev/admin command?
- Should reused existing explanations create a new explanation version reference or only a raw reuse event linked to the prior version?
- Should decision policy live in a separate module from gateway handlers from day one, or begin as internal runtime helpers and split after tests stabilize?
