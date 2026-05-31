## ADDED Requirements

### Requirement: Background Mediates Adapter Dispatch
The background service worker SHALL own adapter selection, adapter dispatch, token application, provider request timeouts, provider response parsing entrypoints, and provider error normalization.

#### Scenario: Background dispatches adapter-backed explain request
- **GIVEN** a content script sends the standard explain message
- **AND** the active explain provider role is `custom` or `cloud` with an adapter configured
- **WHEN** background prepares the outbound request
- **THEN** it SHALL create the internal Agent request
- **AND** it SHALL send the request through the configured adapter
- **AND** it SHALL keep provider-specific protocol details out of the content script.

#### Scenario: Background dispatches adapter-backed embedding request
- **GIVEN** memory retrieval asks for an embedding through the standard background message
- **AND** the active embedding provider role is `custom` or `cloud` with an adapter configured
- **WHEN** background prepares the outbound request
- **THEN** it SHALL send sanitized text, metadata, configured model name, endpoint, path, and token context through the configured adapter.

### Requirement: Background Records Redacted Adapter Diagnostics
The background service worker SHALL expose adapter-backed provider diagnostics without exposing secrets.

#### Scenario: Adapter diagnostics include model and mode
- **WHEN** diagnostics are requested after an adapter-backed provider call
- **THEN** diagnostics SHALL include provider role, provider mode, adapter name, configured model name, capability kind, status, and normalized reason when present
- **AND** diagnostics SHALL NOT include provider token values.

#### Scenario: Adapter diagnostics redact endpoint secrets
- **GIVEN** the configured endpoint or path contains a secret query parameter
- **WHEN** diagnostics include provider routing state
- **THEN** diagnostics SHALL redact the secret query parameter value.

### Requirement: Background Preserves Local Gateway Reliability Behavior
Adapter dispatch SHALL NOT break existing local gateway timeout, pairing, health, memory, and capability handling.

#### Scenario: Local gateway unavailable through local mode
- **GIVEN** provider mode is `local`
- **AND** the localhost gateway is unreachable, unpaired, unhealthy, or missing a requested capability
- **WHEN** background handles the request
- **THEN** it SHALL return the existing normalized local gateway reason
- **AND** it SHALL not convert the failure to an OpenAI-compatible provider reason.
