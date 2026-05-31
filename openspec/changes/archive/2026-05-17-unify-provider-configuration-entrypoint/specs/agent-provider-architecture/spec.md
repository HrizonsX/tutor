## MODIFIED Requirements

### Requirement: Unified Provider Modes
The system SHALL support `off`, `local`, `custom`, and `cloud` provider modes for each provider role, and SHALL resolve explain and embedding providers through the unified provider configuration entrypoint.

#### Scenario: Provider mode is off
- **GIVEN** the requested provider role has provider mode `off`
- **WHEN** an explanation, rewrite, embedding, health, or memory-backed Agent request is attempted for that role
- **THEN** the system SHALL return a structured unavailable result with an explicit off-mode reason
- **AND** the content script SHALL NOT attempt any direct provider call.

#### Scenario: Provider mode is local
- **GIVEN** the requested provider role has provider mode `local`
- **WHEN** the background service worker needs Agent, embedding, or memory capabilities
- **THEN** it SHALL call the configured top-level localhost Agent/Gateway endpoint
- **AND** the endpoint and pairing token SHALL be treated as local gateway configuration rather than content-script dependencies.

#### Scenario: Provider mode is custom or cloud
- **GIVEN** the requested provider role has provider mode `custom` or `cloud`
- **WHEN** the background service worker resolves the active provider role
- **THEN** it SHALL use the role-specific endpoint, token, timeout, and configured model name
- **AND** provider-specific endpoint, credential, and permission handling SHALL remain outside the content script.

### Requirement: Stable Agent Protocol
The system SHALL define a stable Agent request and response contract for health, explain, rewrite, embedding, and memory-aware explanation capabilities.

#### Scenario: Agent request is sent
- **GIVEN** local policy selected a target or a user requested regeneration
- **WHEN** the background service worker sends an Agent request
- **THEN** the request SHALL include request id, capability kind, target identity, minimal context, retrieval or memory packet, constraints, provider mode, schema version, and configured model name when present.

#### Scenario: Agent returns structured status
- **WHEN** an Agent response is received
- **THEN** the response SHALL include a structured status such as `available`, `unavailable`, `ambiguous`, or `invalid`
- **AND** the system SHALL NOT infer provider state by parsing free-form text.

#### Scenario: Agent response is invalid
- **GIVEN** an Agent response is missing required fields for the requested capability
- **WHEN** the background service worker validates the response
- **THEN** it SHALL normalize the result to `invalid`
- **AND** no explanation version or memory update SHALL be persisted from that invalid response.

### Requirement: Provider Health And Capability Discovery
The system SHALL use `/health` or an equivalent capability discovery interface to identify whether the active provider role supports explain, rewrite, embedding, memory query, memory event write, and source-aware explanation.

#### Scenario: Health endpoint is reachable
- **GIVEN** the active provider role exposes health information
- **WHEN** the background service worker checks provider health
- **THEN** it SHALL record provider availability, capability flags, protocol version, role, configured model name when present, and checked timestamp.

#### Scenario: Capability is unsupported
- **GIVEN** the active provider role is healthy but does not support a requested capability
- **WHEN** that capability is requested
- **THEN** the system SHALL return a structured unavailable result with a capability-unsupported reason
- **AND** it SHALL NOT fall back to local fixture-generated knowledge text.

#### Scenario: Health check fails
- **GIVEN** the active provider role cannot be reached or returns malformed health data
- **WHEN** provider health is checked
- **THEN** the provider role SHALL be treated as unavailable for external calls until the health status is refreshed or the request independently succeeds.

### Requirement: Provider Switching Without Content Script Changes
The system SHALL allow switching explain and embedding provider roles among `off`, `local`, `custom`, and `cloud` without modifying content script behavior.

#### Scenario: Provider mode changes
- **GIVEN** the user or runtime configuration changes provider mode for explain or embedding
- **WHEN** a content script requests explanation, regeneration, or embedding through background messaging
- **THEN** the content script SHALL send the same message shape
- **AND** the background service worker SHALL route the request to the active provider role.

#### Scenario: Content script lacks provider details
- **WHEN** content script code runs on a page
- **THEN** it SHALL NOT need provider endpoint, token, API key, pairing token, host permission, model name, or provider-specific capability details.
