# runtime-relation-proposer Specification

## Purpose
TBD - created by archiving change wire-relation-proposer-config-console. Update Purpose after archive.
## Requirements
### Requirement: Schedule Relation Proposal After Provider Success
Gateway / Local Agent Runtime SHALL schedule relation proposal discovery after a successful provider-backed explain or rewrite result has been persisted.

#### Scenario: Successful explain schedules relation discovery
- **GIVEN** a gateway `/explain` request calls a provider and receives an available result
- **WHEN** the runtime persists the explanation version and memory evidence
- **THEN** it SHALL schedule relation discovery for the explained target
- **AND** the scheduled discovery SHALL have access to the configured relation proposer.

#### Scenario: Provider failure does not schedule proposal
- **GIVEN** a gateway `/explain` or `/rewrite` request returns an unavailable or invalid provider result
- **WHEN** the runtime persists the failure event
- **THEN** it SHALL NOT create relation candidates from that failed provider result.

### Requirement: Dispatch Configured Relation Proposer
The runtime relation proposer SHALL use the current relation proposer configuration to produce structured relation candidates from selected daily memory blocks.

#### Scenario: Relation proposer reuses explain provider
- **GIVEN** relation proposer configuration is enabled with `reuseExplainProvider`
- **WHEN** scheduled relation discovery runs
- **THEN** it SHALL dispatch the relation proposal request through the current explain provider routing
- **AND** it SHALL use the relation proposal schema rather than the explanation schema.

#### Scenario: Relation proposer uses independent provider
- **GIVEN** relation proposer configuration is enabled with independent provider routing
- **WHEN** scheduled relation discovery runs
- **THEN** it SHALL dispatch the relation proposal request using the configured relation proposer endpoint, token, model, chat path, structured output mode, and timeout.

#### Scenario: Relation proposer disabled
- **GIVEN** relation proposer configuration is disabled or unavailable
- **WHEN** scheduled relation discovery runs
- **THEN** it SHALL leave relation candidates empty
- **AND** it SHALL record a skipped or unavailable relation proposer state for diagnostics.

### Requirement: Gate Relation Proposals Before Persistence
The runtime SHALL validate and gate every LLM relation proposal before it can become an active relation.

#### Scenario: Valid proposal is gated
- **GIVEN** a relation proposer returns structured relation candidates
- **WHEN** relation discovery processes the output
- **THEN** each candidate SHALL be validated against allowed relation types, basis values, canonical names, loaded source dates, and self-loop constraints
- **AND** only gated records SHALL be persisted to relation proposal storage.

#### Scenario: Weak inference remains candidate
- **GIVEN** a relation proposal is based only on daily-summary inference, semantic similarity, or weak co-occurrence
- **WHEN** the relation gate evaluates the candidate
- **THEN** the persisted relation SHALL remain candidate or rejected unless repeated or stronger evidence permits active status.

#### Scenario: Strong evidence can become active
- **GIVEN** a relation proposal has an explicit current-context, provider-structured, prior-active, or repeated-consistent-evidence basis
- **WHEN** the relation gate accepts the candidate
- **THEN** the persisted relation MAY become active and eligible for future `memoryBridges`.

### Requirement: Relation Proposal Is Non-Blocking
Relation proposal discovery SHALL NOT delay the user-visible explanation response.

#### Scenario: Proposer is slow
- **GIVEN** the provider explanation has already completed successfully
- **WHEN** scheduled relation proposal is still running
- **THEN** the gateway SHALL return the explanation result without waiting for relation proposal completion.

#### Scenario: Proposer fails
- **GIVEN** relation proposer dispatch times out, returns invalid JSON, fails schema validation, or is unavailable
- **WHEN** scheduled relation discovery handles the failure
- **THEN** the original explanation SHALL remain persisted
- **AND** diagnostics SHALL expose the relation proposer failure without fabricating relation candidates.

### Requirement: Later Explain Can Recall Proposed Bridges
Active relations created by relation proposal discovery SHALL be available as bounded memory bridges in later explanation requests.

#### Scenario: Active relation is recalled later
- **GIVEN** relation discovery has persisted an active relation between the current target and a prior learned concept
- **WHEN** a later `/explain` request queries memory for that target
- **THEN** the memory packet SHALL include bounded `memoryBridges` derived from active relations
- **AND** the provider request SHALL label those bridges as local learning context rather than factual source material.
