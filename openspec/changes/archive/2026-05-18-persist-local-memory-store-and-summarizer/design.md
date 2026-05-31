## Context

The browser extension now routes model and memory work through the localhost gateway, and the specs already describe the local gateway repository as the MVP source of truth. In implementation, however, `createLocalMemoryStore()` still stores learning events in process memory, so a gateway restart loses user learning history and cross-browser continuity only lasts for a single runtime session.

The next boundary is to make the Local Agent Runtime responsible for storage, summarization, retrieval, and explain/rewrite memory context injection. The browser extension should remain the sensing and UX layer: it records structured events, forwards explanation requests, and renders overlay results, but it should not own durable learning state or perform long-term memory summarization when the local runtime is available.

## Goals / Non-Goals

**Goals:**

- Persist raw learning events, profile events, explanation versions, summaries, graph edges, optional vectors, schema version, and migration metadata across gateway restarts.
- Introduce an asynchronous Memory Summarizer that turns raw event evidence into derived user profile, concept/object state, related-object, cooldown, and explanation preference views.
- Keep raw events and derived summaries separate so summaries can be rebuilt, invalidated, or improved without losing evidence.
- Ensure explain and rewrite requests that reach the gateway receive a sanitized, summarized memory context before provider adapter dispatch.
- Preserve uncertainty and evidence ids in all derived memory records.
- Keep browser IndexedDB fallback as degraded continuity and migration input, not the authoritative cross-browser source when local memory is available.
- Expose redacted diagnostics for store status, schema migrations, summarizer backlog, and degraded memory injection.

**Non-Goals:**

- Do not add cloud sync, accounts, multi-device authorization, or end-to-end encrypted remote storage.
- Do not store full page text as long-term memory.
- Do not make local memory an authoritative world-knowledge source.
- Do not require embeddings for retrieval or summarization.
- Do not add a profile management UI in this change.
- Do not require the browser extension to understand the local store file format.

## Decisions

### Decision: Use an append-only raw ledger plus derived memory views

The Local Memory Store keeps raw events as evidence records and stores summarized views separately. The raw ledger is append-only for normal writes; derived views are recomputable projections such as per-object state, profile hints, related objects, explanation preference hints, and summary vectors.

Rationale: Event-first memory already matches the existing learning-memory model and avoids turning ambiguous feedback into permanent user traits. Separating raw and derived state lets the summarizer improve later without data loss.

Alternative considered: mutate one per-object memory record directly on every event. That is simpler to query, but it makes memory pollution harder to audit and makes future summarizer changes destructive.

### Decision: Default MVP storage is file-backed JSONL and atomic JSON snapshots behind a store adapter

For the current zero-dependency Node runtime, the default persistent store should use an append-only JSONL ledger for raw records and atomic JSON writes for normalized indexes, derived summaries, migrations, and store metadata. The implementation should expose a narrow store adapter so SQLite or another database can replace the file-backed adapter later.

Rationale: This provides real persistence without adding a runtime dependency or installation burden. JSONL also matches event-ledger semantics and makes corrupted trailing writes recoverable.

Alternative considered: add SQLite immediately. SQLite is likely the better long-term store for larger data, indexes, and vectors, but it adds dependency and packaging choices that are not necessary to prove the Local Agent Runtime boundary.

### Decision: Summarization runs asynchronously and never blocks event writes

Writing `/memory/events` appends the sanitized event and enqueues summarization work. The gateway may schedule summarization after writes, on startup for unsummarized backlog, and opportunistically before query/explain if a target summary is stale. If summarization fails, the raw write still succeeds and diagnostics report the degraded state.

Rationale: User interactions should not feel slower because memory summaries are being rebuilt. Raw events are the durable source of truth; derived summaries can lag safely when the system labels the memory state as degraded or stale.

Alternative considered: summarize synchronously during every write. That makes queries fresher, but it couples UI feedback recording to model/runtime latency and makes write failures more likely.

### Decision: Summarizer output is structured, evidence-backed, and local-memory-only

The summarizer produces structured records for user profile hints, object/concept state, explanation preference hints, related objects, cooldowns, and uncertainty. Every derived assertion must include source event ids, generated timestamp, summarizer version, and confidence/uncertainty. Summaries describe user interaction history and learning state only.

