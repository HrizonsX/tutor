## ADDED Requirements

### Requirement: Return Structured Agent Explanation Results
The composer boundary SHALL accept and return structured Agent explanation results rather than treating free-form text as sufficient.

#### Scenario: Agent returns explanation
- **GIVEN** the background service worker receives a successful Agent response
- **WHEN** the composer boundary validates it
- **THEN** the result SHALL include status, target identity, micro explanation, ambiguity metadata, rewrite metadata when applicable, fact-sensitivity metadata, and explanation version metadata.

#### Scenario: Agent identifies ambiguity
- **GIVEN** the selected text could refer to multiple meanings
- **WHEN** the Agent returns an ambiguous result
- **THEN** the composer boundary SHALL preserve the ambiguity metadata
- **AND** it SHALL NOT choose a meaning by using local hardcoded world knowledge.

### Requirement: Forbid Knowledge Fallback Explanations
The composer boundary SHALL NOT generate production knowledge explanations from local fallback templates or hardcoded concept definitions.

#### Scenario: No model client or provider available
- **GIVEN** no Agent provider is configured or reachable
- **WHEN** a short explanation is requested
- **THEN** the composer boundary SHALL return a structured unavailable result
- **AND** it SHALL NOT return local fallback explanation text.

#### Scenario: Fixture data exists
- **GIVEN** local fixture definitions exist for tests or development demos
- **WHEN** production explanation generation runs
- **THEN** those fixtures MUST NOT be used to create user-facing knowledge explanations.

## MODIFIED Requirements

### Requirement: Compose Short LLM Explanations From Structured Context
The system MUST use an external Agent or large language model composer to generate short explanations from structured inputs rather than free-form full-page prompts or local fallback definitions.

#### Scenario: Generate from retrieval packet
- **GIVEN** policy selected a knowledge object for explanation
- **AND** a retrieval packet exists for that object
- **WHEN** the composer is invoked
- **THEN** the composer input MUST include the target object, knowledge type, minimal page context, memory summary, profile hints, explanation goal, and fact-sensitivity marker.

#### Scenario: Keep explanation short
- **GIVEN** the external Agent generates a micro explanation
- **WHEN** the explanation is returned
- **THEN** the explanation MUST be brief, understandable, and directly related to the current webpage context.

#### Scenario: Avoid new jargon
- **GIVEN** the external Agent explains a knowledge object
- **WHEN** it generates the explanation
- **THEN** it MUST avoid introducing unnecessary new terminology unless the term is essential and briefly clarified.

#### Scenario: Provider unavailable
- **GIVEN** no external Agent provider is configured or available
- **WHEN** the composer is invoked
- **THEN** it MUST return a structured unavailable result
- **AND** it MUST NOT synthesize a knowledge explanation locally.

### Requirement: Regenerate Explanation With Feedback
The system MUST support regenerating explanations through the external Agent based on explicit user feedback, previous explanation content, target style, and reading profile hints.

#### Scenario: Regenerate from different angle
- **GIVEN** the user clicks a regenerate or different wording control
- **WHEN** the composer is invoked again
- **THEN** the composer input MUST include the previous explanation, feedback event, target object, minimal context, and requested rewrite style.

#### Scenario: Simpler explanation requested
- **GIVEN** the user requests a simpler explanation
- **WHEN** the external Agent regenerates the explanation
- **THEN** the regenerated explanation MUST use more basic language than the previous version.

#### Scenario: More background requested
- **GIVEN** the user requests more background
- **WHEN** the external Agent regenerates or expands the explanation
- **THEN** the generated content MUST explain the object's background or role while staying tied to the current context.

#### Scenario: Regeneration provider unavailable
- **GIVEN** the user requests regeneration
- **AND** no external Agent provider is configured or available
- **WHEN** the request is processed
- **THEN** the system MUST return a structured unavailable result
- **AND** it MUST NOT replace the existing explanation with local fallback text.
