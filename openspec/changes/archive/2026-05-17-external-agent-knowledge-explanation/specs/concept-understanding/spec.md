## ADDED Requirements

### Requirement: Prepare External Agent Explanation Request
The system SHALL prepare privacy-trimmed explanation request inputs for the external Agent after local policy selects a target, without using local world-knowledge definitions to answer the request.

#### Scenario: User selects a term
- **GIVEN** the user selects a short term in a technical or knowledge-bearing article
- **WHEN** local policy judges the selection worth explaining
- **THEN** the system SHALL pass the selected text, minimal surrounding context, retrieval packet summary, user memory hints, and request goal to the background service worker for Agent explanation.

#### Scenario: Local candidate unknown to fixtures
- **GIVEN** the selected term is not present in any local test fixture or alias list
- **WHEN** the term is precise enough to explain
- **THEN** the system SHALL still package it as an Agent explanation target
- **AND** it SHALL NOT generate a local generic definition for the unknown term.

## MODIFIED Requirements

### Requirement: Generate Micro Explanation
The system MUST obtain a short proactive explanation from the external Agent when intervention is selected and provider access is available.

#### Scenario: Generate short explanation after retrieval
- **GIVEN** the system infers likely confusion
- **AND** relevant learning context has been retrieved
- **WHEN** the system requests a micro explanation
- **THEN** the request MUST go through the background service worker to the external Agent
- **AND** the returned explanation MUST be brief, intuitive, related to the current context, and avoid unnecessary new terminology.

#### Scenario: Bridge to prior knowledge
- **GIVEN** the current concept is related to a concept the user recently encountered
- **WHEN** the system requests a micro explanation
- **THEN** the retrieval packet MUST include the relationship as local learning context
- **AND** the external Agent MAY use that relationship to bridge from prior context when useful.

#### Scenario: Provider unavailable for micro explanation
- **GIVEN** the local strategy selects a candidate for proactive explanation
- **AND** no external Agent provider is configured or available
- **WHEN** the system reaches explanation generation
- **THEN** the system MUST NOT generate a knowledge explanation from a local hardcoded concept library or fallback template
- **AND** the proactive overlay MUST remain silent.

### Requirement: Generate Expanded Explanation Content
The system MUST obtain fuller explanation or rewrite content from the external Agent when the user expands or regenerates an explanation and provider access is available.

#### Scenario: Include concept meaning and role
- **GIVEN** the user expands a micro explanation
- **WHEN** the system requests expanded content
- **THEN** the request MUST include the target, current explanation version, minimal context, retrieval packet summary, and requested goal
- **AND** the external Agent response MUST explain what the concept means and what role it plays in the current paragraph.

#### Scenario: Include prerequisites and associations
- **GIVEN** prerequisite knowledge or related historical concepts are available in local learning state
- **WHEN** the system requests expanded content
- **THEN** the retrieval packet MUST include those local learning-state hints
- **AND** the external Agent MAY use them to include useful prerequisites or links to concepts the user previously encountered.

#### Scenario: Provider unavailable for expansion
- **GIVEN** the user expands or regenerates an explanation
- **AND** no external Agent provider is configured or available
- **WHEN** expanded content cannot be generated
- **THEN** the system MUST fail quietly with a non-blocking unavailable state
- **AND** it MUST preserve the original explanation version if one exists.
