## ADDED Requirements

### Requirement: Runtime Config Is Single Provider Default Source
Runtime provider role defaults SHALL be defined by runtime configuration code and consumed by Gateway, Local Agent Runtime, and Provider Runtime without duplicating provider default constants in the HTTP gateway module.

#### Scenario: Gateway runtime config is loaded
- **WHEN** gateway runtime provider configuration is created
- **THEN** explain, embedding, and relation proposer provider role defaults SHALL come from `runtime-config.js` or an equivalent single runtime configuration module
- **AND** the HTTP gateway module SHALL NOT maintain a separate provider default configuration copy.

#### Scenario: Provider Runtime reads defaults
- **GIVEN** no explicit provider role override is configured
- **WHEN** Provider Runtime resolves explain, embedding, or relation proposer role state
- **THEN** it SHALL use the same default values exposed by runtime configuration
- **AND** diagnostics SHALL not drift because of duplicated defaults.

### Requirement: Provider Runtime Owns Provider Dispatch
Provider Runtime SHALL own provider role validation, provider adapter client creation, timeout handling, provider capability state, provider role diagnostics, and normalized provider unavailable results.

#### Scenario: Explain role dispatches through adapter
- **GIVEN** the runtime explain provider role is enabled with an adapter-backed external provider
- **WHEN** Local Agent Runtime requests an explain or rewrite provider call
- **THEN** Provider Runtime SHALL validate the role configuration, create the adapter client, enforce the configured timeout, and return a stable Agent result.

#### Scenario: Embedding role dispatches through adapter
- **GIVEN** the runtime embedding provider role is enabled with an adapter-backed external provider
- **WHEN** Local Agent Runtime requests an embedding
- **THEN** Provider Runtime SHALL validate the embedding role configuration, create the adapter client, enforce the configured timeout, and return a stable embedding result or normalized unavailable result.

#### Scenario: Relation proposer dispatches through adapter
- **GIVEN** relation proposer configuration is enabled
- **WHEN** Memory Runtime schedules relation discovery with a relation proposer
- **THEN** Provider Runtime SHALL resolve the relation proposer role, including explain-role reuse when configured, and dispatch the structured relation proposal request.

### Requirement: Provider Runtime Uses Current Config Per Request
Provider Runtime SHALL resolve provider role configuration from the current effective runtime configuration when handling each provider-backed request.

#### Scenario: Hot update affects next provider request
- **WHEN** runtime provider configuration is hot-updated through the config API
- **THEN** the next explain, rewrite, embedding, or relation proposal dispatch SHALL use the updated effective provider configuration without rebuilding the HTTP gateway handler.

#### Scenario: Restart-required update does not replace active resources
- **WHEN** a configuration update includes restart-required memory store or listener fields
- **THEN** Provider Runtime SHALL preserve current provider dispatch behavior for normal provider requests
- **AND** diagnostics SHALL report the restart-required paths without treating them as hot-applied provider defaults.
