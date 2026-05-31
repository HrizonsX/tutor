## MODIFIED Requirements

### Requirement: Expose Runtime Diagnostics Snapshot
The system SHALL expose read-only diagnostics covering browser gateway configuration, local gateway health, gateway capabilities, redacted runtime provider state, last trigger decision, last Agent result, latest provider or gateway error, and memory repository status.

#### Scenario: Diagnostics requested
- **WHEN** debug, popup, or options code requests runtime diagnostics
- **THEN** the system SHALL return browser gateway endpoint, gateway health, gateway capabilities, provider role availability, configured model names when provided by gateway health, token presence booleans, pairing status, last trigger decision, suppression reasons, last Agent result, latest provider or gateway error, and memory repository status.

#### Scenario: No runtime provider configured
- **GIVEN** the Local Agent Runtime provider role is `off` or provider configuration is incomplete
- **WHEN** diagnostics are requested
- **THEN** the snapshot SHALL identify the gateway role, mode, and configuration status from redacted gateway health or the latest gateway response
- **AND** it SHALL NOT attempt to generate an explanation or embedding.

#### Scenario: Local gateway unreachable
- **GIVEN** the localhost gateway is unreachable
- **WHEN** diagnostics are requested
- **THEN** the snapshot SHALL include the unreachable state, last checked timestamp, configured local gateway endpoint, and normalized reason.

### Requirement: Redact Provider Diagnostics
Diagnostics SHALL redact provider secrets while preserving non-secret runtime configuration values useful for troubleshooting.

#### Scenario: Diagnostics include configured model names
- **WHEN** gateway health or diagnostics include configured explain and embedding model names
- **THEN** browser diagnostics SHALL include those model names when present
- **AND** model names SHALL NOT be treated as secrets.

#### Scenario: Diagnostics hide provider tokens
- **WHEN** diagnostics include provider role or gateway runtime configuration
- **THEN** diagnostics SHALL show provider token and local pairing token presence as booleans
- **AND** diagnostics SHALL NOT include raw token values.

#### Scenario: Diagnostics hide endpoint query secrets
- **GIVEN** a gateway endpoint, provider endpoint, or path contains query parameters such as token, key, api_key, access_token, client_secret, or pairing_token
- **WHEN** diagnostics include the endpoint or path
- **THEN** diagnostics SHALL redact those parameter values.

## ADDED Requirements

### Requirement: Gateway Request Logging
The local gateway SHALL log inbound gateway requests and outbound provider adapter dispatches with redacted metadata suitable for development troubleshooting.

#### Scenario: Gateway logs inbound request
- **WHEN** the gateway receives `/explain`, `/rewrite`, `/embedding`, `/memory/events`, `/memory/query`, or `/health`
- **THEN** it SHALL log request start and finish events with method, path, status, and duration
- **AND** it SHALL redact pairing tokens and secret query parameters.

#### Scenario: Gateway logs provider adapter request
- **GIVEN** the gateway dispatches an external provider request through an adapter
- **WHEN** the provider request starts, succeeds, or fails
- **THEN** the gateway SHALL log capability kind, provider role, adapter, configured model name, status or normalized reason, and duration
- **AND** it SHALL NOT log provider token values or full request context.
