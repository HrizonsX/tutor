## ADDED Requirements

### Requirement: Enter New Concepts As Independent Memory Units
The system SHALL create or retrieve a canonical concept unit for a newly selected or detected concept before attempting historical linkage.

#### Scenario: New concept does not require relation
- **WHEN** a current concept has no eligible historical connection
- **THEN** the system SHALL still record the concept as a canonical memory unit without inventing a relation.

#### Scenario: Alias match reuses concept
- **WHEN** a new surface form normalizes to an existing canonical concept
- **THEN** the system SHALL use the existing concept memory rather than creating a duplicate concept.

### Requirement: Build Narrow Historical Candidate Pools
The system SHALL build a bounded candidate pool before asking whether a new concept relates to historical memory.

#### Scenario: Candidate pool uses local evidence
- **WHEN** a new concept is evaluated for possible historical linkage
- **THEN** the candidate pool SHALL be limited to current context concepts, current session recent concepts, provider structured terms, existing one-hop relations, alias matches, or concepts from selected daily memory blocks.

#### Scenario: Full memory scan is forbidden
- **WHEN** relation discovery runs for a new concept
- **THEN** it SHALL NOT compare the concept against every stored historical concept as an unbounded all-pairs operation.

### Requirement: Treat Similarity As Candidate Signal Only
The system SHALL NOT convert semantic similarity or co-occurrence alone into an active typed relation.

#### Scenario: Similarity does not establish relation
- **WHEN** a historical concept is selected only because it is semantically similar to the current concept
- **THEN** the system SHALL treat it at most as a relation candidate and SHALL NOT make it active without stronger evidence.

#### Scenario: Co-occurrence does not establish strong relation
- **WHEN** two concepts appear in the same page, day, or summary without explicit relationship evidence
- **THEN** the system SHALL NOT create an active strong relation between them.
