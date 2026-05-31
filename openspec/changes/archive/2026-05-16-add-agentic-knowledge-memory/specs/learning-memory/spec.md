## ADDED Requirements

### Requirement: Record Knowledge Object Feedback Events
The system MUST record explicit user feedback about knowledge explanations as structured memory events associated with the target object, explanation version, context metadata, and feedback type.

#### Scenario: Record known feedback
- **GIVEN** the user marks an explanation or object as known
- **WHEN** the feedback is recorded
- **THEN** the system MUST store a `marked_known` event without permanently marking the object as mastered.

#### Scenario: Record confusing feedback
- **GIVEN** the user marks an explanation as confusing or not understood
- **WHEN** the feedback is recorded
- **THEN** the system MUST store a `marked_confusing` event without concluding that the user does not understand the object.

#### Scenario: Record wrong feedback
- **GIVEN** the user marks an explanation as inaccurate
- **WHEN** the feedback is recorded
- **THEN** the system MUST store a `marked_wrong` event and lower trust in that explanation version.

### Requirement: Record Regeneration Events
The system MUST record explanation regeneration as a memory event that links the target object, previous explanation version, requested style, and regenerated version.

#### Scenario: User requests different wording
- **GIVEN** the user clicks a regenerate control
- **WHEN** the request is recorded
- **THEN** the system MUST store the request with the target object, previous version, feedback reason, and requested style.

#### Scenario: Regenerated explanation receives feedback
- **GIVEN** the user responds to a regenerated explanation
- **WHEN** memory is updated
- **THEN** the system MUST link the response to the regenerated version and the original regeneration request.

### Requirement: Store Agentic Summaries With Evidence
The system MUST store agent-produced memory summaries only when they include source events, uncertainty, and timestamp metadata.

#### Scenario: Agent groups related objects
- **GIVEN** the agent proposes that two objects are related
- **WHEN** the relationship is stored
- **THEN** the system MUST store evidence events and uncertainty rather than a bare assertion.

#### Scenario: Agent derives user preference
- **GIVEN** the agent derives a likely preference from repeated feedback
- **WHEN** the preference is stored
- **THEN** the system MUST attach supporting event identifiers and avoid converting the preference into a permanent trait.

### Requirement: Preserve Minimal Context For Privacy
The system MUST store only the minimum necessary context for knowledge memory, feedback learning, and explanation regeneration.

#### Scenario: Store feedback context
- **GIVEN** the user provides feedback on an explanation
- **WHEN** the event is persisted
- **THEN** the system MUST store the target object, explanation version, feedback type, timestamp, and minimal fragment metadata.

#### Scenario: Avoid full page storage
- **GIVEN** the system records an encounter, explanation, or feedback event
- **WHEN** the event is persisted
- **THEN** the system MUST avoid storing full webpage text unless an explicit feature requires it.
