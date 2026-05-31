## ADDED Requirements

### Requirement: Browser Configuration Console
The browser extension SHALL provide a configuration console that can read, edit, validate, save, and refresh supported browser and Gateway / Local Agent Runtime configuration.

#### Scenario: Console reads current configuration
- **WHEN** the options page opens
- **THEN** it SHALL request current browser-local configuration, gateway-owned runtime configuration, and redacted diagnostics through background runtime messaging
- **AND** it SHALL render the current effective values without exposing secret values.

#### Scenario: Console saves supported runtime configuration
- **WHEN** the user saves provider, relation proposer, memory recall, composer, behavior, inference, or local gateway connection settings
- **THEN** the extension SHALL validate the editable fields
- **AND** it SHALL persist browser-local settings locally and send gateway-owned settings to the paired gateway configuration API.

#### Scenario: Console refreshes after save
- **WHEN** a configuration save succeeds
- **THEN** the options page SHALL refresh diagnostics and effective configuration state
- **AND** it SHALL show the new config version or update timestamp when provided.

### Requirement: Hot-Update Boundary
The configuration console SHALL distinguish hot-updatable settings from settings that require gateway restart or explicit maintenance operations.

#### Scenario: Hot-updatable settings are saved
- **WHEN** the user changes provider routing, relation proposer settings, recall limits, explanation limits, intervention thresholds, cooldowns, behavior thresholds, or gateway client connection settings
- **THEN** the system SHALL apply the change to the next relevant browser evaluation or gateway provider request without requiring a gateway process restart.

#### Scenario: Restart-required settings are edited
- **WHEN** the user attempts to change gateway host, gateway port, memory store mode, memory store directory, schema version, or destructive memory maintenance settings
- **THEN** the console SHALL identify the setting as restart-required or maintenance-only
- **AND** it SHALL NOT claim the change has been hot-applied.

### Requirement: Secret Redaction
The configuration console SHALL prevent configured secrets from being exposed through diagnostics, health snapshots, or exported configuration snapshots.

#### Scenario: Token is configured
- **GIVEN** a provider token, relation proposer token, or local gateway pairing token has been configured
- **WHEN** diagnostics, health, config reads, or exports are displayed
- **THEN** the system SHALL report token presence only
- **AND** it SHALL NOT return the token value.

#### Scenario: Endpoint contains query secret
- **GIVEN** an endpoint URL contains a token, key, api key, access token, secret, or client secret query parameter
- **WHEN** the endpoint is displayed in diagnostics or exported snapshots
- **THEN** the secret parameter value SHALL be redacted.

### Requirement: Browser Config Messaging
The background service SHALL expose explicit runtime messages for configuration read and update operations.

#### Scenario: Options requests config state
- **WHEN** the options page sends a config read message
- **THEN** the background service SHALL return browser-local configuration, redacted gateway configuration when reachable, config version metadata, and any structured unavailable reason.

#### Scenario: Options updates config state
- **WHEN** the options page sends a config update message
- **THEN** the background service SHALL persist browser-local configuration changes
- **AND** it SHALL forward gateway-owned configuration changes to the paired gateway instead of storing provider runtime secrets in content scripts.

### Requirement: Active Tabs Receive Browser Policy Updates
Browser-side policy changes SHALL become visible to content scripts without requiring a browser extension reinstall.

#### Scenario: Evaluation policy changes
- **WHEN** the user changes overlay enablement, behavior thresholds, inference thresholds, cooldowns, composer limits, or privacy limits
- **THEN** active content scripts SHALL receive or observe the updated browser policy before their next scheduled evaluation
- **AND** newly loaded pages SHALL use the latest saved browser-local configuration.
