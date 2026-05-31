## ADDED Requirements

### Requirement: Persist Memory Edges
The Local Memory Store SHALL persist runtime-owned weak association edges in local storage.

#### Scenario: SQLite store contains memory edge table
- **GIVEN** persistent local memory is configured
- **WHEN** the Local Memory Store initializes
- **THEN** it SHALL create or migrate a `memory_edges` table with source and target lookup indexes
- **AND** schema migration metadata SHALL record the store version change.

#### Scenario: Persistent edge survives restart
- **GIVEN** the Local Memory Store has persisted an active edge
- **WHEN** the gateway process restarts with the same store location
- **THEN** the edge SHALL remain available for related memory retrieval
- **AND** raw event and explanation evidence identifiers SHALL be preserved.

### Requirement: Query Related Memories From Edges
The Local Memory Store SHALL include bounded `relatedMemories` in memory query packets when active edges connect the query target to other concepts.

#### Scenario: Query returns exact and related context
- **GIVEN** exact target memory exists for the query target
- **AND** active memory edges connect another concept to the query target
- **WHEN** memory is queried for the query target
- **THEN** the packet SHALL include exact target memory fields as before
- **AND** it SHALL include a separate `relatedMemories` array for edge-derived context.

#### Scenario: No edges returns empty related memories
- **GIVEN** no active memory edges connect to the query target
- **WHEN** memory is queried for the query target
- **THEN** the packet SHALL include `relatedMemories: []`
- **AND** it SHALL NOT invent memory relationships or semantic similarity scores.

### Requirement: Store Edge Evidence Minimally
The Local Memory Store SHALL preserve privacy by storing only bounded association evidence metadata.

#### Scenario: Evidence text is hashed
- **WHEN** an edge is created from explanation text, structured response, event context, or minimal context
- **THEN** the stored edge SHALL include evidence ids and a bounded evidence text hash when needed
- **AND** it SHALL NOT persist full page text or full provider prompt text for the edge.
