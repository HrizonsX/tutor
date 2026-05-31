## MODIFIED Requirements

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