Rationale: The existing specs already prohibit treating memory as world knowledge. Evidence-backed summaries give the Agent useful context while keeping the user profile explainable and reversible.

Alternative considered: store free-form natural-language summaries only. That would be convenient for prompting, but it is harder to test, harder to redact, and easier to mistake for factual knowledge.

### Decision: Gateway injects summarized memory context before provider dispatch

For `/explain` and `/rewrite`, the Local Agent Runtime resolves the target, queries the Local Memory Store, builds a sanitized retrieval packet from summaries and relevant evidence metadata, and injects it into the internal Agent request before calling the provider adapter. Incoming browser-provided memory packets may be accepted for browser fallback or tests, but local runtime memory wins when available.

Rationale: This completes the boundary: provider context assembly belongs with runtime memory and provider dispatch, not in content scripts or browser storage. It also prevents raw browser-side memory from being sent directly to providers.

Alternative considered: keep background responsible for querying memory before explain. That preserves existing flow, but it leaves retrieval and context assembly split across browser and runtime.

### Decision: Browser fallback remains a degraded mode and migration source

When local memory is unavailable, browser IndexedDB fallback may continue to record and query minimal learning memory for continuity. Once the local store is available, browser fallback can migrate records through repository APIs and must mark fallback data as browser-local/degraded.

Rationale: The product remains usable without the local runtime, while still making the runtime the source of truth for cross-browser memory.

Alternative considered: remove browser fallback. That would simplify ownership, but it would make local runtime outages lose interaction continuity.

### Decision: Diagnostics expose memory health without raw private content

Gateway health and diagnostics should report store mode, persistence path presence without full sensitive paths when appropriate, schema version, migration status, summarizer queue depth, last successful summarization time, stale targets count, and degraded-memory reasons. They must not expose raw event payloads, full page text, tokens, or unsanitized summaries.

Rationale: A silent overlay is difficult to debug without memory/runtime observability, but diagnostics must not become a privacy leak.

Alternative considered: expose only `memoryRepository.available`. That hides the most likely failures: migration errors, stale summaries, disabled summarizer, and degraded injection.

## Risks / Trade-offs

- File-backed storage may become inefficient for large histories -> Use a store adapter boundary and compact derived snapshots; add SQLite later when growth demands it.
- Summaries may become stale after writes -> Track summarizer watermarks and expose stale/degraded state in retrieval packets and diagnostics.
- Summarizer bugs may pollute derived profile hints -> Preserve raw events, summarizer version, evidence ids, and rebuild capability.
- Explain latency may increase if gateway refreshes summaries before dispatch -> Prefer async processing and only run bounded opportunistic refresh for stale target summaries.
- Local files may contain sensitive learning history -> Store minimal event metadata, bind gateway to localhost, require pairing when configured, and avoid full page text.
- Browser fallback and local store can diverge -> Make local store authoritative when available and provide repository-mediated migration with preserved ids/timestamps where possible.

## Migration Plan

1. Add persistent store adapter contracts and a default file-backed implementation with schema metadata and safe load/save behavior.
2. Replace gateway dev startup memory construction with the persistent store while preserving in-memory test helpers.
3. Add migration/normalization from existing in-memory/browser-shaped learning memory records to the Local Memory Store schema.
4. Add summarizer queue state, backlog detection, and deterministic summarizer logic for profile hints, object state, explanation preferences, and related objects.
5. Update `/memory/events`, `/memory/query`, `/explain`, `/rewrite`, and `/health` to use store and summarizer state.
6. Update browser repository migration and fallback tests to verify local runtime authority and degraded fallback behavior.
7. Roll back by running gateway with an explicit in-memory store mode; browser fallback remains available and provider-backed explanation returns degraded memory status rather than fabricated context.

## Open Questions

- What default local data directory should the gateway use on Windows, macOS, and Linux?
- Should the summarizer run on a fixed interval, only after writes, or both?
- Should a manual rebuild endpoint be added now, or should rebuild remain an internal startup/task behavior for the MVP?
- How much raw event evidence should retrieval packets expose to providers beyond event ids, counts, timestamps, and sanitized feedback metadata?
