# provider-adapter-structured-json Specification

## Purpose
TBD - created by archiving change add-provider-adapter-structured-json. Update Purpose after archive.
## Requirements
### Requirement: Provider Adapter Boundary
The Local Agent Runtime SHALL route external provider calls through a Provider Adapter layer that converts internal Agent capability requests into provider-compatible API requests and converts provider responses back into the stable internal Agent result contract.

#### Scenario: External provider uses adapter
- **GIVEN** a gateway runtime explain or embedding provider role is enabled with an external provider mode
- **AND** the role configuration names an adapter
- **WHEN** the gateway sends a provider request
- **THEN** the request SHALL be dispatched through the configured adapter
- **AND** browser extension code SHALL NOT contain provider-specific URL, request body, response parsing, or error mapping logic.

#### Scenario: Browser gateway request bypasses adapter
- **GIVEN** the browser extension sends an internal Agent request to the localhost gateway
- **WHEN** the background service worker dispatches the request
- **THEN** it SHALL use the local gateway client
- **AND** it SHALL NOT route the browser request through the OpenAI-compatible adapter.

### Requirement: OpenAI-Compatible Chat Request Mapping
The gateway runtime SHALL provide an OpenAI-compatible chat completions adapter that builds requests from the configured runtime base endpoint, chat path, token, model name, internal Agent request, and structured-output mode.

#### Scenario: Chat completion request is constructed
- **GIVEN** the gateway runtime explain provider is configured with adapter `openai-compatible`
- **AND** the provider configuration contains `endpoint`, `chatPath`, `token`, and `modelName`
- **WHEN** an explain request is sent through the gateway
- **THEN** the adapter SHALL call the URL formed by joining `endpoint` and `chatPath`
- **AND** it SHALL send the runtime configured token as a bearer credential when present
- **AND** it SHALL set the provider request model to the configured `modelName`
- **AND** it SHALL include privacy-trimmed target, context, memory, goal, and constraints in chat messages.

#### Scenario: Chat structured output mode is applied
- **GIVEN** the gateway runtime explain provider has `structuredOutput.mode` set to `json_schema`, `json_object`, or `prompt_json`
- **WHEN** the adapter constructs the chat completions request
- **THEN** it SHALL apply the configured structured-output mode
- **AND** it SHALL keep the expected explanation JSON schema in the adapter-owned request construction.

### Requirement: Structured Explain JSON Response Parsing
The gateway-executed OpenAI-compatible chat adapter SHALL parse model output as JSON, validate it against the explanation schema, and normalize it into the internal Explanation Result shape before returning to the browser extension.

#### Scenario: Valid structured explanation is returned
- **GIVEN** the provider returns a successful OpenAI-compatible chat completions response
- **AND** the assistant message content is valid JSON matching the explanation schema
- **WHEN** the gateway adapter parses the response
- **THEN** it SHALL return an available Agent result containing `explanation`, `summary`, `confidence`, `terms`, `actions`, and `versionMetadata`
- **AND** it SHALL map `explanation` into the current `text` and `microExplanation` fields
- **AND** it SHALL preserve provider, model, schema, and structured-output metadata in `versionMetadata`.

#### Scenario: Provider returns invalid JSON
- **GIVEN** the provider returns a successful HTTP response
- **AND** the model output cannot be parsed as JSON
- **WHEN** the gateway adapter handles the response
- **THEN** it SHALL return a structured unavailable or invalid result with reason `provider_json_parse_failed`
- **AND** no explanation version SHALL be persisted from that response.

#### Scenario: Provider JSON fails schema validation
- **GIVEN** the provider returns parseable JSON
- **AND** the JSON does not match the required explanation schema
- **WHEN** the gateway adapter validates the JSON
- **THEN** it SHALL return a structured unavailable or invalid result with reason `provider_schema_invalid`
- **AND** no explanation version SHALL be persisted from that response.

### Requirement: OpenAI-Compatible Embedding Request Mapping
The gateway runtime SHALL provide an OpenAI-compatible embedding adapter that sends sanitized embedding input to the configured embedding path and normalizes vector responses.

#### Scenario: Embedding request is constructed
- **GIVEN** the gateway runtime embedding provider is configured with adapter `openai-compatible`
- **AND** the provider configuration contains `endpoint`, `embeddingPath`, `token`, and `modelName`
- **WHEN** an embedding request is sent through the gateway
- **THEN** the adapter SHALL call the URL formed by joining `endpoint` and `embeddingPath`
- **AND** it SHALL send the runtime configured token as a bearer credential when present
- **AND** it SHALL pass the configured `modelName` as the provider model.

#### Scenario: Embedding response is normalized
- **GIVEN** the provider returns an OpenAI-compatible embedding response with numeric vector data
- **WHEN** the gateway adapter parses the response
- **THEN** it SHALL return the vector in the internal embedding result shape
- **AND** it SHALL include the configured or provider-returned model metadata.

### Requirement: Provider Error Normalization
The adapter layer SHALL normalize provider and network failures into stable internal reason values.

#### Scenario: Provider rejects authentication
- **GIVEN** the provider returns HTTP 401 or 403
- **WHEN** the adapter handles the response
- **THEN** it SHALL return reason `provider_auth_failed`.

#### Scenario: Provider rate limits the request
- **GIVEN** the provider returns HTTP 429
- **WHEN** the adapter handles the response
- **THEN** it SHALL return reason `provider_rate_limited`.

