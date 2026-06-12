## ADDED Requirements

### Requirement: Adapter Produces Persistable Explanation JSON
The runtime provider adapter SHALL normalize valid provider output into structured explanation data that can be persisted as an explanation version and reviewed as memory candidates.

#### Scenario: Structured explanation contains persistence metadata
- **GIVEN** the runtime adapter receives a valid provider response for explain or rewrite
- **WHEN** it normalizes the provider output
- **THEN** the result SHALL include explanation text, summary, confidence when available, terms, actions, target metadata, provider metadata, model metadata, schema metadata, and version metadata
- **AND** the Runtime SHALL be able to persist the result without parsing free-form text.

#### Scenario: Structured explanation is candidate-safe
- **GIVEN** normalized provider output includes model-generated terms, actions, or confidence
- **WHEN** the Runtime creates memory candidates from that output
- **THEN** those candidates SHALL reference the explanation version and provider metadata
- **AND** they SHALL be marked as uncertain model-derived signals.

### Requirement: Adapter Receives Runtime Memory Only
The runtime provider adapter SHALL receive sanitized runtime-owned memory context and SHALL NOT receive browser-derived memory context.

#### Scenario: Provider request includes retrieval context
- **GIVEN** runtime decision policy chooses `call_provider`
- **WHEN** the adapter builds the provider request
- **THEN** it SHALL include only filtered current context and sanitized runtime-owned retrieval packet fields
- **AND** it SHALL NOT include browser-provided memory packet, profile hints, feedback history, concept familiarity, or derived summaries.

#### Scenario: Invalid structured output is rejected
- **GIVEN** the provider returns unparseable JSON or JSON that fails the explanation schema
- **WHEN** the adapter handles the provider response
- **THEN** it SHALL return a structured invalid or unavailable result
- **AND** the Runtime SHALL NOT persist an explanation version from that provider output.
