## ADDED Requirements

### Requirement: Gateway Exposes Streaming Explanation Session
Gateway / Local Agent Runtime SHALL expose a paired local streaming explanation endpoint or equivalent protocol action for dual-lane explanation sessions.

#### Scenario: Streaming capability is advertised
- **WHEN** gateway health or capability discovery is requested
- **THEN** the gateway SHALL report whether streaming explanation sessions are supported
- **AND** browser clients SHALL be able to fall back to existing non-stream `/explain` when streaming is unavailable.

#### Scenario: Existing explain endpoint remains compatible
- **WHEN** a browser client posts to existing `/explain`
- **THEN** the gateway SHALL preserve the current non-stream JSON response behavior
- **AND** streaming support SHALL NOT require existing callers to handle streamed events.

### Requirement: Gateway Orchestrates Direct And Association Lanes
Gateway / Local Agent Runtime SHALL orchestrate direct and association lanes for a streaming session while keeping memory recall runtime-owned.

#### Scenario: Direct lane starts without memory recall
- **GIVEN** a valid streaming explain request is accepted
- **WHEN** the direct lane provider request is created
- **THEN** the gateway SHALL create a plain-text provider request with target and minimal context
- **AND** it SHALL exclude runtime memory recall fields from that direct lane request.

#### Scenario: Association lane runs recall in parallel
- **GIVEN** a valid streaming explain request is accepted
- **WHEN** the streaming session starts
- **THEN** the gateway SHALL begin runtime memory recall for the association lane without blocking direct lane deltas
- **AND** the association lane SHALL use only runtime-selected memory bridges.

#### Scenario: Browser memory fields are ignored
- **GIVEN** a streaming explain request includes browser-provided memory packets, memory bridges, relation candidates, or daily summaries
- **WHEN** the gateway prepares either lane
- **THEN** Gateway / Local Agent Runtime SHALL ignore those browser-provided memory fields
- **AND** it SHALL use only runtime-owned memory state.

### Requirement: Gateway Handles Association Recall Outcomes
Gateway / Local Agent Runtime SHALL convert association recall outcomes into stream events and provider calls.

#### Scenario: Reliable bridges trigger association generation
- **GIVEN** runtime recall returns one or more overlay-eligible memory bridges
- **WHEN** association generation starts
- **THEN** the gateway SHALL emit recall status with bounded bridge display names
- **AND** it SHALL call the provider with an association-focused prompt.

#### Scenario: No reliable bridge skips provider
- **GIVEN** runtime recall returns no overlay-eligible memory bridge
- **WHEN** association recall completes
- **THEN** the gateway SHALL finalize the association lane with reason `no_memory_bridge` or `weak_candidates_only`
- **AND** it SHALL NOT dispatch an association provider call.

### Requirement: Gateway Finalizes Lane Results
Gateway / Local Agent Runtime SHALL wrap streamed lane text in stable Agent result envelopes for final events, persistence, and diagnostics.

#### Scenario: Direct final result is wrapped
- **WHEN** direct lane streaming completes successfully
- **THEN** the final direct result SHALL include status, lane id, target, text, provider role, provider mode, model metadata, and version metadata.

#### Scenario: Association final result includes recall metadata
- **WHEN** association lane streaming completes successfully
- **THEN** the final association result SHALL include selected memory bridge metadata, recall policy metadata, and non-fact-source caution metadata
- **AND** it SHALL preserve the association lane id.

#### Scenario: Lane failures remain structured
- **WHEN** provider dispatch, local cancellation, timeout, or stream parsing fails during a lane
- **THEN** the gateway SHALL emit a structured unavailable or invalid lane result with a normalized reason
- **AND** it SHALL NOT expose provider tokens, pairing tokens, raw memory payloads, or full page text.
