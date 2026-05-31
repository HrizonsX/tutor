## MODIFIED Requirements

### Requirement: Return Structured Agent Explanation Results
The composer boundary SHALL accept and return structured Agent results through the unified Agent protocol rather than treating free-form text as sufficient.

#### Scenario: Agent returns explanation
- **GIVEN** the background service worker receives a successful Agent response
- **WHEN** the composer boundary validates it
- **THEN** the result SHALL include status, capability kind, target identity, micro explanation, ambiguity metadata, rewrite metadata when applicable, fact-sensitivity metadata, provider metadata, and explanation version metadata.

#### Scenario: Agent identifies ambiguity
- **GIVEN** the selected text could refer to multiple meanings
- **WHEN** the Agent returns an ambiguous result
- **THEN** the composer boundary SHALL preserve the ambiguity metadata
- **AND** it SHALL NOT choose a meaning by using local hardcoded world knowledge.

#### Scenario: Provider lacks explain or rewrite capability
- **GIVEN** provider health reports that explain or rewrite is unsupported
- **WHEN** the composer boundary receives a request requiring that capability
- **THEN** it SHALL return a structured unavailable result
- **AND** it SHALL NOT generate a local fallback explanation or rewrite.

## ADDED Requirements

### Requirement: Composer Uses Unified Agent Capability Kinds
The composer boundary SHALL use explicit Agent capability kinds for micro explanation, expanded explanation, regeneration, and rewrite.

#### Scenario: Micro explanation requested
- **WHEN** local policy requests a proactive micro explanation
- **THEN** the composer boundary SHALL send or validate an Agent request with an explicit explain capability kind and micro goal.

#### Scenario: Regeneration requested
- **GIVEN** the user requests simpler wording, more context, or a different angle
- **WHEN** the composer boundary prepares the request
- **THEN** it SHALL use the unified rewrite or explain capability kind according to provider capabilities
- **AND** it SHALL include previous version metadata and feedback event metadata.

### Requirement: Composer Receives Memory Packet From Repository Boundary
The composer boundary SHALL consume memory context prepared through the active memory repository boundary.

#### Scenario: Memory packet available
- **GIVEN** the active memory repository returns a sanitized memory packet
- **WHEN** the composer boundary invokes the Agent
- **THEN** it SHALL include the packet as learning state and history
- **AND** it SHALL label prior explanations as explanation history rather than verified world knowledge.

#### Scenario: Memory packet unavailable
- **GIVEN** memory repository context is unavailable or degraded
- **WHEN** the composer boundary invokes the Agent
- **THEN** it SHALL include the degraded-memory status in request constraints
- **AND** it SHALL NOT fabricate prior learning context.
