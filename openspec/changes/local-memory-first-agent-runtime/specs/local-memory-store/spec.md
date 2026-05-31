## ADDED Requirements

### Requirement: Use SQLite As Durable Memory Source
The Local Memory Store SHALL use SQLite as the local durable source of truth for runtime-owned memory.

#### Scenario: Runtime opens store
- **GIVEN** a local memory store path is configured
- **WHEN** the Local Agent Runtime starts
- **THEN** it SHALL open or initialize a SQLite database at that path
- **AND** it SHALL apply supported schema migrations before memory query or write operations complete.

#### Scenario: Memory survives restart
- **GIVEN** raw events, explanation versions, memory candidates, concept states, profile summary, and retrieval summaries were written to SQLite
- **WHEN** the Local Agent Runtime restarts with the same store path
- **THEN** memory queries SHALL retrieve persisted state derived from that SQLite store
- **AND** the runtime SHALL NOT require browser-local storage to restore memory.

#### Scenario: In-memory mode is explicit
- **GIVEN** the gateway is started in explicit in-memory development or test mode
- **WHEN** health or diagnostics are requested
- **THEN** the Runtime SHALL report that persistence is disabled
- **AND** it SHALL NOT present in-memory state as restart-safe local memory.

### Requirement: Store Runtime Memory Tables
The SQLite Local Memory Store SHALL separate raw evidence, generated versions, candidate signals, derived memory views, and summarizer work.

#### Scenario: Required tables exist
- **WHEN** SQLite schema initialization completes
- **THEN** the store SHALL include tables or equivalent schema objects for `raw_memory_events`, `explanation_versions`, `memory_candidates`, `concept_states`, `profile_summary`, `retrieval_summaries`, `summarizer_jobs`, and `schema_migrations`.

#### Scenario: Raw event write is immutable evidence
- **GIVEN** the Runtime records an encounter, explain request, displayed explanation, feedback event, provider failure, or policy decision event
- **WHEN** the event is written
- **THEN** it SHALL be stored in `raw_memory_events` with minimal context metadata, target identity, event type, timestamp, and evidence metadata
- **AND** it SHALL NOT directly overwrite concept state or profile summary.

#### Scenario: Candidate write does not update profile
- **GIVEN** the Runtime records a candidate signal such as possible unfamiliarity, too-hard feedback, possible analogy preference, or explanation distrust
- **WHEN** the candidate is written
- **THEN** it SHALL be stored in `memory_candidates` with source event ids, uncertainty, status, and target metadata
- **AND** it SHALL NOT become long-term profile summary until the summarizer promotes it.

### Requirement: Support SQLite Retrieval And Jobs
The SQLite Local Memory Store SHALL support exact lookup, FTS-backed lookup, and restart-safe summarizer jobs without requiring vectors.

#### Scenario: FTS lookup is available
- **GIVEN** SQLite FTS5 is available
- **WHEN** the Runtime retrieves memory for an explain request
- **THEN** it MAY use FTS indexes over canonical targets, aliases, summaries, and explanation metadata
- **AND** it SHALL fall back to exact target, alias, recency, feedback, cooldown, and explanation-history lookup when FTS or vectors are unavailable.

#### Scenario: Summarizer job is restart safe
- **GIVEN** raw events or memory candidates create summarizer work
- **WHEN** the Runtime enqueues summarizer work
- **THEN** it SHALL write a `summarizer_jobs` record or equivalent durable job marker
- **AND** startup SHALL detect pending or failed jobs without relying on process memory.
