# local-memory-store Specification

## Purpose
TBD - created by archiving change persist-local-memory-store-and-summarizer. Update Purpose after archive.
## Requirements
### Requirement: Persist Raw Memory Ledger
The Local Agent Runtime SHALL persist raw learning memory records to durable local storage across gateway process restarts.

#### Scenario: Memory survives gateway restart
- **GIVEN** the local runtime has recorded a learning event through the gateway memory API
- **WHEN** the gateway process stops and starts again with the same Local Memory Store location
- **THEN** a memory query for the same target SHALL be able to retrieve state derived from that event
- **AND** the event id, timestamp, canonical target identity, repository mode, and evidence metadata SHALL be preserved.

#### Scenario: Store writes minimal records
- **GIVEN** a browser extension records an encounter, explanation, feedback, mute, or regeneration event
- **WHEN** the Local Memory Store persists the raw record
- **THEN** it SHALL store structured event fields and minimal context metadata
- **AND** it SHALL NOT persist full page text unless a future explicit feature requires it.

### Requirement: Separate Raw Events From Derived Views
The Local Agent Runtime SHALL store raw event evidence separately from derived memory views.

#### Scenario: Summary rebuild does not delete evidence
- **GIVEN** raw events exist for a target object
- **WHEN** derived summaries are rebuilt
- **THEN** the raw events SHALL remain available as source evidence
- **AND** the rebuilt summaries SHALL reference the source event ids rather than replacing the raw event records.

#### Scenario: Derived view can be invalidated
- **GIVEN** a derived memory view was produced by an older summarizer version
- **WHEN** the runtime detects that the summarizer version or schema version has changed
- **THEN** it SHALL mark the derived view stale or rebuild it from raw events
- **AND** it SHALL NOT discard the raw evidence required for the rebuild.

### Requirement: Summarize Memory Asynchronously
The Local Agent Runtime SHALL run Memory Summarizer work asynchronously from raw event writes.

#### Scenario: Event write queues summarization
- **WHEN** the gateway receives a valid memory event write
- **THEN** it SHALL persist the raw event before returning success
- **AND** it SHALL enqueue or mark summarization work for affected targets without requiring summarization to complete before the write response.

#### Scenario: Summarizer failure degrades but does not lose writes
- **GIVEN** raw event persistence succeeds
- **AND** summarization for the affected target fails
- **WHEN** the gateway reports the write result
- **THEN** the write SHALL remain available
- **AND** diagnostics SHALL expose a degraded summarizer state without exposing raw private event payloads.

#### Scenario: Startup processes backlog
- **GIVEN** the runtime starts with raw events that have no current derived summaries
- **WHEN** the Memory Summarizer initializes
- **THEN** it SHALL detect the unsummarized backlog
- **AND** it SHALL process or schedule the backlog before reporting summaries as fresh.

### Requirement: Produce Evidence-Backed Memory Views
The Memory Summarizer SHALL produce structured derived views for user profile hints, target concept state, related objects, cooldowns, and explanation preferences.

#### Scenario: Profile hint includes evidence
- **GIVEN** repeated user feedback indicates a likely explanation style preference
- **WHEN** the summarizer derives a profile hint
- **THEN** the stored hint SHALL include the preference signal, source event ids, timestamp, summarizer version, and uncertainty
- **AND** it SHALL NOT convert the preference into a permanent trait without evidence.

#### Scenario: Concept state includes uncertainty
- **GIVEN** repeated events indicate that a target may be weak, familiar, muted, or recently explained
- **WHEN** the summarizer derives concept state
- **THEN** the state SHALL include the derived signals, source event ids, timestamp, and uncertainty
- **AND** it SHALL NOT assert certain mastery or certain non-understanding from ambiguous events.

#### Scenario: Related object summary preserves evidence
- **GIVEN** memory events associate two or more objects
- **WHEN** the summarizer derives a related-object view
- **THEN** each relationship SHALL include related target identity, evidence event ids, timestamp, and uncertainty.

### Requirement: Query Summarized Memory Context
The Local Memory Store SHALL return sanitized summarized memory context for Agent explain and rewrite requests.

#### Scenario: Query target with summarized state
- **GIVEN** the store contains raw events and fresh derived summaries for a target
- **WHEN** the runtime queries memory for that target
- **THEN** the returned memory packet SHALL include summarized profile hints, target state, feedback summaries, prior explanation metadata, related objects, cooldowns, uncertainty, and evidence ids
- **AND** it SHALL label the packet as local learning state rather than world knowledge.

