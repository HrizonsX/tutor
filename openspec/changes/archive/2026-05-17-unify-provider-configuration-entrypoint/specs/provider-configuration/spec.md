## ADDED Requirements

### Requirement: Unified Provider Configuration Entrypoint
The system SHALL provide one canonical provider configuration entrypoint with separate `explain`, `embedding`, and top-level `localGateway` sections.

#### Scenario: Default provider configuration exists
- **WHEN** runtime provider configuration is loaded
- **THEN** the configuration SHALL include `explain`, `embedding`, and `localGateway` sections
- **AND** `explain` and `embedding` SHALL each include `enabled`, `provider`, `endpoint`, `token`, `modelName`, `timeoutMs`, and `health` fields
- **AND** `localGateway` SHALL include `endpoint`, `pairingToken`, `timeoutMs`, and `health` fields.

#### Scenario: Local gateway config is top-level
- **GIVEN** explain or embedding uses provider mode `local`
- **WHEN** background resolves local provider access
- **THEN** it SHALL read the gateway endpoint and pairing token from the top-level `localGateway` configuration
- **AND** it SHALL NOT require duplicated local gateway pairing fields under `explain` or `embedding`.

#### Scenario: Browser surfaces read provider state
- **WHEN** options, popup, background, or diagnostics needs provider configuration state
- **THEN** it SHALL read the same canonical provider configuration state through the provider configuration entrypoint or background runtime messaging.

### Requirement: Role-Specific Model And Token Configuration
The system SHALL allow explain and embedding providers to configure independent tokens and model names.

#### Scenario: Explain provider model and token are configured
- **GIVEN** the explain provider is enabled
- **WHEN** background prepares an explain or rewrite request
- **THEN** it SHALL use the explain provider token for that outbound request
- **AND** it SHALL include the configured explain `modelName` in the provider request when a model name is configured.

#### Scenario: Embedding provider model and token are configured
- **GIVEN** the embedding provider is enabled
- **WHEN** background prepares an embedding request
- **THEN** it SHALL use the embedding provider token for that outbound request
- **AND** it SHALL include the configured embedding `modelName` in the provider request when a model name is configured.

#### Scenario: Model name is opaque
- **WHEN** a model name is configured for explain or embedding
- **THEN** the browser extension SHALL treat the value as opaque configuration
- **AND** it SHALL NOT maintain provider model allowlists or reject the model because it is absent from a browser-side allowlist.

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
