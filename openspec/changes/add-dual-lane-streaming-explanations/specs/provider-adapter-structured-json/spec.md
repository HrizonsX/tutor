## ADDED Requirements

### Requirement: Support Plain-Text Streaming Chat Calls
The Provider Adapter layer SHALL support plain-text streaming chat calls for streaming explanation lanes without replacing existing structured JSON calls.

#### Scenario: Streaming chat request is constructed
- **GIVEN** a gateway runtime explain provider is configured with an OpenAI-compatible adapter
- **WHEN** Gateway / Local Agent Runtime requests a streaming explanation lane
- **THEN** the adapter SHALL construct a provider chat request using runtime-owned endpoint, path, token, model, target, context, lane goal, and constraints
- **AND** it SHALL request streamed provider output when the provider supports streaming.

#### Scenario: Existing structured calls remain unchanged
- **WHEN** Gateway / Local Agent Runtime requests a non-stream explanation, rewrite, embedding, or relation proposal
- **THEN** the adapter SHALL preserve existing structured JSON or embedding behavior
- **AND** streaming support SHALL NOT weaken existing schema validation requirements for those paths.

### Requirement: Parse Provider Streaming Deltas
The Provider Adapter layer SHALL convert provider streaming response chunks into stable internal text delta events.

#### Scenario: Provider sends text deltas
- **GIVEN** an OpenAI-compatible provider returns streamed chat chunks
- **WHEN** chunks contain assistant text deltas
- **THEN** the adapter SHALL emit ordered internal text delta events
- **AND** it SHALL preserve enough metadata for Gateway / Local Agent Runtime to associate deltas with the correct lane.

#### Scenario: Provider stream completes
- **WHEN** a provider stream completes successfully
- **THEN** the adapter SHALL return or emit the accumulated text with provider model metadata
- **AND** Gateway / Local Agent Runtime SHALL be able to wrap it as a final Agent lane result.

### Requirement: Normalize Streaming Provider Failures
The Provider Adapter layer SHALL normalize streaming provider failures into stable internal reasons.

#### Scenario: Streaming auth fails
- **GIVEN** the provider rejects a streaming chat request with HTTP 401 or 403
- **WHEN** the adapter handles the response
- **THEN** it SHALL return reason `provider_auth_failed`.

#### Scenario: Streaming model is unsupported
- **GIVEN** the provider rejects streaming, the configured model, or streaming response format
- **WHEN** the adapter handles the response
- **THEN** it SHALL return reason `provider_model_unsupported`.

#### Scenario: Streaming response is malformed
- **GIVEN** the provider returns malformed streaming chunks or a broken stream
- **WHEN** the adapter handles the failure
- **THEN** it SHALL return a structured unavailable or invalid result with a normalized provider streaming reason
- **AND** it SHALL NOT expose provider token values in diagnostics or responses.

### Requirement: Build Lane-Specific Streaming Prompts
Provider adapters SHALL construct lane-specific prompts for direct and association streaming lanes.

#### Scenario: Direct prompt is basic explanation
- **WHEN** the adapter builds a direct lane prompt
- **THEN** it SHALL instruct the provider to explain the current target plainly and concisely
- **AND** it SHALL NOT include memory bridge content.

#### Scenario: Association prompt is relationship-focused
- **WHEN** the adapter builds an association lane prompt
- **THEN** it SHALL instruct the provider to explain relationships between the current target and selected recalled concepts
- **AND** it SHALL caution that recalled concepts are local learning context and not authoritative fact sources.

#### Scenario: Association prompt handles multiple bridges
- **GIVEN** the association lane request contains multiple selected bridges
- **WHEN** the adapter builds the prompt
- **THEN** it SHALL ask the provider to explain at most the expanded bridge set in detail, mention overflow bridges briefly, and end with one concise association summary.
