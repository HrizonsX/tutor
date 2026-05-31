## ADDED Requirements

### Requirement: Preserve Event-First Concept Memory
The system SHALL preserve raw learning events as the evidence base for concept memory and SHALL derive concept state as a recomputable view.

#### Scenario: Event is stored before concept projection
- **WHEN** a seen, explained, expanded, dismissed, selected-term, repeated-confusion, revisited, or ignored-overlay interaction occurs
- **THEN** the system SHALL persist the raw event before updating concept projections or summaries.

#### Scenario: Projection remains uncertain
- **WHEN** concept state is derived from raw events
- **THEN** the system SHALL include uncertainty and source event ids and SHALL NOT treat the projection as authoritative mastery state.

### Requirement: Record Memory Used During Explanation
The system SHALL record which historical concepts and relations were used to bridge an explanation.

#### Scenario: Explanation records memory bridges
- **WHEN** an explanation uses a historical concept bridge
- **THEN** the system SHALL record the target concept, bridge concept, relation type, relation id when available, explanation version id, timestamp, and source role.

#### Scenario: Unused candidates are not treated as used
- **WHEN** relation discovery proposes candidates that are not injected into the final explanation request
- **THEN** the system SHALL NOT record them as used-in-explanation memory bridges.

### Requirement: Store Relation Proposals As Learning Context
The system SHALL store relation proposals and gated relations as uncertain learning context rather than world knowledge.

#### Scenario: LLM proposal is not automatically active
- **WHEN** an LLM returns a structured relation proposal
- **THEN** the system SHALL store it only after relation gate validation and SHALL NOT treat the proposal alone as an active relation.

#### Scenario: Relation evidence omits snippets
- **WHEN** a relation proposal or gated relation is persisted
- **THEN** it SHALL store source event ids, explanation version ids, source dates, context hashes, evidence text hashes, source kind, proposer version, and confidence reason
- **AND** it SHALL NOT store an evidence snippet.
