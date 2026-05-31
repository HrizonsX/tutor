## MODIFIED Requirements

### Requirement: Background Mediates External Agent Requests
The background service worker SHALL mediate browser-side Agent requests by sending them only to the paired localhost gateway for knowledge explanation, ambiguity handling, rewrite generation, embedding, health, diagnostics, and memory-backed Agent context.

#### Scenario: Content script requests an explanation
- **GIVEN** a content script has selected text, minimal surrounding context, retrieval packet summary, user memory hints, and an explanation goal
- **WHEN** it needs an Agent explanation
- **THEN** it MUST send those inputs to the background service worker
- **AND** the background service worker MUST send the resulting internal Agent request to the local gateway
- **AND** neither content script nor background service worker MUST call an external Agent, LLM, embedding provider, or vendor API directly.

#### Scenario: Background constructs privacy-trimmed gateway request
- **GIVEN** the background service worker receives an explanation request from a content script
- **WHEN** it prepares the outbound gateway request
- **THEN** it SHALL include only selected text, minimal surrounding context, sanitized user memory summary, request goal, gateway protocol metadata, and policy metadata needed for the explanation
- **AND** it SHALL NOT include full page text, unsanitized local memory, provider endpoint, provider token, or model-provider dispatch metadata.

#### Scenario: Background routes through local gateway
- **GIVEN** the browser extension has local gateway endpoint and pairing configuration
- **WHEN** a content script sends the standard background message shape
- **THEN** the background service worker SHALL call the configured local gateway endpoint without requiring content script changes.

### Requirement: Background Owns Provider Configuration
The background service worker SHALL own only browser-side local gateway connection configuration, timeout selection, pairing token reading, gateway health checks, and gateway error normalization; model-provider configuration SHALL belong to the Local Agent Runtime.

#### Scenario: Gateway pairing token is needed
- **GIVEN** the localhost gateway requires a pairing token
- **WHEN** the background service worker sends a request to the gateway
- **THEN** it SHALL read and apply the local gateway pairing token
- **AND** the content script SHALL NOT receive or persist the token.

#### Scenario: Model provider token is needed
- **GIVEN** the Local Agent Runtime needs a provider token to call an external model provider
- **WHEN** the gateway handles an explain, rewrite, or embedding request
- **THEN** the gateway SHALL read and apply the provider token from runtime configuration or environment variables
- **AND** the background service worker SHALL NOT receive, read, persist, or apply the model-provider token.

#### Scenario: Provider is not configured in runtime
- **GIVEN** the Local Agent Runtime has no provider configured for the requested role and stub mode is disabled
- **WHEN** the background service worker sends a proactive explanation, rewrite, or embedding request to the gateway
- **THEN** the gateway response SHALL be a structured unavailable result
- **AND** the background service worker SHALL NOT fabricate a local knowledge explanation or dispatch directly to another provider.

### Requirement: Background Controls External Service Reliability
The background service worker SHALL enforce browser-side local gateway reliability behavior, while the gateway SHALL enforce provider request timeouts, provider parsing, provider error normalization, and provider retry policy.

#### Scenario: Gateway request times out
- **GIVEN** a local gateway request exceeds the configured browser-side gateway timeout
- **WHEN** the background service worker handles the failure
- **THEN** it SHALL return a structured unavailable result with a local gateway timeout reason
- **AND** it SHALL NOT retry indefinitely.

#### Scenario: Runtime provider request fails
- **GIVEN** the Local Agent Runtime receives a provider auth, rate-limit, timeout, model, JSON parse, schema, or network failure
- **WHEN** the gateway responds to the browser extension
- **THEN** the response SHALL contain a normalized structured reason
- **AND** the background service worker SHALL preserve that reason without parsing provider-specific response bodies.

### Requirement: Background Mediates Embedding Requests
The background service worker SHALL mediate all optional embedding requests by sending sanitized embedding payloads to the local gateway.

#### Scenario: Runtime embedding provider configured
- **GIVEN** the Local Agent Runtime has an embedding provider configured
- **WHEN** local memory asks for an embedding of a sanitized summary through the browser background
- **THEN** the background service worker SHALL call the gateway embedding endpoint
- **AND** the gateway SHALL call the configured embedding provider or local embedding implementation.

#### Scenario: Runtime embedding unavailable
- **GIVEN** the gateway returns embedding unavailable
- **WHEN** memory retrieval needs similar context
- **THEN** the system SHALL fall back to exact object, alias, recency, feedback, cooldown, and explanation-history retrieval
- **AND** it SHALL NOT invent semantic similarity scores.

## REMOVED Requirements

### Requirement: Background Mediates Adapter Dispatch
**Reason**: Provider adapter dispatch is no longer a browser background responsibility. It belongs to the Local Agent Runtime behind the local gateway.

**Migration**: Background SHALL send internal Agent requests to `/explain`, `/rewrite`, or `/embedding`; the gateway/runtime SHALL select and execute the configured adapter.
