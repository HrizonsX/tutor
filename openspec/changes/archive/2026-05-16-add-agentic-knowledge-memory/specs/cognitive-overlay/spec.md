## ADDED Requirements

### Requirement: Provide Explanation Feedback Controls
The overlay MUST provide lightweight controls for users to give feedback on shown explanations without turning the overlay into a chat sidebar.

#### Scenario: Basic feedback controls shown
- **GIVEN** the overlay displays a short explanation
- **WHEN** the user views the explanation card
- **THEN** the card MUST offer controls for at least known, confusing, regenerate, inaccurate, and mute actions.

#### Scenario: Feedback recorded from card
- **GIVEN** the user selects a feedback control
- **WHEN** the overlay handles the selection
- **THEN** the system MUST record a structured feedback event tied to the target object and explanation version.

#### Scenario: Controls remain low interruption
- **GIVEN** the overlay displays feedback controls
- **WHEN** the card is rendered
- **THEN** the controls MUST remain compact and MUST NOT block the underlying reading flow.

### Requirement: Provide Regenerate Explanation Control
The overlay MUST provide a control for regenerating an explanation with a different wording, simpler style, or more context.

#### Scenario: Regenerate explanation
- **GIVEN** the user clicks the regenerate control
- **WHEN** the system requests a new explanation
- **THEN** the request MUST include the prior explanation version, target object, feedback reason, requested style, and current retrieval packet.

#### Scenario: Replace displayed version
- **GIVEN** a regenerated explanation is returned
- **WHEN** the overlay displays it
- **THEN** the overlay MUST link it to the previous version for memory and feedback tracking.

#### Scenario: Regeneration unavailable
- **GIVEN** regeneration cannot be completed because model access, verification, or context is unavailable
- **WHEN** the user requests regeneration
- **THEN** the overlay MUST fail quietly with a non-blocking state and MUST preserve the original explanation.

### Requirement: Allow Object And Category Muting
The overlay MUST allow users to suppress future proactive prompts for a specific object or category.

#### Scenario: Mute object
- **GIVEN** the user chooses not to see prompts for a specific object
- **WHEN** the overlay records the action
- **THEN** future proactive prompts for that object MUST be suppressed unless explicitly requested.

#### Scenario: Mute category
- **GIVEN** the user chooses not to see prompts for a category of knowledge objects
- **WHEN** the overlay records the action
- **THEN** future proactive prompts for that category MUST be lowered or suppressed according to profile policy.

#### Scenario: Mute is reversible
- **GIVEN** the user has muted an object or category
- **WHEN** the user clears that preference
- **THEN** future policy MUST stop applying the mute signal.
