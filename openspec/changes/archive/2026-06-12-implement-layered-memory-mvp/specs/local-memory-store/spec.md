## ADDED Requirements

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