#### Scenario: Query target with stale summary
- **GIVEN** raw events exist for a target
- **AND** the derived summary is missing or stale
- **WHEN** the runtime queries memory for an explain request
- **THEN** it SHALL either use bounded fallback retrieval from raw events or return a degraded memory status
- **AND** it SHALL NOT invent summary fields or semantic similarity scores.

### Requirement: Support Schema Migration And Rebuild
The Local Memory Store SHALL track schema version, migration metadata, and derived-view rebuild status.

#### Scenario: Older store opens
- **GIVEN** the runtime opens a Local Memory Store with an older supported schema version
- **WHEN** the store initializes
- **THEN** migration logic SHALL normalize records before query or write operations complete
- **AND** migration metadata SHALL record the source version, target version, timestamp, and status.

#### Scenario: Unsupported store version
- **GIVEN** the runtime opens a Local Memory Store with an unsupported future schema version
- **WHEN** memory APIs are requested
- **THEN** the runtime SHALL return a structured unavailable or degraded memory result
- **AND** it SHALL NOT overwrite the store.

### Requirement: Persist Daily Memory Summaries
The Local Memory Store SHALL persist structured daily memory summaries as derived memory records.

#### Scenario: Daily summary survives restart
- **WHEN** the Local Memory Store restarts after a daily summary was created
- **THEN** the summary SHALL remain queryable by date and by referenced canonical concepts.

#### Scenario: Daily summary stores minimal evidence
- **WHEN** a daily summary is persisted
- **THEN** it SHALL store summary version, summary hash, source event ids, topic labels, concept references, relation references, and timestamps without full page text.

### Requirement: Persist Concept Projections
The Local Memory Store SHALL persist or rebuild concept projections derived from raw memory events.

#### Scenario: Concept projection includes event counts
- **WHEN** a concept projection is stored or returned
- **THEN** it SHALL include canonical name, aliases, seen count, explained count, expanded count, dismissed count, repeated confusion count, timestamps, derived signals, uncertainty, and source event ids.

#### Scenario: Stale projection can be rebuilt
- **WHEN** a projection schema or summarizer version changes
- **THEN** the store SHALL mark the projection stale or rebuild it from raw events without deleting raw evidence.

### Requirement: Persist Relation Proposal And Gate Metadata
The Local Memory Store SHALL preserve relation proposal and gate metadata required to audit relation state without storing evidence snippets.

#### Scenario: Relation stores hashes and dates
- **WHEN** a relation candidate or active relation is persisted
- **THEN** it SHALL store source and target canonical names, relation type, status, confidence, basis, source dates, evidence event ids, explanation version ids, context hash, evidence text hash, proposer version, gate reason, occurrence count, and timestamps.

#### Scenario: Relation query excludes rejected records
- **WHEN** Overlay recall queries active one-hop relations
- **THEN** the store SHALL exclude rejected relations and SHALL apply configured relation and bridge limits.

### Requirement: Persist Reflection Report Snapshots
The Local Memory Store SHALL persist daily and weekly reflection report snapshots or report inputs for repeatable report retrieval.

#### Scenario: Report snapshot is queryable
- **WHEN** a daily or weekly report is generated
- **THEN** the store SHALL allow the report or its structured input snapshot to be queried by date range.

#### Scenario: Report snapshot avoids raw text
- **WHEN** a report snapshot is persisted
- **THEN** it SHALL NOT store full page text or evidence snippets.

### Requirement: Relation Discovery Uses Configured Proposer
The Local Memory Store relation discovery flow SHALL accept configured relation proposer output when scheduled by Gateway / Local Agent Runtime.

#### Scenario: Proposer returns candidates
- **GIVEN** relation discovery is run with a configured relation proposer
- **WHEN** the proposer returns valid relation candidates for loaded day blocks
- **THEN** the store SHALL gate and upsert those candidates into relation proposal storage
- **AND** active gated relations SHALL become eligible for future overlay recall.

#### Scenario: No proposer is available
- **GIVEN** relation discovery is run without an available relation proposer
- **WHEN** selected day blocks exist
- **THEN** the store SHALL return an available or skipped discovery result with empty relation candidates
- **AND** it SHALL NOT fabricate relation candidates from daily summaries alone.

### Requirement: Active Relations Produce Memory Bridges
The Local Memory Store SHALL produce bounded memory bridges from active runtime-owned relations.

#### Scenario: Active relation exists
- **GIVEN** an active usable relation exists for a target concept
- **WHEN** memory is queried for that target
- **THEN** the memory packet SHALL include bounded `memoryBridges`
- **AND** it SHALL also expose those bridges as `relatedMemories` for provider request compatibility.

