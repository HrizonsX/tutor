# agent-provider-architecture Specification

## Purpose
TBD - created by archiving change unify-local-agent-memory-gateway. Update Purpose after archive.
## Requirements
### Requirement: Unified Provider Modes
The system SHALL support provider role modes behind the Local Agent Runtime, while the browser extension SHALL treat the paired localhost gateway as its only Agent, rewrite, embedding, memory, health, and capability provider boundary.

#### Scenario: Browser extension requests a provider-backed capability
- **GIVEN** the browser extension needs explanation, rewrite, embedding, health, or memory-backed Agent context
- **WHEN** the background service worker dispatches the request
- **THEN** it SHALL call the configured local gateway endpoint
- **AND** it SHALL NOT call a DeepSeek, OpenAI, OpenAI-compatible, custom, cloud, or embedding provider endpoint directly.

#### Scenario: Runtime provider role is off
- **GIVEN** the Local Agent Runtime has the requested provider role disabled or configured as `off`
- **WHEN** the gateway receives an explain, rewrite, or embedding request
- **THEN** the gateway SHALL return a structured unavailable result with an explicit off-mode or disabled reason
- **AND** the browser extension SHALL NOT silently fall back to a direct provider call.

#### Scenario: Runtime provider role uses an external adapter
- **GIVEN** the Local Agent Runtime has a provider role configured with an external provider mode and adapter
- **WHEN** the gateway handles a provider-backed request
- **THEN** the gateway SHALL route through the configured runtime adapter
- **AND** the browser extension SHALL remain unaware of provider endpoint, token, model name, adapter, and model-specific capability details.

### Requirement: Stable Agent Protocol
The system SHALL define a stable Agent request and response contract for health, explain, rewrite, embedding, and memory-aware explanation capabilities, with a clear distinction between stateless browser-to-runtime requests and runtime-internal memory-injected provider requests.

#### Scenario: Browser Agent request is sent
- **GIVEN** local policy selected a target or a user requested regeneration
- **WHEN** the browser extension sends an Agent request to Gateway / Local Agent Runtime
- **THEN** the request SHALL include request id, capability kind, target identity, immediate context, current operation data, constraints, schema version, and browser-safe metadata
- **AND** it SHALL NOT include browser-derived memory packets, profile hints, prior explanations, derived summaries, or concept familiarity.

#### Scenario: Runtime provider request is prepared
- **GIVEN** Gateway / Local Agent Runtime has received a browser Agent request
- **WHEN** it prepares an internal provider request for explain or rewrite
- **THEN** the runtime MAY include sanitized runtime-owned memory packets, profile hints, prior explanation metadata, explanation preferences, provider mode, and configured model name when present.

#### Scenario: Agent returns structured status
- **WHEN** an Agent response is received
- **THEN** the response SHALL include a structured status such as `available`, `unavailable`, `ambiguous`, or `invalid`
- **AND** the system SHALL NOT infer provider state by parsing free-form text.

#### Scenario: Agent response is invalid
- **GIVEN** an Agent response is missing required fields for the requested capability
- **WHEN** Gateway / Local Agent Runtime or background validates the response
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
The system SHALL allow switching explain and embedding provider roles inside the Local Agent Runtime without modifying content script or background provider dispatch behavior.

#### Scenario: Runtime provider changes
- **GIVEN** the Local Agent Runtime provider configuration changes from a stub to an OpenAI-compatible external provider, fully local model, or private Agent
- **WHEN** a content script requests explanation, regeneration, or embedding through the standard background message shape
- **THEN** the content script SHALL send the same message shape
- **AND** the background service worker SHALL call the same local gateway endpoint family.

#### Scenario: Content script lacks provider details
- **WHEN** content script code runs on a page
- **THEN** it SHALL NOT need provider endpoint, token, API key, pairing token, host permission, model name, adapter name, structured-output mode, or provider-specific capability details.

### Requirement: Adapter Routing For External Provider Modes
The Local Agent Runtime SHALL route external provider modes through the configured Provider Adapter while the browser extension preserves gateway-only routing.

#### Scenario: Runtime custom provider routes through adapter
- **GIVEN** the runtime explain or embedding role has an external provider configured with an adapter
- **WHEN** the gateway sends an explain, rewrite, embedding, or health request for that role
- **THEN** it SHALL dispatch the request through the configured adapter
- **AND** the adapter SHALL receive runtime-owned endpoint, token, timeout, model name, and adapter settings.

#### Scenario: Browser does not execute adapter
- **GIVEN** the runtime provider role is backed by `openai-compatible` or another adapter
- **WHEN** the browser background worker handles a standard Agent request
- **THEN** it SHALL send the internal Agent request to the local gateway
- **AND** it SHALL NOT instantiate or call the provider adapter.

### Requirement: Adapter Results Preserve Stable Agent Protocol
The gateway-executed Provider Adapter layer SHALL return results that conform to the stable internal Agent protocol before the browser overlay consumes them.

#### Scenario: Adapter returns available explain result
- **GIVEN** the gateway adapter receives a valid provider response for an explain request
- **WHEN** it returns to the browser extension through `/explain`
- **THEN** the result SHALL include a stable status, capability kind, provider role, provider mode, configured model name, target identity, explanation text, and version metadata.

#### Scenario: Adapter returns unavailable result
- **GIVEN** the gateway adapter encounters a provider, parsing, schema, auth, rate limit, timeout, or unsupported-model failure
- **WHEN** it returns to the browser extension through the gateway response
- **THEN** the result SHALL include a stable status and normalized reason
- **AND** the browser extension SHALL NOT infer provider state by parsing free-form provider text.

### Requirement: Browser-To-Runtime Requests Are Stateless
Browser-originated Agent requests SHALL be stateless with respect to user memory and SHALL carry only immediate request context.

#### Scenario: Browser sends explain request
- **GIVEN** the user selects text or the overlay selects a target from the current page
- **WHEN** the browser extension sends an explain request
- **THEN** the request SHALL include only current target identity, selected text, current fragment, URL/title metadata, language when available, current DOM context needed for the request, request goal, and browser-safe constraints
- **AND** it SHALL NOT include browser-cached profile, memory packet, concept familiarity, prior explanation history, feedback history, or preference summaries.

#### Scenario: Browser sends rewrite request
- **GIVEN** the user requests a regenerated explanation
- **WHEN** the browser extension sends a rewrite request
- **THEN** the request MAY include the current previous explanation version and current feedback event
- **AND** it SHALL NOT include historical feedback or profile summaries from browser-local memory.

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
