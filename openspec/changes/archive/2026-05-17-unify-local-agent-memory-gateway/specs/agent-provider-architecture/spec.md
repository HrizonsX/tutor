## ADDED Requirements

### Requirement: Unified Provider Modes
系统 SHALL 支持 `off`、`local`、`custom`、`cloud` 四种 provider 模式，并通过同一 provider registry 解析当前模式、endpoint、能力和失败状态。

#### Scenario: Provider mode is off
- **GIVEN** provider mode is `off`
- **WHEN** an explanation, rewrite, embedding, health, or memory-backed Agent request is attempted
- **THEN** the system SHALL return a structured unavailable result with an explicit off-mode reason
- **AND** the content script SHALL NOT attempt any direct provider call.

#### Scenario: Provider mode is local
- **GIVEN** provider mode is `local`
- **WHEN** the background service worker needs Agent or memory capabilities
- **THEN** it SHALL call the configured localhost Agent/Gateway endpoint
- **AND** the endpoint SHALL be treated as a local provider rather than as a content-script dependency.

#### Scenario: Provider mode is custom or cloud
- **GIVEN** provider mode is `custom` or `cloud`
- **WHEN** the background service worker resolves the active provider
- **THEN** it SHALL use the same Agent request/response contract as `local`
- **AND** provider-specific endpoint, credential, and permission handling SHALL remain outside the content script.

### Requirement: Stable Agent Protocol
系统 SHALL 定义稳定的 Agent request/response contract，用于 health、explain、rewrite、embedding 和 memory-aware explanation 能力。

#### Scenario: Agent request is sent
- **GIVEN** local policy selected a target or a user requested regeneration
- **WHEN** the background service worker sends an Agent request
- **THEN** the request SHALL include request id, capability kind, target identity, minimal context, retrieval or memory packet, constraints, provider mode, and schema version.

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
系统 SHALL use `/health` or an equivalent capability discovery interface to identify whether the active provider supports explain, rewrite, embedding, memory query, memory event write, and source-aware explanation.

#### Scenario: Health endpoint is reachable
- **GIVEN** the active provider exposes health information
- **WHEN** the background service worker checks provider health
- **THEN** it SHALL record provider availability, capability flags, protocol version, and checked timestamp.

#### Scenario: Capability is unsupported
- **GIVEN** the active provider is healthy but does not support a requested capability
- **WHEN** that capability is requested
- **THEN** the system SHALL return a structured unavailable result with a capability-unsupported reason
- **AND** it SHALL NOT fall back to local fixture-generated knowledge text.

#### Scenario: Health check fails
- **GIVEN** the active provider cannot be reached or returns malformed health data
- **WHEN** provider health is checked
- **THEN** the provider SHALL be treated as unavailable for external calls until the health status is refreshed or the request independently succeeds.

### Requirement: Provider Switching Without Content Script Changes
系统 SHALL allow switching among `off`, `local`, `custom`, and `cloud` providers without modifying content script behavior.

#### Scenario: Provider mode changes
- **GIVEN** the user or runtime configuration changes provider mode
- **WHEN** a content script requests explanation or regeneration through background messaging
- **THEN** the content script SHALL send the same message shape
- **AND** the background service worker SHALL route the request to the active provider.

#### Scenario: Content script lacks provider details
- **WHEN** content script code runs on a page
- **THEN** it SHALL NOT need provider endpoint, token, API key, host permission, or provider-specific capability details.
