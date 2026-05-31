## ADDED Requirements

### Requirement: Infer Possible Confusion
The system MUST infer possible confusion by combining current content, reading behavior, and learning memory signals.

#### Scenario: Raise priority for complex weak concepts
- **GIVEN** the current content contains a complex concept
- **AND** the user has dwelled near that content
- **AND** learning memory marks the concept as possibly weak
- **WHEN** the system performs confusion inference
- **THEN** the system MUST raise the intervention priority for that concept.

#### Scenario: Lower priority for recently explained concepts
- **GIVEN** the current concept was recently explained
- **WHEN** the system encounters the concept again
- **THEN** the system MUST lower repeated explanation priority unless stronger confusion signals are present.

#### Scenario: Combine content and behavior evidence
- **GIVEN** the current fragment is concept dense
- **AND** the user repeatedly revisits or selects a precise term in that fragment
- **WHEN** the system performs confusion inference
- **THEN** the system MUST treat the combined evidence as stronger than either signal alone.

### Requirement: Prevent False Positive Interventions
The system MUST avoid triggering explanation prompts from a single ambiguous reading behavior.

#### Scenario: Do not trigger from long dwell alone
- **GIVEN** the user stays on a content fragment for a long time
- **AND** there is no repeated revisit, term selection, concept-dense content, or weak-concept memory signal
- **WHEN** the system performs confusion inference
- **THEN** the system MUST NOT show an explanation only because dwell time is long.

#### Scenario: Require content plus behavior or memory evidence
- **GIVEN** the system is considering a proactive intervention
- **WHEN** the intervention priority is calculated
- **THEN** the system MUST require at least one valid content signal and at least one valid behavior or memory signal before increasing intervention priority enough to prompt.

#### Scenario: Treat large selection as ambiguous
- **GIVEN** the user selects a large code block or large text span
- **WHEN** the system evaluates the behavior
- **THEN** the system MUST NOT directly assume confusion
- **AND** the system MUST treat the action as possible copying, excerpting, or note-taking behavior.

#### Scenario: Treat idle pages as possible absence
- **GIVEN** the user remains on a page for a long time without scrolling, selection, pointer activity, keyboard activity, or other reading behavior
- **WHEN** the system evaluates the state
- **THEN** the system MUST treat the state as possible absence or interruption
- **AND** the system MUST NOT immediately trigger an explanation.

#### Scenario: Suppress after recent dismissal
- **GIVEN** the user recently closed an explanation prompt
- **WHEN** similar trigger signals appear again within the cooldown period
- **THEN** the system MUST remain in cooldown
- **AND** the system MUST NOT show another similar prompt.

### Requirement: Score Intervention Priority
The system MUST produce an intervention priority that can be raised or lowered by positive and suppressing signals.

#### Scenario: Apply suppressing signals
- **GIVEN** positive confusion signals are present
- **AND** the user recently dismissed a similar prompt or the same paragraph is in cooldown
- **WHEN** the system scores intervention priority
- **THEN** the system MUST reduce the priority before deciding whether to show an overlay.

#### Scenario: Prefer silence for ambiguous evidence
- **GIVEN** evidence for confusion is weak or ambiguous
- **WHEN** the system chooses whether to intervene
- **THEN** the system MUST prefer not showing a prompt over frequent speculative interruptions.