#### Scenario: Provider or model rejects structured output
- **GIVEN** the provider rejects the configured model, response format, or structured-output option
- **WHEN** the adapter handles the response
- **THEN** it SHALL return reason `provider_model_unsupported`.

#### Scenario: Provider is unavailable
- **GIVEN** the provider request fails due to network failure, timeout, malformed provider envelope, or server unavailability
- **WHEN** the adapter handles the failure
- **THEN** it SHALL return reason `provider_unavailable`.

### Requirement: Support Structured Relation Proposal Output
Provider adapters that perform relation proposal SHALL request and validate structured JSON relation proposal output.

#### Scenario: Relation proposal schema is valid
- **WHEN** a provider returns relation proposal output
- **THEN** the adapter SHALL normalize source canonical name, target canonical name, relation type, source date, confidence, basis, usability metadata, and rejected candidate reasons.

#### Scenario: Relation proposal schema is invalid
- **WHEN** provider output cannot be parsed or does not match the relation proposal schema
- **THEN** the adapter SHALL return a structured unavailable or invalid result and SHALL NOT create relation state.

### Requirement: Constrain Relation Proposal Prompt Inputs
Provider adapters SHALL clearly distinguish current concept, selected daily memory blocks, historical concept ownership by date, allowed relation types, and output schema.

#### Scenario: Prompt preserves day ownership
- **WHEN** relation proposal input contains concepts from multiple days
- **THEN** the adapter SHALL preserve date grouping so the provider can identify which concept belongs to which day.

#### Scenario: Prompt forbids unsupported relation invention
- **WHEN** asking for relation proposals
- **THEN** the adapter SHALL instruct the provider to return only allowed relation types and to reject candidates when no useful relation is supported.

### Requirement: Treat Provider Relations As Proposals
Provider adapters SHALL label relation outputs as proposals for the runtime gate rather than active memory relations.

#### Scenario: Provider proposal is not active memory
- **WHEN** a provider returns a relation candidate
- **THEN** the adapter SHALL mark it as a proposal requiring runtime gate validation before active persistence.

#### Scenario: Provider output does not include evidence snippet storage
- **WHEN** a provider relation proposal includes textual rationale
- **THEN** the adapter SHALL pass only bounded rationale or reason codes needed for validation and SHALL NOT require evidence snippet persistence.

### Requirement: Structured Relation Proposal Adapter Calls
The provider adapter SHALL support OpenAI-compatible structured JSON calls for relation proposal requests.

#### Scenario: Relation proposal body is built
- **WHEN** the runtime constructs a relation proposal provider request
- **THEN** the adapter SHALL build messages containing target concept, current context hash, selected daily memory blocks, allowed relation types, allowed basis values, and proposal policy
- **AND** the request SHALL use the relation proposal schema when structured output mode is `json_schema`.

#### Scenario: Relation proposal output is parsed
- **WHEN** a relation proposal provider returns JSON content
- **THEN** the adapter SHALL parse and validate `relationCandidates`, `rejectedCandidates`, and optional `versionMetadata`
- **AND** invalid JSON or invalid schema SHALL produce structured provider parse or schema failure results.

### Requirement: Relation Proposal Prompt Preserves Proposal Boundary
Relation proposal adapter prompts SHALL describe model output as proposals for runtime gating rather than active memory writes.

#### Scenario: Prompt is constructed
- **WHEN** the adapter builds a relation proposal request
- **THEN** the system or user instructions SHALL state that relation output is only a proposal for runtime gating
- **AND** the prompt SHALL forbid unsupported relation types and require source date ownership to be preserved.

#### Scenario: No supported relation exists
- **WHEN** prior daily memory blocks contain no useful supported relation for the target
- **THEN** the provider response contract SHALL allow rejected candidates
- **AND** the runtime SHALL not require any relation candidate to be returned.

### Requirement: Adapter Produces Persistable Explanation JSON
The runtime provider adapter SHALL normalize valid provider output into structured explanation data that can be persisted as an explanation version and reviewed as memory candidates.

#### Scenario: Structured explanation contains persistence metadata
- **GIVEN** the runtime adapter receives a valid provider response for explain or rewrite
- **WHEN** it normalizes the provider output
- **THEN** the result SHALL include explanation text, summary, confidence when available, terms, actions, target metadata, provider metadata, model metadata, schema metadata, and version metadata
- **AND** the Runtime SHALL be able to persist the result without parsing free-form text.

#### Scenario: Structured explanation is candidate-safe
- **GIVEN** normalized provider output includes model-generated terms, actions, or confidence
- **WHEN** the Runtime creates memory candidates from that output
- **THEN** those candidates SHALL reference the explanation version and provider metadata
- **AND** they SHALL be marked as uncertain model-derived signals.

### Requirement: Adapter Receives Runtime Memory Only
The runtime provider adapter SHALL receive sanitized runtime-owned memory context and SHALL NOT receive browser-derived memory context.

#### Scenario: Provider request includes retrieval context
- **GIVEN** runtime decision policy chooses `call_provider`
- **WHEN** the adapter builds the provider request
- **THEN** it SHALL include only filtered current context and sanitized runtime-owned retrieval packet fields
- **AND** it SHALL NOT include browser-provided memory packet, profile hints, feedback history, concept familiarity, or derived summaries.

#### Scenario: Invalid structured output is rejected
- **GIVEN** the provider returns unparseable JSON or JSON that fails the explanation schema
- **WHEN** the adapter handles the provider response
- **THEN** it SHALL return a structured invalid or unavailable result
- **AND** the Runtime SHALL NOT persist an explanation version from that provider output.

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
