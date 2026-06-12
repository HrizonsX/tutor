## ADDED Requirements

### Requirement: Finalize User Text Selection Before Recording Attention
The system SHALL distinguish transient selection candidates from a completed user text selection before recording selection attention signals.

#### Scenario: Drag selection finalizes after primary button release
- **GIVEN** the user starts a primary-button drag selection inside readable page content
- **WHEN** the primary button is released and the browser selection settles
- **THEN** the system SHALL treat the settled selected text as the only candidate for finalized selection handling
- **AND** it SHALL associate the finalized selection with the nearest eligible reading context fragment.

#### Scenario: Intermediate drag changes do not record attention
- **GIVEN** the selected text changes while the primary button remains pressed
- **WHEN** reading behavior is recorded during the drag gesture
- **THEN** the system SHALL NOT record those intermediate selection values as completed attention signals.

#### Scenario: Keyboard selection uses stable fallback
- **GIVEN** the user changes the selection without an active pointer gesture
- **WHEN** the selected text remains stable for the configured fallback interval
- **THEN** the system SHALL finalize that stable selection for validation and reading-context association.

#### Scenario: Cancelled selection gesture stays silent
- **GIVEN** a selection gesture is cancelled by pointer cancellation, page blur, visibility loss, or an empty final selection
- **WHEN** the system evaluates reading behavior
- **THEN** it SHALL NOT record a finalized selection attention signal for that cancelled gesture.
