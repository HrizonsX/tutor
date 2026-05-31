## ADDED Requirements

### Requirement: Display Agent Explanation Versions Only
The overlay SHALL display knowledge explanations only when a valid Agent-returned explanation version is available.

#### Scenario: Agent returns micro explanation
- **GIVEN** the external Agent returns a valid micro explanation with version metadata
- **WHEN** the overlay renders the prompt
- **THEN** it SHALL display the returned explanation
- **AND** it SHALL record or reference the explanation version for future feedback.

#### Scenario: No valid explanation version
- **GIVEN** an Agent response is unavailable, invalid, or ambiguous without a displayable explanation
- **WHEN** the proactive overlay would otherwise show a prompt
- **THEN** the overlay SHALL remain silent
- **AND** it SHALL NOT display local fallback knowledge text.

### Requirement: Handle Provider Unavailability Without Blocking Reading
The overlay SHALL handle provider unavailable states without interrupting reading or replacing existing explanations with fabricated content.

#### Scenario: Proactive provider unavailable
- **GIVEN** local policy selected a candidate for proactive explanation
- **AND** the background service worker returns provider unavailable
- **WHEN** the overlay receives the result
- **THEN** it SHALL show no proactive knowledge card.

#### Scenario: Explicit regeneration provider unavailable
- **GIVEN** the user explicitly requests regeneration
- **AND** the background service worker returns provider unavailable
- **WHEN** the overlay handles the response
- **THEN** it SHALL show a compact non-blocking unavailable state
- **AND** it SHALL preserve the previous explanation text and version.
