# provider-configuration Specification

## Purpose
TBD - created by archiving change unify-provider-configuration-entrypoint. Update Purpose after archive.
## Requirements
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

### Requirement: Structured Provider Configuration Validation
The system SHALL validate provider configuration structure and return structured unavailable or error results for missing or invalid configuration.

#### Scenario: Provider role is disabled or off
- **GIVEN** a provider role is disabled or has provider mode `off`
- **WHEN** background receives a request for that role
- **THEN** it SHALL return a structured unavailable result with an explicit disabled or off-mode reason
- **AND** it SHALL NOT silently fall back to another provider.

#### Scenario: Enabled provider is missing required routing data
- **GIVEN** a provider role is enabled
- **AND** the role configuration does not contain the routing data needed to dispatch the request
- **WHEN** background resolves the provider role
- **THEN** it SHALL return a structured unavailable result with a configuration reason
- **AND** it SHALL NOT dispatch a best-effort request with guessed endpoint or credential values.

#### Scenario: Local gateway is not paired
- **GIVEN** a request needs the local gateway
- **AND** the top-level local gateway pairing token is missing or rejected
- **WHEN** background resolves the request
- **THEN** it SHALL return a structured unavailable result with a pairing-required or pairing-rejected reason.

#### Scenario: Provider reports model failure
- **GIVEN** a configured provider rejects a model name or otherwise reports a model-related failure
- **WHEN** background handles the provider response
- **THEN** it SHALL normalize the failure into a structured unavailable or error result
- **AND** it SHALL NOT replace the configured model name with a hidden fallback model.

### Requirement: Redacted Provider Configuration State
The system SHALL expose redacted provider configuration state for troubleshooting without exposing secret values.

#### Scenario: Diagnostics include configured model names
- **WHEN** diagnostics are requested
- **THEN** diagnostics SHALL include the configured explain model name and embedding model name when present.

#### Scenario: Diagnostics include token presence
- **WHEN** diagnostics are requested
- **THEN** diagnostics SHALL report whether explain token, embedding token, and local gateway pairing token values are present
- **AND** diagnostics SHALL NOT reveal the token values.

#### Scenario: Diagnostics redact endpoint secrets
- **GIVEN** an endpoint contains a query token, API key, or other secret query parameter
- **WHEN** diagnostics include the endpoint
- **THEN** diagnostics SHALL redact the secret value before returning the diagnostics snapshot.

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

### Requirement: Relation Proposer Provider Role
The provider configuration SHALL include a relation proposer role for LLM-backed relation discovery.

#### Scenario: Default relation proposer role exists
- **WHEN** runtime provider configuration is loaded
- **THEN** the configuration SHALL include a `relationProposer` section
- **AND** it SHALL include `enabled`, `reuseExplainProvider`, `provider`, `adapter`, `endpoint`, `token`, `modelName`, `chatPath`, `structuredOutput`, `timeoutMs`, and `health` fields.

#### Scenario: Relation proposer reuses explain role
- **GIVEN** `relationProposer.reuseExplainProvider` is true
- **WHEN** the runtime dispatches a relation proposal request
- **THEN** it SHALL use current explain provider routing and credentials
- **AND** it SHALL use relation proposal request construction and validation.

#### Scenario: Relation proposer has independent routing
- **GIVEN** `relationProposer.reuseExplainProvider` is false
- **WHEN** the runtime dispatches a relation proposal request
- **THEN** it SHALL use the relation proposer role's endpoint, token, model name, adapter, chat path, structured output, and timeout.

### Requirement: Hot-Updatable Provider Configuration
Provider routing configuration SHALL be mutable at runtime for the next relevant provider request.

#### Scenario: Explain provider config changes
- **WHEN** the explain provider endpoint, token, model name, chat path, structured output mode, enabled state, adapter, provider mode, or timeout is updated through the runtime config API
- **THEN** the next explain or rewrite provider dispatch SHALL use the updated value without restarting the gateway process.

#### Scenario: Embedding provider config changes
- **WHEN** the embedding provider endpoint, token, model name, embedding path, enabled state, adapter, provider mode, or timeout is updated through the runtime config API
- **THEN** the next embedding dispatch SHALL use the updated value without restarting the gateway process.

#### Scenario: Relation proposer config changes
- **WHEN** relation proposer provider configuration is updated through the runtime config API
- **THEN** the next scheduled relation discovery dispatch SHALL use the updated value without restarting the gateway process.

### Requirement: Restart-Required Provider Settings
Provider configuration SHALL identify settings that are not ordinary hot-updatable settings.

#### Scenario: Listener setting is changed
- **WHEN** a configuration update attempts to change gateway host or gateway port
- **THEN** the system SHALL report that the setting requires restart or listener maintenance
- **AND** it SHALL NOT report the setting as hot-applied.

#### Scenario: Store resource setting is changed
- **WHEN** a configuration update attempts to change memory store mode, memory store path, or schema version
- **THEN** the system SHALL report that the setting requires restart or explicit maintenance
- **AND** it SHALL preserve the current active store for normal memory requests.
