# runtime-observability Specification

## Purpose
TBD - created by archiving change unify-local-agent-memory-gateway. Update Purpose after archive.
## Requirements
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

### Requirement: Diagnostics Do Not Change Explanation Strategy
Runtime diagnostics SHALL be used for debug, popup, and options surfaces, and SHALL NOT alter the core explanation strategy.

#### Scenario: Popup reads diagnostics
- **WHEN** the popup opens and reads diagnostics
- **THEN** reading diagnostics SHALL NOT trigger explanation generation, embedding generation, memory writes, provider switching, or overlay display.

#### Scenario: Debug state records suppression
- **GIVEN** local policy suppresses a proactive explanation
- **WHEN** the suppression is recorded for diagnostics
- **THEN** the diagnostics snapshot SHALL expose the suppression reason
- **AND** the core decision outcome SHALL remain the result of policy, provider, and memory inputs rather than diagnostics UI state.

### Requirement: Normalize Recent Agent Results For Troubleshooting
The system SHALL normalize the latest Agent, embedding, provider, and gateway result into a safe troubleshooting shape.

#### Scenario: Successful Agent result
- **GIVEN** an Agent request returns an available explanation
- **WHEN** diagnostics are updated
- **THEN** diagnostics SHALL include status, capability kind, provider role, provider mode, target identity, version id, configured model name or provider-returned model label when available, and timestamp.

#### Scenario: Failed Agent result
- **GIVEN** an Agent, embedding, provider, or gateway request returns unavailable, ambiguous, invalid, timeout, rate-limited, pairing-required, model-related, or capability-unsupported
- **WHEN** diagnostics are updated
- **THEN** diagnostics SHALL include the normalized status, provider role, capability kind, and reason
- **AND** it SHALL NOT expose API keys, provider tokens, pairing tokens, full page text, or unsanitized memory.

### Requirement: Expose Permission And Pairing Status
The system SHALL make extension permission and local pairing state visible to troubleshooting surfaces.

#### Scenario: Host permission missing
- **GIVEN** the active provider endpoint requires a host permission that is not available
- **WHEN** diagnostics are requested
- **THEN** diagnostics SHALL report missing permission in a structured form.

#### Scenario: Pairing configured
- **GIVEN** local gateway pairing is configured
- **WHEN** diagnostics are requested
- **THEN** diagnostics SHALL report that pairing exists
- **AND** diagnostics SHALL NOT reveal the pairing token value.

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

### Requirement: Report Runtime Explain Pipeline Diagnostics
Runtime diagnostics SHALL expose redacted explain pipeline state for troubleshooting filter, memory, decision, provider, persistence, and summarizer behavior.

#### Scenario: Explain decision is recorded
- **GIVEN** the Runtime handles an explain or rewrite request
- **WHEN** diagnostics are requested
- **THEN** diagnostics SHALL include the latest request capability, filter status, decision kind, normalized reasons, provider call status, memory freshness, persistence status, summarizer enqueue status, and timestamp
- **AND** diagnostics SHALL NOT expose full page text, raw memory payloads, provider tokens, or pairing tokens.

#### Scenario: SQLite store state is reported
- **GIVEN** the Local Memory Store is configured
- **WHEN** health or diagnostics are requested
- **THEN** the Runtime SHALL report SQLite availability, schema version, migration status, persistence mode, FTS availability when known, summarizer backlog, last summarizer run, and last summarizer error when present
- **AND** it SHALL NOT expose raw event bodies or unsanitized profile summaries.

#### Scenario: Provider skip is visible
- **GIVEN** runtime decision policy returns without calling a provider
- **WHEN** diagnostics are requested
- **THEN** diagnostics SHALL show that provider dispatch was skipped by runtime decision policy
- **AND** diagnostics SHALL include the structured decision reason without requiring free-form text parsing.
