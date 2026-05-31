## ADDED Requirements

### Requirement: Provider Adapter Boundary
The system SHALL route external `custom` and `cloud` provider calls through a Provider Adapter layer that converts internal Agent capability requests into provider-compatible API requests and converts provider responses back into the stable internal Agent result contract.

#### Scenario: External provider uses adapter
- **GIVEN** an explain or embedding provider role is enabled with provider mode `custom` or `cloud`
- **AND** the role configuration names an adapter
- **WHEN** the background service sends a provider request
- **THEN** the request SHALL be dispatched through the configured adapter
- **AND** content scripts SHALL NOT contain provider-specific URL, request body, response parsing, or error mapping logic.

#### Scenario: Local provider bypasses adapter
- **GIVEN** an explain or embedding provider role uses provider mode `local`
- **WHEN** the background service sends a provider request
- **THEN** it SHALL continue to use the configured localhost gateway client
- **AND** it SHALL NOT route the local gateway request through the OpenAI-compatible adapter.

### Requirement: OpenAI-Compatible Chat Request Mapping
The system SHALL provide an OpenAI-compatible chat completions adapter that builds requests from the configured base endpoint, chat path, token, model name, internal Agent request, and structured-output mode.

#### Scenario: Chat completion request is constructed
- **GIVEN** the explain provider is configured with adapter `openai-compatible`
- **AND** the provider configuration contains `endpoint`, `chatPath`, `token`, and `modelName`
- **WHEN** an explain request is sent
- **THEN** the adapter SHALL call the URL formed by joining `endpoint` and `chatPath`
- **AND** it SHALL send the direct configured token as a bearer credential when present
- **AND** it SHALL set the provider request model to the configured `modelName`
- **AND** it SHALL include privacy-trimmed target, context, memory, goal, and constraints in chat messages.

#### Scenario: Chat structured output mode is applied
- **GIVEN** the explain provider has `structuredOutput.mode` set to `json_schema`, `json_object`, or `prompt_json`
- **WHEN** the adapter constructs the chat completions request
- **THEN** it SHALL apply the configured structured-output mode
- **AND** it SHALL keep the expected explanation JSON schema in the adapter-owned request construction.

### Requirement: Structured Explain JSON Response Parsing
The OpenAI-compatible chat adapter SHALL parse model output as JSON, validate it against the explanation schema, and normalize it into the internal Explanation Result shape.

#### Scenario: Valid structured explanation is returned
- **GIVEN** the provider returns a successful OpenAI-compatible chat completions response
- **AND** the assistant message content is valid JSON matching the explanation schema
- **WHEN** the adapter parses the response
- **THEN** it SHALL return an available Agent result containing `explanation`, `summary`, `confidence`, `terms`, `actions`, and `versionMetadata`
- **AND** it SHALL map `explanation` into the current `text` and `microExplanation` fields
- **AND** it SHALL preserve provider, model, schema, and structured-output metadata in `versionMetadata`.

#### Scenario: Provider returns invalid JSON
- **GIVEN** the provider returns a successful HTTP response
- **AND** the model output cannot be parsed as JSON
- **WHEN** the adapter handles the response
- **THEN** it SHALL return a structured unavailable or invalid result with reason `provider_json_parse_failed`
- **AND** no explanation version SHALL be persisted from that response.

#### Scenario: Provider JSON fails schema validation
- **GIVEN** the provider returns parseable JSON
- **AND** the JSON does not match the required explanation schema
- **WHEN** the adapter validates the JSON
- **THEN** it SHALL return a structured unavailable or invalid result with reason `provider_schema_invalid`
- **AND** no explanation version SHALL be persisted from that response.

### Requirement: OpenAI-Compatible Embedding Request Mapping
The system SHALL provide an OpenAI-compatible embedding adapter that sends sanitized embedding input to the configured embedding path and normalizes vector responses.

#### Scenario: Embedding request is constructed
- **GIVEN** the embedding provider is configured with adapter `openai-compatible`
- **AND** the provider configuration contains `endpoint`, `embeddingPath`, `token`, and `modelName`
- **WHEN** an embedding request is sent
- **THEN** the adapter SHALL call the URL formed by joining `endpoint` and `embeddingPath`
- **AND** it SHALL send the direct configured token as a bearer credential when present
- **AND** it SHALL pass the configured `modelName` as the provider model.

#### Scenario: Embedding response is normalized
- **GIVEN** the provider returns an OpenAI-compatible embedding response with numeric vector data
- **WHEN** the adapter parses the response
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
