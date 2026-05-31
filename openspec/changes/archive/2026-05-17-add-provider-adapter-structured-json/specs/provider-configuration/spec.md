## ADDED Requirements

### Requirement: Adapter Provider Role Configuration
The unified provider configuration SHALL allow explain and embedding roles to configure adapter-backed external provider routing.

#### Scenario: Adapter fields are available
- **WHEN** runtime provider configuration is loaded
- **THEN** `explain` and `embedding` role configuration SHALL support `adapter`, `endpoint`, `token`, `modelName`, `timeoutMs`, and `health`
- **AND** `explain` SHALL support `chatPath` and `structuredOutput`
- **AND** `embedding` SHALL support `embeddingPath`.

#### Scenario: Endpoint is a provider base URL
- **GIVEN** a role uses provider mode `custom` or `cloud`
- **AND** the role has an adapter configured
- **WHEN** background resolves provider access
- **THEN** it SHALL treat `endpoint` as a provider base URL
- **AND** it SHALL leave chat or embedding path joining to the adapter.

### Requirement: Direct Provider Token Configuration
The unified provider configuration SHALL allow role-specific direct `token` values to be configured and used for outbound provider requests.

#### Scenario: Direct explain token is configured
- **GIVEN** the explain provider role contains a non-empty `token`
- **WHEN** the adapter sends an explain or rewrite request
- **THEN** it SHALL use that token for the outbound provider credential
- **AND** it SHALL NOT expose the token to content scripts.

#### Scenario: Direct embedding token is configured
- **GIVEN** the embedding provider role contains a non-empty `token`
- **WHEN** the adapter sends an embedding request
- **THEN** it SHALL use that token for the outbound provider credential
- **AND** it SHALL NOT expose the token to content scripts.

#### Scenario: Diagnostics report token presence only
- **WHEN** diagnostics include provider role configuration
- **THEN** diagnostics SHALL report whether a role token is present
- **AND** diagnostics SHALL NOT include the token value.

### Requirement: Structured Output Configuration
The explain provider role configuration SHALL define how adapter-backed explain calls request structured JSON from the provider.

#### Scenario: Structured output mode is configured
- **GIVEN** explain provider mode is `custom` or `cloud`
- **AND** adapter `openai-compatible` is configured
- **WHEN** `structuredOutput.mode` is `json_schema`, `json_object`, or `prompt_json`
- **THEN** the adapter SHALL use that mode when constructing the provider request.

#### Scenario: Structured output config is invalid
- **GIVEN** explain provider mode is `custom` or `cloud`
- **AND** the configured structured-output mode is not supported by the selected adapter
- **WHEN** background resolves or dispatches the provider request
- **THEN** it SHALL return a structured unavailable result with reason `provider_model_unsupported` or a configuration-specific reason
- **AND** it SHALL NOT dispatch a best-effort request with guessed structured-output behavior.
