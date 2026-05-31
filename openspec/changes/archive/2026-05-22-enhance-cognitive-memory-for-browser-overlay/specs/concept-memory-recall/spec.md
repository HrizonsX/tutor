## ADDED Requirements

### Requirement: Maintain Concept Memory Projections
The Local Agent Runtime SHALL maintain concept-level memory projections as derived views over raw learning events.

#### Scenario: Concept projection uses event evidence
- **WHEN** the runtime builds a concept memory projection
- **THEN** the projection SHALL include canonical name, aliases, event counts, first seen timestamp, last seen timestamp, last explained timestamp, derived signals, uncertainty, and source event ids.

#### Scenario: Ambiguous events do not create certain mastery
- **WHEN** a concept projection is derived from dismissed, expanded, seen, or explained events
- **THEN** the projection SHALL NOT mark the concept as mastered or certainly not understood from a single ambiguous event.

### Requirement: Store Daily Summaries As Temporal Index
The Local Agent Runtime SHALL store structured daily memory summaries that index concepts, topics, event counts, and relation references by date.

#### Scenario: Daily summary records concepts by day
- **WHEN** the runtime creates a daily memory summary
- **THEN** the summary SHALL include the date, summary version, summary hash, topics, concept references, event counts, relation references, source event ids, and creation timestamp.

#### Scenario: Daily summary avoids raw page text
- **WHEN** a daily memory summary is persisted
- **THEN** it SHALL NOT store full page text or relation evidence snippets.

### Requirement: Discover Candidate Relations Through Day-Scoped Proposals
The Local Agent Runtime SHALL use daily summaries as a temporal index for relation discovery without comparing a new concept against all historical concepts.

#### Scenario: Day selector returns bounded relevant days
- **WHEN** relation discovery runs for a current concept
- **THEN** it SHALL select a bounded set of possibly relevant days from daily summaries before loading day-scoped concept blocks.

#### Scenario: Relation proposer receives day-scoped blocks
- **WHEN** the runtime invokes a relation proposer
- **THEN** the input SHALL identify which concepts and relation references belong to each selected date.

#### Scenario: Relation proposal uses structured schema
- **WHEN** the relation proposer returns candidates
- **THEN** each candidate SHALL include source canonical name, target canonical name, relation type, source date, confidence, basis, and overlay usability metadata.

### Requirement: Gate Relation Proposals Before Persistence
The Local Agent Runtime SHALL validate relation proposals before storing them as candidate, active, or rejected relations.

#### Scenario: Invalid proposal is rejected
- **WHEN** a proposal has invalid schema, unknown canonical names, unsupported relation type, self-loop, missing source date, or a target concept absent from the provided day block
- **THEN** the relation gate SHALL reject it and SHALL NOT create an active relation.

#### Scenario: Daily summary inference remains candidate
- **WHEN** a relation proposal is based only on daily summary inference or weak semantic similarity
- **THEN** the relation gate SHALL store it at most as a candidate relation
- **AND** it SHALL NOT make it usable for Overlay recall.

#### Scenario: Strong evidence can activate relation
- **WHEN** a relation proposal is based on explicit current context, provider structured relation, prior active relation, or repeated consistent evidence
- **THEN** the relation gate MAY store it as an active relation with confidence, source dates, evidence ids, hashes, and confidence reason.

### Requirement: Plan Overlay Recall With Narrow Policy
The runtime SHALL prepare Overlay memory recall with a narrow current-explanation-first policy.

#### Scenario: Overlay recall uses fast path
- **WHEN** an explanation is requested for a concept
- **THEN** the runtime SHALL query exact concept memory, session context, and active one-hop relations before provider dispatch.

#### Scenario: Overlay recall is bounded
- **WHEN** memory bridges are selected for an Overlay explanation
- **THEN** the runtime SHALL use relation depth 1 and SHALL cap micro explanation bridges to a small configured limit.

#### Scenario: No relation means no long-term bridge
- **WHEN** no exact history, session continuity, or active relation connects a historical concept to the current concept
- **THEN** the runtime SHALL NOT include that historical concept in Overlay recall.

### Requirement: Use Forgetting Awareness Only After Relevance
The runtime SHALL consider forgetting risk only after a historical concept is already eligible by exact match, session continuity, or active relation.

#### Scenario: Relevant old concept is boosted
- **WHEN** a historical concept is connected to the current concept by an active relation and has high forgetting risk
- **THEN** the runtime MAY raise that concept's recall priority within configured Overlay limits.

#### Scenario: Unrelated forgotten concept is excluded
- **WHEN** a historical concept has high forgetting risk but no eligible connection to the current concept
- **THEN** the runtime SHALL exclude it from Overlay recall.

### Requirement: Reuse One-Hop Memory For Repeated Concepts
The runtime SHALL use exact concept memory and ranked one-hop active relations when a previously encountered concept is explained again.

#### Scenario: Repeated concept loads ranked bridges
- **WHEN** a concept with prior memory is requested again
- **THEN** the runtime SHALL rank active one-hop relations by confidence, usefulness, recency, forgetting risk when relevant, and recent-use penalty before provider dispatch.

#### Scenario: Repeated concept does not send all relations
- **WHEN** a concept has more active relations than the Overlay policy limit
- **THEN** the runtime SHALL send only the selected top memory bridges to the provider.
