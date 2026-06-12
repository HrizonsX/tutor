## ADDED Requirements

### Requirement: Gateway Health Aggregates Runtime Component State
Gateway health and diagnostics SHALL aggregate redacted state from Local Agent Runtime, Memory Runtime, Provider Runtime, and runtime configuration without exposing runtime internals or secrets.

#### Scenario: Health includes runtime component state
- **WHEN** `/health` is requested
- **THEN** the response SHALL include gateway protocol status, capability flags, redacted provider role state, redacted runtime config metadata, and redacted memory repository state supplied through runtime boundaries.

#### Scenario: Health does not expose internals
- **WHEN** `/health` or diagnostics are requested
- **THEN** the response SHALL NOT expose provider tokens, pairing tokens, raw memory events, full page text, unsanitized memory summaries, or implementation-specific store handles.

#### Scenario: Subcomponent is degraded
- **GIVEN** Memory Runtime, Provider Runtime, or runtime configuration is degraded or unavailable
- **WHEN** health or diagnostics are requested
- **THEN** the response SHALL report a structured degraded or unavailable reason for the affected component while preserving the gateway protocol response shape.

### Requirement: Runtime Boundary Logging Remains Redacted
Gateway and Provider Runtime logging SHALL preserve existing redaction behavior after responsibilities are split across modules.

#### Scenario: Gateway logs inbound request
- **WHEN** the gateway receives an HTTP request
- **THEN** it SHALL log request start and finish metadata with redacted paths and without logging pairing tokens or request bodies containing private memory context.

#### Scenario: Provider Runtime logs adapter dispatch
- **GIVEN** Provider Runtime dispatches a provider adapter request
- **WHEN** the provider request starts, succeeds, or fails
- **THEN** it SHALL log provider role, capability kind, adapter, configured model name, status or normalized reason, and duration
- **AND** it SHALL NOT log provider token values, full request context, or unsanitized memory packets.

### Requirement: Boundary Tests Protect Observability Semantics
The runtime boundary split SHALL include verification that observability behavior remains stable after moving implementation code between modules.

#### Scenario: Health response remains compatible
- **WHEN** gateway health tests run after the boundary split
- **THEN** they SHALL verify existing capability, provider role, runtime config, and memory repository fields remain available with secret redaction.

#### Scenario: Logs remain redacted
- **WHEN** gateway and provider runtime logging tests run after the boundary split
- **THEN** they SHALL verify pairing tokens, provider tokens, and secret query parameters are not present in logged metadata.
