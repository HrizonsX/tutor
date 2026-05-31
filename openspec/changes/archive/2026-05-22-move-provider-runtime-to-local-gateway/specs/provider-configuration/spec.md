## MODIFIED Requirements

### Requirement: Unified Provider Configuration Entrypoint
The system SHALL split browser extension gateway configuration from Local Agent Runtime provider configuration.

#### Scenario: Browser extension default configuration exists
- **WHEN** browser runtime configuration is loaded
- **THEN** the configuration SHALL include a `localGateway` section with `endpoint`, `pairingToken`, `timeoutMs`, and `health` fields
- **AND** it SHALL NOT include external model-provider endpoint, token, modelName, adapter, chatPath, embeddingPath, or structuredOutput fields.

#### Scenario: Gateway runtime provider configuration exists
- **WHEN** the Local Agent Runtime starts
- **THEN** runtime provider configuration MAY include explain and embedding role sections with `enabled`, `provider`, `adapter`, `endpoint`, `token`, `modelName`, `chatPath`, `embeddingPath`, `structuredOutput`, `timeoutMs`, and `health` fields
- **AND** token values SHALL come from gateway runtime configuration or environment variables rather than browser extension defaults.

#### Scenario: Browser surfaces read provider state
- **WHEN** options, popup, background, or diagnostics needs provider state
- **THEN** it SHALL read browser-safe gateway state locally and redacted runtime provider state from gateway health or capabilities
- **AND** it SHALL NOT read raw provider tokens from extension configuration.

### Requirement: Role-Specific Model And Token Configuration
The Local Agent Runtime SHALL allow explain and embedding providers to configure independent tokens and model names, while the browser extension SHALL treat those values as runtime-owned.

#### Scenario: Explain provider model and token are configured
- **GIVEN** the gateway runtime explain provider is enabled
- **WHEN** the gateway prepares an explain or rewrite request
- **THEN** it SHALL use the explain provider token for that outbound provider request
- **AND** it SHALL include the configured explain `modelName` in the provider request when a model name is configured.

#### Scenario: Embedding provider model and token are configured
- **GIVEN** the gateway runtime embedding provider is enabled
- **WHEN** the gateway prepares an embedding request
- **THEN** it SHALL use the embedding provider token for that outbound provider request
- **AND** it SHALL include the configured embedding `modelName` in the provider request when a model name is configured.

#### Scenario: Browser extension lacks model provider secrets
- **WHEN** browser extension code runs
- **THEN** it SHALL NOT contain or persist provider token values
- **AND** it SHALL NOT require provider model names to dispatch explain, rewrite, or embedding requests.

### Requirement: Adapter Provider Role Configuration
The gateway runtime provider configuration SHALL allow explain and embedding roles to configure adapter-backed external provider routing.

#### Scenario: Adapter fields are available in gateway runtime
- **WHEN** gateway runtime provider configuration is loaded
- **THEN** explain and embedding role configuration SHALL support `adapter`, `endpoint`, `token`, `modelName`, `timeoutMs`, and `health`
- **AND** explain SHALL support `chatPath` and `structuredOutput`
- **AND** embedding SHALL support `embeddingPath`.

#### Scenario: Endpoint is a provider base URL
- **GIVEN** a gateway runtime role uses an external provider mode
- **AND** the role has an adapter configured
- **WHEN** the gateway resolves provider access
- **THEN** it SHALL treat `endpoint` as a provider base URL
- **AND** it SHALL leave chat or embedding path joining to the adapter.

### Requirement: Direct Provider Token Configuration
The gateway runtime provider configuration SHALL allow role-specific direct `token` values to be configured and used for outbound provider requests.

#### Scenario: Direct explain token is configured
- **GIVEN** the gateway runtime explain provider role contains a non-empty `token`
- **WHEN** the adapter sends an explain or rewrite request
- **THEN** it SHALL use that token for the outbound provider credential
- **AND** it SHALL NOT expose the token to the browser extension.

#### Scenario: Direct embedding token is configured
- **GIVEN** the gateway runtime embedding provider role contains a non-empty `token`
- **WHEN** the adapter sends an embedding request
- **THEN** it SHALL use that token for the outbound provider credential
- **AND** it SHALL NOT expose the token to the browser extension.

#### Scenario: Diagnostics report token presence only
- **WHEN** browser diagnostics or gateway health include provider role configuration
- **THEN** they SHALL report whether a role token is present
- **AND** they SHALL NOT include the token value.

### Requirement: Structured Output Configuration
The gateway runtime explain provider role configuration SHALL define how adapter-backed explain calls request structured JSON from the provider.

#### Scenario: Structured output mode is configured
- **GIVEN** the gateway runtime explain provider role has adapter `openai-compatible`
- **WHEN** `structuredOutput.mode` is `json_schema`, `json_object`, or `prompt_json`
- **THEN** the gateway-executed adapter SHALL use that mode when constructing the provider request.

#### Scenario: Structured output config is invalid
- **GIVEN** the gateway runtime explain provider role has an unsupported structured-output mode
- **WHEN** the gateway resolves or dispatches the provider request
- **THEN** it SHALL return a structured unavailable result with reason `provider_model_unsupported` or a configuration-specific reason
- **AND** it SHALL NOT dispatch a best-effort request with guessed structured-output behavior.
