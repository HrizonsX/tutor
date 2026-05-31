## ADDED Requirements

### Requirement: Adapter Routing For External Provider Modes
The provider architecture SHALL route `custom` and `cloud` provider modes through the configured Provider Adapter while preserving current local gateway behavior.

#### Scenario: Custom provider routes through adapter
- **GIVEN** the active provider role has provider mode `custom`
- **AND** the role configuration names an adapter
- **WHEN** the background service sends an explain, rewrite, embedding, or health request for that role
- **THEN** it SHALL dispatch the request through the configured adapter
- **AND** the adapter SHALL receive the role-specific endpoint, token, timeout, model name, and adapter settings.

#### Scenario: Cloud provider routes through adapter
- **GIVEN** the active provider role has provider mode `cloud`
- **AND** the role configuration names an adapter
- **WHEN** the background service sends an explain, rewrite, embedding, or health request for that role
- **THEN** it SHALL dispatch the request through the configured adapter
- **AND** the content script message shape SHALL remain unchanged.

#### Scenario: Local provider remains gateway based
- **GIVEN** the active provider role has provider mode `local`
- **WHEN** the background service sends an Agent, embedding, health, or memory-backed request
- **THEN** it SHALL use the top-level local gateway endpoint and pairing token
- **AND** it SHALL NOT require OpenAI-compatible adapter configuration.

### Requirement: Adapter Results Preserve Stable Agent Protocol
The Provider Adapter layer SHALL return results that conform to the stable internal Agent protocol before the composer or overlay consumes them.

#### Scenario: Adapter returns available explain result
- **GIVEN** an adapter receives a valid provider response for an explain request
- **WHEN** it returns to the background service
- **THEN** the result SHALL include a stable status, capability kind, provider mode, provider role, configured model name, target identity, explanation text, and version metadata.

#### Scenario: Adapter returns unavailable result
- **GIVEN** an adapter encounters a provider, parsing, schema, auth, rate limit, or unsupported-model failure
- **WHEN** it returns to the background service
- **THEN** the result SHALL include a stable status and normalized reason
- **AND** the system SHALL NOT infer provider state by parsing free-form provider text outside the adapter.
