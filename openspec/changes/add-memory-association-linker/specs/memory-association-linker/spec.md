## ADDED Requirements

### Requirement: Extract Weak Memory Associations
The Local Agent Runtime SHALL extract weak concept associations from runtime-owned evidence using conservative rule-based linking.

#### Scenario: Structured provider term creates association
- **GIVEN** a successful explanation version is recorded for a source target
- **AND** the structured provider response contains a distinct normalized term
- **WHEN** the Memory Association Linker processes the explanation version
- **THEN** it SHALL create or update a non-self edge from the source target to the term
- **AND** the edge SHALL include relation type, confidence, source, timestamp, and explanation version evidence ids.

#### Scenario: Event related concepts create association
- **GIVEN** a runtime memory event includes `relatedConcepts`
- **WHEN** the Memory Association Linker processes the event
- **THEN** it SHALL create or update active edges between the event target and each distinct related concept
- **AND** it SHALL preserve the event id as evidence.

#### Scenario: Self loop is ignored
- **GIVEN** extracted source and target names normalize to the same canonical name
- **WHEN** the linker processes the candidate association
- **THEN** it SHALL NOT create a memory edge.

### Requirement: Persist Evidence-Backed Memory Edges
The Local Agent Runtime SHALL persist association edges as evidence-backed local memory records.

#### Scenario: Edge stores evidence references
- **WHEN** a memory edge is created or updated
- **THEN** it SHALL store source and target canonical names, relation type, confidence, source, status, timestamps, occurrence count, and evidence identifiers
- **AND** it SHALL store only bounded evidence hashes or ids rather than full source text.

#### Scenario: Edge is durable
- **GIVEN** a memory edge has been created in a persistent Local Memory Store
- **WHEN** the Local Agent Runtime restarts with the same store path
- **THEN** a memory query SHALL be able to retrieve related memory context derived from that edge.

### Requirement: Deduplicate And Rank Edges
The Memory Association Linker SHALL deduplicate repeated evidence for the same association and rank active edges conservatively.

#### Scenario: Repeated evidence updates existing edge
- **GIVEN** an active edge already exists for the same source, target, relation type, and source class
- **WHEN** the linker observes additional supporting evidence
- **THEN** it SHALL update the existing edge evidence, occurrence count, last seen timestamp, and confidence rather than creating an unbounded duplicate.

#### Scenario: Active edge cap is enforced
- **GIVEN** a concept has more candidate active edges than the configured maximum
- **WHEN** edges are selected for retrieval
- **THEN** the runtime SHALL prefer active edges by confidence, recency, and evidence strength
- **AND** it SHALL return no more than the configured edge limit.

### Requirement: Retrieve Related Memories
The Local Agent Runtime SHALL return bounded related memories from active memory edges in addition to exact target memory.

#### Scenario: Incoming edge supplies related memory
- **GIVEN** an active edge exists from a related concept to the current target
- **WHEN** memory is queried for the current target
- **THEN** the retrieval packet SHALL include a `relatedMemories` entry for the related concept
- **AND** the entry SHALL mark direction `incoming`.

#### Scenario: Related memory is bounded and cautioned
- **WHEN** related memories are returned
- **THEN** each item SHALL include canonical name, relation type, direction, confidence, source role, evidence ids, summary, last seen timestamp, and `caution: "related_memory_is_not_fact_source"`
- **AND** the runtime SHALL inject no more than the configured related memory limit.

### Requirement: Maintain Edge Confidence
The Memory Summarizer SHALL maintain association edge confidence and status from evidence patterns without turning associations into facts.

#### Scenario: Repeated co-occurrence raises confidence
- **GIVEN** a low-confidence active edge has repeated supporting evidence
- **WHEN** the Memory Summarizer processes affected targets
- **THEN** it MAY raise confidence to medium
- **AND** it SHALL keep the edge labeled as uncertain learning context.

#### Scenario: Negative or stale evidence lowers usefulness
- **GIVEN** an edge has negative feedback, repeated irrelevance, or long inactivity
- **WHEN** the Memory Summarizer processes the edge
- **THEN** it MAY lower confidence or mark the edge rejected
- **AND** rejected edges SHALL NOT be returned as related memories.
