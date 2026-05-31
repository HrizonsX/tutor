## ADDED Requirements

### Requirement: Use Related Memories As Learning Context Only
The system SHALL treat related memories as uncertain user learning history rather than authoritative world knowledge.

#### Scenario: Related memory is not a fact source
- **GIVEN** a retrieval packet includes related memories
- **WHEN** the packet is used for explanation or rewrite context
- **THEN** each related memory SHALL be labeled as local learning context
- **AND** the system SHALL NOT present it as a verified definition, current fact, or authoritative source.

#### Scenario: Fact-sensitive target keeps source boundary
- **GIVEN** the current target or related concept is fact-sensitive
- **WHEN** related memories are included in the provider request
- **THEN** the request SHALL caution that related memories cannot establish current facts
- **AND** fact-sensitive explanation accuracy SHALL still depend on provider capability or source-aware flow.

### Requirement: Keep Exact Explanation Reuse Separate
The runtime SHALL use only exact prior explanation history for direct explanation reuse.

#### Scenario: Related prior explanation does not skip provider
- **GIVEN** a related concept has a prior explanation version
- **AND** the current target has no exact prior explanation version
- **WHEN** the runtime handles an explain request for the current target
- **THEN** it SHALL NOT return the related concept explanation as `return_existing_explanation`
- **AND** it SHALL call the provider when provider capability is available.

### Requirement: Preserve Association Uncertainty
The system SHALL preserve uncertainty, direction, and evidence metadata for associations in learning memory.

#### Scenario: Related memory exposes direction and evidence
- **WHEN** a related memory is returned in a retrieval packet
- **THEN** it SHALL include edge direction, relation type, confidence, source role, and evidence ids
- **AND** it SHALL not collapse the association into a certain relationship between real-world entities.
