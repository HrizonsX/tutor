## 1. Store Schema And Persistence

- [x] 1.1 Define normalized Local Memory Store record shapes for raw events, profile events, explanation versions, derived summaries, graph edges, optional vectors, migrations, and store metadata.
- [x] 1.2 Add a store adapter boundary that supports open, append raw event, write explanation version, read target evidence, read/write derived summaries, list stale targets, and close operations.
- [x] 1.3 Implement the default file-backed store using an append-only JSONL raw ledger and atomic JSON snapshot writes for metadata and derived views.
- [x] 1.4 Add safe startup loading, trailing-write recovery, schema version validation, and migration metadata handling.
- [x] 1.5 Add runtime configuration for persistent memory store path and explicit in-memory development/test mode.

## 2. Memory Summarizer

- [x] 2.1 Add summarizer queue/backlog state that marks affected targets after raw event writes and detects stale or missing summaries on startup.
- [x] 2.2 Implement deterministic summary builders for target concept state, feedback summaries, related objects, cooldowns, profile hints, and explanation preference hints.
- [x] 2.3 Ensure every derived summary includes source event ids, timestamp, summarizer version, and uncertainty.
- [x] 2.4 Add bounded fallback retrieval for stale summaries that uses raw evidence without fabricating derived fields.
- [x] 2.5 Add rebuild behavior for summarizer version or schema changes.

## 3. Gateway Runtime Integration

- [x] 3.1 Replace default gateway dev startup memory construction with the persistent Local Memory Store while preserving in-memory test helpers.
- [x] 3.2 Update `/memory/events` to persist raw events, enqueue summarization, and return shared local repository metadata.
- [x] 3.3 Update `/memory/query` to return sanitized summarized memory packets with freshness or degraded status.
- [x] 3.4 Inject Local Memory Store summaries into `/explain` requests before provider adapter dispatch.
- [x] 3.5 Inject explanation preference and feedback-summary context into `/rewrite` requests before provider adapter dispatch.
- [x] 3.6 Extend `/health` and diagnostics with redacted store mode, persistence state, schema version, migration status, summarizer backlog, stale-summary state, and degraded reasons.

## 4. Browser Repository Boundary

- [x] 4.1 Update background mediation so local runtime explain/rewrite requests rely on gateway memory injection instead of browser-owned long-term memory summarization.
- [x] 4.2 Keep browser IndexedDB repository fallback marked as browser-local or degraded when local runtime memory is unavailable.
- [x] 4.3 Preserve repository-mediated migration from browser fallback to Local Memory Store with event ids, timestamps, uncertainty, and version links where possible.
- [x] 4.4 Ensure diagnostics and content-facing responses never expose raw local store events, full page text, tokens, or unsanitized summaries.

## 5. Verification And Documentation

- [x] 5.1 Add store persistence tests proving memory survives gateway restart with preserved event metadata.
- [x] 5.2 Add summarizer tests for profile hints, concept state, explanation preferences, related objects, evidence ids, uncertainty, stale summaries, and rebuild behavior.
- [x] 5.3 Add gateway integration tests for `/memory/events`, `/memory/query`, `/explain`, `/rewrite`, and `/health` with persistent memory enabled.
- [x] 5.4 Add fallback and migration tests covering browser-local degraded state and migration into the Local Memory Store.
- [x] 5.5 Update README or development notes with Local Memory Store configuration, in-memory test mode, and privacy expectations.
- [x] 5.6 Run `npm test` and relevant OpenSpec validation/status checks.
