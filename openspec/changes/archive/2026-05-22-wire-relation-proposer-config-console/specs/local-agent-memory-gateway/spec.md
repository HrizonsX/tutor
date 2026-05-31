## ADDED Requirements

### Requirement: Gateway Runtime Config API
The localhost gateway SHALL expose paired configuration endpoints or equivalent protocol actions for reading and updating gateway-owned runtime configuration.

#### Scenario: Config is read
- **WHEN** a paired browser extension requests gateway runtime configuration
- **THEN** the gateway SHALL return redacted effective runtime configuration, config version, update timestamp, supported hot-update fields, and restart-required field metadata.

#### Scenario: Config is updated
- **WHEN** a paired browser extension submits a valid gateway-owned configuration update
- **THEN** the gateway SHALL validate the update
- **AND** it SHALL persist and apply supported hot-updatable fields for subsequent requests.

#### Scenario: Config update is unauthorized
- **GIVEN** local pairing is required
- **WHEN** an unpaired or rejected request attempts to read or update runtime configuration
- **THEN** the gateway SHALL return a structured pairing-required or pairing-rejected result
- **AND** it SHALL NOT expose runtime configuration or secret presence metadata.

### Requirement: Gateway Applies Runtime Config Without Restart For Supported Fields
The gateway SHALL apply supported runtime configuration updates without requiring process restart.

#### Scenario: Provider runtime config changes
- **WHEN** provider or relation proposer routing configuration is updated successfully
- **THEN** subsequent `/explain`, `/rewrite`, `/embedding`, and scheduled relation proposal dispatches SHALL use the updated routing configuration.

#### Scenario: Memory recall policy changes
- **WHEN** relation depth, bridge caps, selected day limits, relation proposal concurrency, report limits, or forgetting window settings are updated successfully
- **THEN** subsequent memory query, recall planning, relation discovery, and report generation operations SHALL use the updated settings.

### Requirement: Gateway Owns Relation Proposer Dispatch
Gateway / Local Agent Runtime SHALL own relation proposer dispatch and SHALL NOT depend on browser-supplied relation proposals or memory bridges.

#### Scenario: Browser sends relation fields
- **GIVEN** an `/explain` or `/rewrite` request contains browser-provided relation proposals, relation candidates, memory bridges, daily summaries, or report context
- **WHEN** the gateway normalizes the request
- **THEN** it SHALL ignore those browser-provided memory graph fields
- **AND** it SHALL use only runtime-owned memory and relation proposer configuration.

#### Scenario: Runtime dispatches proposer
- **WHEN** relation discovery is scheduled by the gateway after successful explanation persistence
- **THEN** the gateway SHALL dispatch relation proposal through runtime-owned provider configuration
- **AND** it SHALL persist only gated relation records.
