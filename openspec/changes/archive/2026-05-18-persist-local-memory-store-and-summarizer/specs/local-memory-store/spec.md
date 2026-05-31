## ADDED Requirements

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
