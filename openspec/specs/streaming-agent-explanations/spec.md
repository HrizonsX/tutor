# streaming-agent-explanations Specification

## Purpose
TBD - created by archiving change add-dual-lane-streaming-explanations. Update Purpose after archive.
## Requirements
### Requirement: Create Dual-Lane Streaming Sessions
The system SHALL support an Agent explanation streaming session with independent `direct` and `association` lanes for the same requested target.

#### Scenario: Session starts both lanes
- **GIVEN** content requests a streamed explanation for a valid target
- **WHEN** the streaming session is accepted
- **THEN** the system SHALL emit a `session_start` event
- **AND** it SHALL emit lane lifecycle events for both `direct` and `association` lanes.

#### Scenario: Lanes are independently identified
- **WHEN** any stream event is emitted for a lane
- **THEN** the event SHALL include the session id, event sequence, lane id, and event kind
- **AND** content SHALL be able to route the event to the matching overlay output area.

### Requirement: Stream Direct Explanation Without Recall
The direct lane SHALL stream a plain-text explanation of the requested target without waiting for runtime memory recall.

#### Scenario: Direct lane emits text first
- **GIVEN** a streaming session has started
- **WHEN** provider text is available for the direct lane
- **THEN** the system SHALL emit `lane_delta` events for lane `direct`
- **AND** those deltas SHALL be displayable before association recall or association generation completes.

#### Scenario: Direct lane skips memory recall
- **WHEN** the direct lane provider request is prepared
- **THEN** it SHALL include the target and minimal context
- **AND** it SHALL NOT include runtime memory packets, memory bridges, profile summaries, or browser-supplied memory fields.

### Requirement: Stream Association Explanation From Runtime Recall
The association lane SHALL use runtime-owned recall to explain relationships between the current target and recalled learned concepts.

#### Scenario: Association lane uses reliable bridges
- **GIVEN** runtime recall returns one or more reliable memory bridges for the current target
- **WHEN** the association lane provider request is prepared
- **THEN** it SHALL include the current target and selected memory bridges
- **AND** it SHALL instruct the provider to explain relationships rather than repeat a basic definition of the target.

#### Scenario: Association lane emits recall status
- **WHEN** association recall completes
- **THEN** the system SHALL emit a recall status event containing bounded user-displayable bridge names and bridge counts
- **AND** it SHALL label recalled bridges as local learning context rather than fact sources.

### Requirement: Preserve No-Association Output
The association lane SHALL produce a stable no-association state when no reliable memory bridge is available.

#### Scenario: No bridge found
- **GIVEN** runtime recall returns no reliable memory bridge for the target
- **WHEN** the association lane is finalized
- **THEN** the system SHALL emit a lane final event for lane `association` with reason `no_memory_bridge`
- **AND** the user-facing association area SHALL remain visible with no-association copy.

#### Scenario: Only weak candidates found
- **GIVEN** runtime recall finds candidates but policy rejects them for overlay use
- **WHEN** the association lane is finalized
- **THEN** the system SHALL emit a lane final event for lane `association` with reason `weak_candidates_only`
- **AND** it SHALL NOT ask the provider to generate an association explanation from rejected candidates.

### Requirement: Format Multiple Associations Predictably
The association lane SHALL use a bounded, predictable text structure when multiple recalled concepts are available.

#### Scenario: Multiple bridges are expanded
- **GIVEN** runtime recall returns more than one reliable bridge
- **WHEN** the association lane provider request is prepared
- **THEN** the request SHALL identify at most three expanded bridges for detailed relationship explanation
- **AND** it SHALL require one relationship-focused paragraph or list item per expanded bridge.

#### Scenario: Overflow bridges are mentioned briefly
- **GIVEN** runtime recall returns more reliable bridges than the expanded bridge limit
- **WHEN** the association lane provider request is prepared
- **THEN** the request SHALL identify overflow bridges as briefly mentioned concepts
- **AND** it SHALL not require detailed explanation for overflow bridges.

#### Scenario: Association summary is required
- **WHEN** an association lane has one or more expanded bridges
- **THEN** the final association text SHALL end with a concise summary sentence about how the recalled learning context relates to the current target.

### Requirement: Finalize Lanes With Stable Agent Results
Each streaming lane SHALL finish with a stable final Agent result or structured unavailable result.

#### Scenario: Lane completes successfully
- **WHEN** a lane finishes streaming available text
- **THEN** the system SHALL emit a `lane_final` event carrying a final result with status `available`, lane id, target, text, provider metadata, and runtime decision metadata when applicable.

#### Scenario: Lane fails
- **WHEN** provider, gateway, timeout, cancellation, or schema handling fails for a lane
- **THEN** the system SHALL emit `lane_error` or `lane_final` with a structured unavailable or invalid result
- **AND** it SHALL preserve normalized reason values for diagnostics.

### Requirement: Cancel Stale Stream Sessions
The system SHALL prevent stale stream sessions from updating the overlay after dismissal, feature disable, navigation, or a newer explanation request.

#### Scenario: Session is canceled
- **GIVEN** a stream session is in progress
- **WHEN** the overlay is dismissed or a newer stream session supersedes it
- **THEN** the browser SHALL request cancellation
- **AND** late events from the canceled session SHALL NOT update the overlay.

#### Scenario: Session finishes
- **WHEN** both lanes have reached final, error, or canceled state
- **THEN** the system SHALL emit a `session_done` event
- **AND** content SHALL clear pending stream state for that session.
