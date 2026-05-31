## 1. SQLite Memory Store Foundation

- [x] 1.1 Add `better-sqlite3` as the Local Agent Runtime SQLite dependency and keep the dependency isolated behind the memory store adapter.
- [x] 1.2 Implement SQLite store opening, path configuration, explicit in-memory mode, schema version tracking, and migration metadata.
- [x] 1.3 Create migrations for `raw_memory_events`, `explanation_versions`, `memory_candidates`, `concept_states`, `profile_summary`, `retrieval_summaries`, `summarizer_jobs`, and `schema_migrations`.
- [x] 1.4 Add SQLite FTS5 indexes for canonical targets, aliases, explanation summaries, and retrieval summary text when FTS5 is available.
- [x] 1.5 Replace production durable JSON snapshot persistence with SQLite while keeping explicit in-memory mode for tests and development.

## 2. Runtime Memory Repository

- [x] 2.1 Implement repository methods for writing raw memory events transactionally with minimal context metadata and evidence identifiers.
- [x] 2.2 Implement repository methods for writing and reading explanation versions with provider, model, prompt/schema, context summary, and feedback linkage metadata.
- [x] 2.3 Implement repository methods for writing memory candidates with source event ids, source explanation version ids, uncertainty, status, and target metadata.
- [x] 2.4 Implement repository methods for reading concept state, profile summary, retrieval summaries, recent raw evidence, prior explanation metadata, and memory candidates.
- [x] 2.5 Return structured degraded memory results when SQLite cannot open, migrations fail, summaries are stale, or retrieval cannot be satisfied.

## 3. Summarizer And Derived Memory

- [x] 3.1 Implement SQLite-backed summarizer job enqueueing for affected targets after raw event, explanation version, or memory candidate writes.
- [x] 3.2 Implement startup backlog detection for pending, failed, or stale summarizer jobs.
- [x] 3.3 Implement first-stage rule summarizer updates for `concept_states` with evidence ids, uncertainty, timestamps, and summarizer version.
- [x] 3.4 Implement first-stage rule summarizer updates for `profile_summary` and `retrieval_summaries` with multi-evidence thresholds.
- [x] 3.5 Ensure synchronous explain/rewrite/feedback paths do not directly mutate `concept_states`, `profile_summary`, or `retrieval_summaries`.

## 4. Explain Decision Pipeline

- [x] 4.1 Add a runtime explain pipeline module that normalizes stateless browser requests and strips browser-provided memory/profile fields.
- [x] 4.2 Implement input filters for empty targets, too-short targets, too-long targets, noise, duplicate triggers, and unsupported request shapes.
- [x] 4.3 Implement context filters that bound selected text, surrounding fragment text, URL/title/language metadata, and operation data.
- [x] 4.4 Build runtime retrieval packets from SQLite memory before provider decision, including degraded-memory status when needed.
- [x] 4.5 Implement decision policy outcomes for `reject_invalid_input`, `reject_noise`, `reject_muted`, `return_existing_explanation`, `return_degraded`, and `call_provider`.
- [x] 4.6 Add post-decision persistence for skipped, rejected, reused, provider-called, provider-failed, and provider-succeeded explain events.

## 5. Provider And Explanation Persistence

- [x] 5.1 Ensure runtime provider adapters receive only filtered current context and sanitized runtime-owned retrieval packets.
- [x] 5.2 Ensure valid structured provider JSON includes persistable explanation text, summary, confidence, terms, actions, provider metadata, schema metadata, and version metadata.
- [x] 5.3 Persist provider-backed explanation versions and link them to raw events, request ids, feedback ids, and context summaries.
- [x] 5.4 Create memory candidates from provider output and user interaction signals without promoting them to long-term profile or concept state.
- [x] 5.5 Ensure invalid JSON, schema-invalid JSON, malformed Agent results, and unavailable provider results do not create explanation versions.

## 6. Gateway And Browser Boundary

- [x] 6.1 Route gateway `/explain` through the runtime pipeline instead of directly injecting memory and dispatching to provider handlers.
- [x] 6.2 Route gateway `/rewrite` through the runtime pipeline with current previous-version and current feedback metadata.
- [x] 6.3 Include structured decision metadata, provider call status, memory freshness, persistence status, and summarizer enqueue status in gateway responses.
- [x] 6.4 Keep background requests stateless by forwarding only current-interaction fields and browser-safe constraints to the gateway.
- [x] 6.5 Remove or guard any browser-side durable memory cache, retrieval packet assembly, profile derivation, or provider-context construction assumptions.

## 7. Observability And Health

- [x] 7.1 Extend `/health` with SQLite availability, schema version, migration status, persistence mode, FTS availability, summarizer backlog, last summarizer run, and last summarizer error.
- [x] 7.2 Extend diagnostics with latest filter status, decision kind, normalized reasons, provider call status, memory freshness, persistence status, and summarizer enqueue status.
- [x] 7.3 Redact raw event payloads, full page text, profile internals, provider tokens, pairing tokens, and endpoint query secrets from health and diagnostics.
- [x] 7.4 Add structured diagnostics for provider-skipped decisions so troubleshooting does not rely on free-form explanation text.

## 8. Tests And Validation

- [x] 8.1 Add SQLite store tests for schema creation, migrations, restart persistence, FTS fallback, raw events, explanation versions, memory candidates, and summarizer jobs.
- [x] 8.2 Add summarizer tests proving candidates require evidence thresholds before concept state, profile summary, or retrieval summary updates.
- [x] 8.3 Add explain pipeline tests for invalid input, noise, duplicate trigger, muted target, existing explanation reuse, degraded memory, provider call, and provider failure decisions.
- [x] 8.4 Add gateway tests for `/explain`, `/rewrite`, `/memory/events`, `/memory/query`, `/health`, and diagnostics response metadata.
- [x] 8.5 Add browser/background tests proving no memory packet, profile hints, explanation history, feedback history, or concept familiarity are sent as browser-derived provider context.
- [x] 8.6 Run `npm test` and the relevant OpenSpec status/validation command for `local-memory-first-agent-runtime`.