#### Scenario: No active relation exists
- **GIVEN** daily summaries contain co-occurring concepts but no active usable relation has been persisted
- **WHEN** memory is queried for a target
- **THEN** the memory packet SHALL return an empty `memoryBridges` array
- **AND** it SHALL NOT treat co-occurrence alone as an active bridge.

### Requirement: Relation Evidence Remains Bounded And Private
Relation discovery persistence SHALL store structured evidence references rather than evidence snippets.

#### Scenario: Relation is persisted
- **WHEN** a gated relation candidate is stored
- **THEN** the stored record SHALL include bounded source event ids, explanation version ids, source dates, hashes, source kind, proposer version, confidence, basis, status, and timestamps
- **AND** it SHALL NOT store full page text or evidence snippets.

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

### Requirement: Preserve Local Store As Fallback
The Local Memory Store SHALL remain available as a development and test fallback when the layered memory repository is not selected.

#### Scenario: SQLite fallback remains active
- **WHEN** Gateway / Local Agent Runtime is configured for the existing persistent local store
- **THEN** memory event writes, memory queries, relation discovery, summaries, reflection reports, and health SHALL continue using SQLite-backed Local Memory Store behavior
- **AND** Postgres, Redis, and vector recall services SHALL not be required.

#### Scenario: In-memory fallback remains explicit
- **WHEN** Gateway / Local Agent Runtime is configured for in-memory memory mode
- **THEN** health SHALL report non-persistent memory behavior
- **AND** the system SHALL not present in-memory state as durable layered memory.

### Requirement: Match Layered Repository Response Shape
The Local Memory Store fallback SHALL preserve response compatibility with the layered repository contract.

#### Scenario: Memory query returns fallback packet
- **WHEN** the Local Memory Store handles a memory query
- **THEN** the returned packet SHALL keep existing fields such as repository mode, freshness, concept projection, memory bridges, related memories, profile hints, and diagnostics-compatible health
- **AND** callers SHALL not need separate browser-facing code for fallback and layered repositories.

#### Scenario: Fallback has no vector adapter
- **WHEN** the Local Memory Store fallback cannot provide vector recall
- **THEN** it SHALL return exact, relation, and summary-based memory only
- **AND** it SHALL not invent semantic similarity candidates.

### Requirement: Memory Runtime Mediates Store Access
Gateway and Local Agent Runtime memory operations SHALL access the Local Memory Store through Memory Runtime or an equivalent runtime-owned memory interface.

#### Scenario: Memory event write uses Memory Runtime
- **GIVEN** the gateway receives a valid `/memory/events` request
- **WHEN** Local Agent Runtime records the event
- **THEN** it SHALL write the event through Memory Runtime
- **AND** HTTP gateway code SHALL NOT directly call Local Memory Store persistence functions.

#### Scenario: Memory query uses Memory Runtime
- **GIVEN** the gateway receives a valid `/memory/query`, `/explain`, or `/rewrite` request that needs memory context
- **WHEN** Local Agent Runtime retrieves memory
- **THEN** it SHALL query through Memory Runtime
- **AND** HTTP gateway code SHALL NOT directly assemble memory packets from Local Memory Store internals.

#### Scenario: Memory store implementation remains replaceable
- **GIVEN** Memory Runtime is constructed with the existing SQLite-backed Local Memory Store
- **WHEN** memory health, query, write, summarizer, or relation discovery behavior is requested
- **THEN** Memory Runtime SHALL preserve existing Local Memory Store behavior while hiding store implementation details from the gateway.

### Requirement: Memory Runtime Owns Memory Lifecycle Hooks
Memory Runtime SHALL expose the memory lifecycle hooks needed by Local Agent Runtime without requiring gateway code to know store-specific methods.

#### Scenario: Provider result is persisted
- **GIVEN** Local Agent Runtime receives a valid provider-backed explanation result
- **WHEN** it finalizes the result
- **THEN** it SHALL persist raw events, explanation versions, memory candidates, used memory bridge events, and relation discovery scheduling through Memory Runtime.

#### Scenario: Runtime memory config changes
- **WHEN** runtime configuration hot-applies memory cognitive policy fields
- **THEN** Local Agent Runtime SHALL update Memory Runtime with the effective memory policy
- **AND** gateway HTTP routing SHALL NOT directly call Local Memory Store configuration methods.

#### Scenario: Memory health is requested
- **WHEN** `/health` or diagnostics request memory state
- **THEN** Memory Runtime SHALL provide redacted memory repository, persistence, summarizer, and relation discovery status suitable for gateway health aggregation.
