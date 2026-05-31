## ADDED Requirements

### Requirement: Compose Short LLM Explanations From Structured Context
The system MUST use a large language model composer to generate short explanations from structured inputs rather than free-form full-page prompts.

#### Scenario: Generate from retrieval packet
- **GIVEN** policy selected a knowledge object for explanation
- **AND** a retrieval packet exists for that object
- **WHEN** the composer is invoked
- **THEN** the composer input MUST include the target object, knowledge type, minimal page context, memory summary, profile hints, explanation goal, and fact-sensitivity marker.

#### Scenario: Keep explanation short
- **GIVEN** the composer generates a micro explanation
- **WHEN** the explanation is returned
- **THEN** the explanation MUST be brief, understandable, and directly related to the current webpage context.

#### Scenario: Avoid new jargon
- **GIVEN** the composer explains a knowledge object
- **WHEN** it generates the explanation
- **THEN** it MUST avoid introducing unnecessary new terminology unless the term is essential and briefly clarified.

### Requirement: Composer Must Not Own Intervention Decision
The LLM composer MUST NOT decide whether to display an explanation, which object to prioritize, or how to update user memory.

#### Scenario: Policy selects target before generation
- **GIVEN** multiple candidate knowledge objects exist
- **WHEN** the composer is invoked
- **THEN** the composer MUST receive exactly the selected target object or an explicit small set selected by policy.

#### Scenario: Composer output is not a policy decision
- **GIVEN** the composer returns an explanation
- **WHEN** the system decides whether to render it
- **THEN** the final display decision MUST remain with the overlay policy layer.

#### Scenario: Memory update remains event-based
- **GIVEN** the composer produces explanation text
- **WHEN** memory is updated
- **THEN** the system MUST record explanation events and user responses rather than treating composer text as a user profile fact.

### Requirement: Regenerate Explanation With Feedback
The system MUST support regenerating explanations based on explicit user feedback, previous explanation content, target style, and reading profile hints.

#### Scenario: Regenerate from different angle
- **GIVEN** the user clicks a regenerate or different wording control
- **WHEN** the composer is invoked again
- **THEN** the composer input MUST include the previous explanation, feedback event, target object, minimal context, and requested rewrite style.

#### Scenario: Simpler explanation requested
- **GIVEN** the user requests a simpler explanation
- **WHEN** the composer regenerates the explanation
- **THEN** the regenerated explanation MUST use more basic language than the previous version.

#### Scenario: More background requested
- **GIVEN** the user requests more background
- **WHEN** the composer regenerates or expands the explanation
- **THEN** the generated content MUST explain the object's background or role while staying tied to the current context.

### Requirement: Track Explanation Versions
The system MUST record generated and regenerated explanation versions with enough metadata to support feedback learning and repetition control.

#### Scenario: Record initial explanation version
- **GIVEN** an explanation is shown
- **WHEN** the event is recorded
- **THEN** the system MUST store an explanation version identifier, target object, style, timestamp, and minimal prompt metadata.

#### Scenario: Record regenerated version
- **GIVEN** an explanation is regenerated
- **WHEN** the regenerated explanation is shown
- **THEN** the system MUST link the new version to the previous version and the triggering feedback event.

#### Scenario: Learn from accepted version
- **GIVEN** the user accepts or positively responds to a regenerated version
- **WHEN** the profile is updated
- **THEN** the system MUST use that outcome as evidence for future explanation style preference.
