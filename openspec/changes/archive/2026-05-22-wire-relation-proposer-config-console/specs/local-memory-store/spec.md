## ADDED Requirements

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
