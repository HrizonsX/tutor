## ADDED Requirements

### Requirement: Validate Structured Provider JSON Explain Results
The composer boundary SHALL accept adapter-backed explain results only after provider JSON has been parsed, schema-validated, and normalized into the stable explanation result shape.

#### Scenario: Structured provider JSON becomes explanation version
- **GIVEN** an adapter returns an available explain result containing validated `explanation`, `summary`, `confidence`, `terms`, `actions`, and `versionMetadata`
- **WHEN** the composer boundary validates the result
- **THEN** it SHALL expose the explanation through the current `text` and `microExplanation` fields
- **AND** it SHALL preserve structured fields that are part of the stable Explanation Result
- **AND** it SHALL create explanation version metadata from the normalized provider metadata.

#### Scenario: Invalid provider JSON is rejected
- **GIVEN** the adapter returns reason `provider_json_parse_failed`
- **WHEN** the composer boundary handles the result
- **THEN** it SHALL return a structured unavailable or invalid result
- **AND** it SHALL NOT create or persist an explanation version.

#### Scenario: Schema-invalid provider JSON is rejected
- **GIVEN** the adapter returns reason `provider_schema_invalid`
- **WHEN** the composer boundary handles the result
- **THEN** it SHALL return a structured unavailable or invalid result
- **AND** it SHALL NOT replace an existing explanation with provider output.

### Requirement: Preserve External-Only Knowledge Generation
Structured JSON support SHALL NOT introduce a local concept library or local semantic explanation fallback.

#### Scenario: Provider unavailable during explain
- **GIVEN** no external provider, local gateway, or remote Agent is configured or available for explanation generation
- **WHEN** a short explanation is requested
- **THEN** the composer boundary SHALL return a structured unavailable result
- **AND** it SHALL NOT synthesize term explanations from local hardcoded knowledge.
