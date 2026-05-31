## ADDED Requirements

### Requirement: Support Structured Relation Proposal Output
Provider adapters that perform relation proposal SHALL request and validate structured JSON relation proposal output.

#### Scenario: Relation proposal schema is valid
- **WHEN** a provider returns relation proposal output
- **THEN** the adapter SHALL normalize source canonical name, target canonical name, relation type, source date, confidence, basis, usability metadata, and rejected candidate reasons.

#### Scenario: Relation proposal schema is invalid
- **WHEN** provider output cannot be parsed or does not match the relation proposal schema
- **THEN** the adapter SHALL return a structured unavailable or invalid result and SHALL NOT create relation state.

### Requirement: Constrain Relation Proposal Prompt Inputs
Provider adapters SHALL clearly distinguish current concept, selected daily memory blocks, historical concept ownership by date, allowed relation types, and output schema.

#### Scenario: Prompt preserves day ownership
- **WHEN** relation proposal input contains concepts from multiple days
- **THEN** the adapter SHALL preserve date grouping so the provider can identify which concept belongs to which day.

#### Scenario: Prompt forbids unsupported relation invention
- **WHEN** asking for relation proposals
- **THEN** the adapter SHALL instruct the provider to return only allowed relation types and to reject candidates when no useful relation is supported.

### Requirement: Treat Provider Relations As Proposals
Provider adapters SHALL label relation outputs as proposals for the runtime gate rather than active memory relations.

#### Scenario: Provider proposal is not active memory
- **WHEN** a provider returns a relation candidate
- **THEN** the adapter SHALL mark it as a proposal requiring runtime gate validation before active persistence.

#### Scenario: Provider output does not include evidence snippet storage
- **WHEN** a provider relation proposal includes textual rationale
- **THEN** the adapter SHALL pass only bounded rationale or reason codes needed for validation and SHALL NOT require evidence snippet persistence.
