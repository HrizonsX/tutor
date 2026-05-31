## ADDED Requirements

### Requirement: Expose Runtime Diagnostics Snapshot
系统 SHALL expose a read-only diagnostics snapshot for development and troubleshooting.

#### Scenario: Diagnostics requested
- **WHEN** debug, popup, or options code requests runtime diagnostics
- **THEN** the system SHALL return provider mode, provider health, provider capabilities, permission status, pairing status, last trigger decision, suppression reasons, last Agent result, and memory repository status.

#### Scenario: No provider configured
- **GIVEN** provider mode is `off` or provider configuration is incomplete
- **WHEN** diagnostics are requested
- **THEN** the snapshot SHALL identify the mode and configuration status without attempting to generate an explanation.

#### Scenario: Local provider unreachable
- **GIVEN** provider mode is `local`
- **AND** the localhost gateway is unreachable
- **WHEN** diagnostics are requested
- **THEN** the snapshot SHALL include the unreachable state, last checked timestamp, and normalized reason.

### Requirement: Diagnostics Do Not Change Explanation Strategy
运行时观测状态 SHALL be used for debug, popup, and options surfaces, and SHALL NOT alter the core explanation strategy.

#### Scenario: Popup reads diagnostics
- **WHEN** the popup opens and reads diagnostics
- **THEN** reading diagnostics SHALL NOT trigger explanation generation, memory writes, provider switching, or overlay display.

#### Scenario: Debug state records suppression
- **GIVEN** local policy suppresses a proactive explanation
- **WHEN** the suppression is recorded for diagnostics
- **THEN** the diagnostics snapshot SHALL expose the suppression reason
- **AND** the core decision outcome SHALL remain the result of policy, provider, and memory inputs rather than diagnostics UI state.

### Requirement: Normalize Recent Agent Results For Troubleshooting
系统 SHALL normalize the latest Agent and gateway result into a safe troubleshooting shape.

#### Scenario: Successful Agent result
- **GIVEN** an Agent request returns an available explanation
- **WHEN** diagnostics are updated
- **THEN** diagnostics SHALL include status, capability kind, provider mode, target identity, version id, model or provider label when available, and timestamp.

#### Scenario: Failed Agent result
- **GIVEN** an Agent or gateway request returns unavailable, ambiguous, invalid, timeout, rate-limited, pairing-required, or capability-unsupported
- **WHEN** diagnostics are updated
- **THEN** diagnostics SHALL include the normalized status and reason
- **AND** it SHALL NOT expose API keys, pairing tokens, full page text, or unsanitized memory.

### Requirement: Expose Permission And Pairing Status
系统 SHALL make extension permission and local pairing state visible to troubleshooting surfaces.

#### Scenario: Host permission missing
- **GIVEN** the active provider endpoint requires a host permission that is not available
- **WHEN** diagnostics are requested
- **THEN** diagnostics SHALL report missing permission in a structured form.

#### Scenario: Pairing configured
- **GIVEN** local gateway pairing is configured
- **WHEN** diagnostics are requested
- **THEN** diagnostics SHALL report that pairing exists
- **AND** diagnostics SHALL NOT reveal the pairing token value.
