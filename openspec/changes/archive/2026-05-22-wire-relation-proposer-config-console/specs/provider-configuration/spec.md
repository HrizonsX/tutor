## ADDED Requirements

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
