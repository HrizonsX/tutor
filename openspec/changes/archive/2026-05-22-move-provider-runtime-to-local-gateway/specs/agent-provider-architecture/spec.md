## MODIFIED Requirements

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
