## ADDED Requirements

### Requirement: Runtime Config Diagnostics
Runtime diagnostics and gateway health SHALL expose redacted configuration metadata.

#### Scenario: Config metadata is reported
- **WHEN** diagnostics or gateway health are requested
- **THEN** the response SHALL include config version, last update timestamp, last update status, and whether a hot update or restart-required update was requested
- **AND** it SHALL NOT expose secret values.

#### Scenario: Config update fails validation
- **WHEN** a runtime configuration update is rejected
- **THEN** diagnostics SHALL expose a structured validation reason and affected field path
- **AND** the current effective configuration SHALL remain unchanged.

### Requirement: Relation Proposer Diagnostics
Runtime diagnostics and gateway health SHALL expose relation proposer and relation discovery state.

#### Scenario: Relation proposer status is reported
- **WHEN** diagnostics or gateway health are requested
- **THEN** the response SHALL include relation proposer enabled state, role routing mode, model name when configured, token presence, last run timestamp, last error, cache hit and miss counts, backlog size, and relation discovery status.

#### Scenario: Relation proposer secret is configured
- **GIVEN** relation proposer configuration contains a token or secret-bearing endpoint
- **WHEN** diagnostics or gateway health are requested
- **THEN** the response SHALL report token presence and redacted endpoint values only.

### Requirement: Config Update Audit Trail
The runtime SHALL keep a bounded diagnostic record of recent configuration update attempts.

#### Scenario: Config update succeeds
- **WHEN** a configuration update is accepted
- **THEN** diagnostics SHALL record the updated field paths, config version, timestamp, and hot-update class
- **AND** it SHALL omit raw token values.

#### Scenario: Config update requests restart-required fields
- **WHEN** a configuration update includes restart-required or maintenance-only fields
- **THEN** diagnostics SHALL record those field paths as not hot-applied
- **AND** it SHALL keep the active runtime state available for normal requests.
