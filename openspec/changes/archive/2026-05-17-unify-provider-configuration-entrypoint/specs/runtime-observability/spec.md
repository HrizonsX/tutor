## MODIFIED Requirements

### Requirement: Expose Runtime Diagnostics Snapshot
The system SHALL expose a read-only diagnostics snapshot for development and troubleshooting.

#### Scenario: Diagnostics requested
- **WHEN** debug, popup, or options code requests runtime diagnostics
- **THEN** the system SHALL return provider role modes, provider health, provider capabilities, active endpoints, configured model names, token presence, permission status, pairing status, last trigger decision, suppression reasons, last Agent result, latest provider error, and memory repository status.

#### Scenario: No provider configured
- **GIVEN** a provider role is `off` or provider configuration is incomplete
- **WHEN** diagnostics are requested
- **THEN** the snapshot SHALL identify the role, mode, and configuration status without attempting to generate an explanation or embedding.

#### Scenario: Local provider unreachable
- **GIVEN** provider mode is `local`
- **AND** the localhost gateway is unreachable
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

## ADDED Requirements

### Requirement: Redact Provider Diagnostics
Diagnostics SHALL redact provider secrets while preserving non-secret configuration values useful for troubleshooting.

#### Scenario: Diagnostics include configured model names
- **WHEN** diagnostics are requested
- **THEN** diagnostics SHALL include configured explain and embedding model names when present
- **AND** model names SHALL NOT be treated as secrets.

#### Scenario: Diagnostics hide provider tokens
- **WHEN** diagnostics are requested
- **THEN** diagnostics SHALL show provider token and local pairing token presence as booleans
- **AND** diagnostics SHALL NOT include raw token values.

#### Scenario: Diagnostics hide endpoint query secrets
- **GIVEN** an active endpoint contains query parameters such as token, key, api_key, access_token, or pairing_token
- **WHEN** diagnostics include the endpoint
- **THEN** diagnostics SHALL redact those parameter values.
