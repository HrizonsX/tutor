## ADDED Requirements

### Requirement: Consume Bounded Memory Bridges
The composer boundary SHALL accept bounded memory bridges prepared by Gateway / Local Agent Runtime.

#### Scenario: Composer receives bridge constraints
- **WHEN** a provider request includes memory bridges
- **THEN** the request SHALL include relation type, related concept, confidence, source role, caution, relation depth, and maximum bridge count.

#### Scenario: Composer does not receive unbounded graph
- **WHEN** a concept has more historical relations than the Overlay policy limit
- **THEN** the composer request SHALL include only the selected bounded bridge set.

### Requirement: Keep Current Explanation Primary
The composer SHALL use memory only to improve the current explanation and SHALL NOT let historical memory override the current target.

#### Scenario: Current target remains primary
- **WHEN** memory bridges are present
- **THEN** the generated explanation SHALL still explain the current target in the current context first.

#### Scenario: Unrelated memory is excluded
- **WHEN** memory context has no active relation or session continuity to the current target
- **THEN** the composer request SHALL NOT include it as a bridge.

### Requirement: Preserve Non-Authoritative Memory Boundary
The composer SHALL treat memory bridges as local learning context rather than verified factual source material.

#### Scenario: Memory bridge is cautioned
- **WHEN** a memory bridge is included in a composer request
- **THEN** it SHALL carry a caution that the bridge is not a fact source.

#### Scenario: Fact-sensitive explanation does not rely on memory
- **WHEN** the current target or bridge concept is fact-sensitive
- **THEN** the composer SHALL rely on provider capability or source-aware flow for factual accuracy rather than memory bridge content.
