## ADDED Requirements

### Requirement: Provider Calls Are Runtime Decision Gated
The Local Agent Runtime SHALL invoke explain, rewrite, and embedding providers only after runtime policy decides a provider call is required.

#### Scenario: Decision returns existing explanation
- **GIVEN** runtime decision policy selects a suitable existing explanation version
- **WHEN** an explain response is returned
- **THEN** no external provider request SHALL be made
- **AND** the response SHALL identify that the provider call was skipped by decision policy.

#### Scenario: Decision requires provider
- **GIVEN** runtime filters pass, memory retrieval completes, and decision policy chooses `call_provider`
- **WHEN** the Runtime prepares provider dispatch
- **THEN** it SHALL use runtime-owned provider configuration and adapter selection
- **AND** browser extension code SHALL remain unaware of provider endpoint, token, model, adapter, and structured-output mode.

#### Scenario: Provider unavailable after policy
- **GIVEN** decision policy chooses `call_provider`
- **AND** the runtime provider role is disabled, unconfigured, unhealthy, or unsupported
- **WHEN** the Runtime handles the request
- **THEN** it SHALL return a structured unavailable result with a normalized provider reason
- **AND** it SHALL NOT fall back to browser-local definitions or browser provider dispatch.
