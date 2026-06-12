## ADDED Requirements

### Requirement: Store Memory Candidates Separately
The system SHALL store memory candidates as uncertain signals separate from long-term derived memory.

#### Scenario: Candidate created from explanation behavior
- **GIVEN** a user requests simpler wording, more background, marks an explanation confusing, marks an explanation inaccurate, or repeatedly expands related explanations
- **WHEN** the Runtime records the behavior
- **THEN** it SHALL write raw event evidence and MAY write a memory candidate with uncertainty and source event ids
- **AND** it SHALL NOT directly convert that candidate into a profile preference or concept state.

#### Scenario: Candidate created from provider output
- **GIVEN** a valid provider explanation contains structured hints such as terms, confidence, actions, or explanation summary
- **WHEN** the Runtime persists the explanation
- **THEN** it MAY write bounded memory candidates linked to the explanation version
- **AND** those candidates SHALL be treated as model-generated signals requiring summarizer review.

### Requirement: Summarizer Promotes Derived Learning Memory
The Memory Summarizer SHALL be the only component that promotes raw evidence or memory candidates into concept state, profile summary, or retrieval summary.

#### Scenario: Concept state is derived
- **GIVEN** multiple raw events or candidates support a familiar, confusing, muted, recently explained, needs simpler explanation, or preferred style signal
- **WHEN** the summarizer updates concept state
- **THEN** it SHALL write source event ids, source candidate ids when applicable, timestamp, summarizer version, and uncertainty
- **AND** it SHALL avoid certain mastery or certain non-understanding from ambiguous evidence.

#### Scenario: Profile summary is derived
- **GIVEN** repeated evidence supports a possible explanation preference or domain familiarity signal
- **WHEN** the summarizer updates profile summary
- **THEN** it SHALL store the summary with evidence references, uncertainty, and summarizer metadata
- **AND** it SHALL NOT treat a single accidental click or one model output as a durable user trait.

### Requirement: Retrieval Packet Is Recomputed From Runtime Memory
The retrieval packet used for explain and rewrite SHALL be assembled at request time from runtime-owned memory views and bounded raw evidence.

#### Scenario: Explain retrieval packet is built
- **GIVEN** SQLite contains concept state, profile summary, explanation history, feedback evidence, and retrieval summaries for a target
- **WHEN** the Runtime prepares an explain decision
- **THEN** it SHALL assemble a retrieval packet from those runtime-owned sources
- **AND** it SHALL label the packet as local learning state rather than world knowledge.

#### Scenario: Browser refresh loses no durable memory
- **GIVEN** the browser page is refreshed or the browser is closed
- **WHEN** the same Runtime SQLite store remains available
- **THEN** future retrieval packets SHALL continue to use runtime memory persisted in SQLite
- **AND** browser-local memory SHALL NOT be required.
