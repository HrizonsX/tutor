## ADDED Requirements

### Requirement: Display Dual Streaming Explanation Lanes
The overlay SHALL display streamed explanations in two independent low-interruption output areas: a direct explanation area and an association explanation area.

#### Scenario: Direct and association areas are shown
- **GIVEN** a streamed explanation session is started for a visible prompt
- **WHEN** the overlay renders the prompt
- **THEN** it SHALL show a direct explanation area
- **AND** it SHALL show an association explanation area even before association recall completes.

#### Scenario: Direct lane updates independently
- **WHEN** the overlay receives a direct lane delta for the active session
- **THEN** it SHALL append or replace direct explanation text in the direct area
- **AND** it SHALL NOT modify association explanation text.

#### Scenario: Association lane updates independently
- **WHEN** the overlay receives an association lane delta for the active session
- **THEN** it SHALL append or replace association explanation text in the association area
- **AND** it SHALL NOT modify direct explanation text.

### Requirement: Show Association Recall State
The overlay SHALL show association recall state in the association area before and during association text generation.

#### Scenario: Association is pending
- **GIVEN** association recall has not finalized
- **WHEN** the streaming prompt is visible
- **THEN** the association area SHALL show a compact pending state indicating that local learning associations are being checked.

#### Scenario: Reliable bridges are found
- **WHEN** the overlay receives recall status with reliable bridge display names
- **THEN** it SHALL show bounded recall indicators for those concepts
- **AND** it SHALL continue streaming association text below or near those indicators.

#### Scenario: No reliable association is found
- **WHEN** the overlay receives an association final event with reason `no_memory_bridge` or `weak_candidates_only`
- **THEN** it SHALL keep the association area visible
- **AND** it SHALL show no-association copy rather than hiding the area.

### Requirement: Render Multiple Recalled Concepts Compactly
The overlay SHALL render multiple recalled concepts without turning the prompt into a large chat sidebar.

#### Scenario: Multiple concepts are recalled
- **GIVEN** association recall returns multiple displayable bridge names
- **WHEN** the overlay renders recall indicators
- **THEN** it SHALL show a bounded compact list or chips for the top recalled concepts
- **AND** it SHALL avoid unbounded expansion of all recalled concepts in the card.

#### Scenario: Association text includes structured sections
- **WHEN** the association lane final text contains multiple bridge-focused sections
- **THEN** the overlay SHALL preserve readable line breaks or section boundaries
- **AND** it SHALL keep the card low-interruption and dismissible.

### Requirement: Preserve Existing Overlay Safety During Streaming
The overlay SHALL preserve dismissal, feedback, regeneration, and stale-result safety while streamed lanes are in progress.

#### Scenario: Prompt is dismissed during stream
- **GIVEN** a streamed prompt is visible
- **WHEN** the user dismisses it
- **THEN** the overlay SHALL hide the prompt
- **AND** it SHALL cause the active stream session to be canceled.

#### Scenario: Late events are ignored
- **GIVEN** a stream session has been canceled or superseded
- **WHEN** a late event from that session reaches the overlay
- **THEN** the overlay SHALL ignore the event
- **AND** it SHALL NOT overwrite the current prompt.

#### Scenario: Final lane result is recorded
- **WHEN** a lane final event is received for the active prompt
- **THEN** the overlay SHALL keep lane-specific final result metadata available for feedback and diagnostics
- **AND** it SHALL not treat partial deltas as durable memory by themselves.
