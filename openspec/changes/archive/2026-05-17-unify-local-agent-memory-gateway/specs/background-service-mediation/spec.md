## MODIFIED Requirements

### Requirement: Background Mediates External Agent Requests
The background service worker SHALL be the only extension component that calls external Agent, LLM, embedding, localhost gateway, or memory repository APIs for knowledge explanation, ambiguity judgment, rewrite generation, embedding, and memory-backed Agent context.

#### Scenario: Content script requests an explanation
- **GIVEN** a content script has selected text, minimal surrounding context, retrieval packet summary, user memory hints, and an explanation goal
- **WHEN** it needs an Agent explanation
- **THEN** it MUST send those inputs to the background service worker
- **AND** it MUST NOT call an external Agent, localhost Agent/Gateway, LLM, embedding API, or memory repository directly.

#### Scenario: Background constructs privacy-trimmed request
- **GIVEN** the background service worker receives an explanation request from a content script
- **WHEN** it prepares the outbound Agent request
- **THEN** it SHALL include only selected text, minimal surrounding context, sanitized user memory summary, request goal, provider protocol metadata, and policy metadata needed for the explanation
- **AND** it SHALL NOT include full page text or unsanitized local memory.

#### Scenario: Background routes through active provider
- **GIVEN** provider mode is `off`, `local`, `custom`, or `cloud`
- **WHEN** a content script sends the standard background message shape
- **THEN** the background service worker SHALL resolve the active provider and route the request without requiring content script changes.

### Requirement: Background Owns Provider Configuration
The background service worker SHALL own provider mode, provider configuration, API keys, local pairing token, host permissions, endpoint selection, and capability discovery for Agent, LLM, gateway, memory, and embedding services.

#### Scenario: Provider key is needed
- **GIVEN** an external Agent request requires an API key
- **WHEN** the request is sent
- **THEN** the background service worker SHALL read and apply the provider credential
- **AND** the content script SHALL NOT receive or persist the credential.

#### Scenario: Local pairing token is needed
- **GIVEN** provider mode is `local`
- **AND** the localhost gateway requires a pairing token
- **WHEN** the request is sent
- **THEN** the background service worker SHALL apply the pairing token
- **AND** the content script SHALL NOT receive or persist the token.

#### Scenario: Provider is not configured
- **GIVEN** no external Agent provider is configured or provider mode is `off`
- **WHEN** the background service worker receives a proactive explanation request
- **THEN** it SHALL return a structured unavailable result
- **AND** it SHALL NOT fabricate or request a local knowledge explanation.

#### Scenario: Provider health is checked
- **GIVEN** a provider mode is configured
- **WHEN** background refreshes provider status
- **THEN** it SHALL discover health and capability information through the provider health contract or equivalent.

### Requirement: Background Controls External Service Reliability
The background service worker SHALL enforce timeouts, cache policy, rate limits, structured error handling, capability checks, local gateway unavailable handling, and privacy policy for external service and localhost gateway calls.

#### Scenario: Agent request times out
- **GIVEN** an external Agent request exceeds the configured timeout
- **WHEN** the background service worker handles the failure
- **THEN** it SHALL return a structured unavailable result with a non-knowledge error reason
- **AND** it SHALL NOT retry indefinitely.

#### Scenario: Repeated equivalent request
- **GIVEN** a recent equivalent Agent explanation request has a cacheable successful response
- **WHEN** the background service worker receives the same request within the cache policy
- **THEN** it MAY return the cached structured explanation version
- **AND** it SHALL preserve the original explanation version metadata.

#### Scenario: Local gateway unavailable
- **GIVEN** provider mode is `local`
- **AND** the localhost gateway is unreachable, unpaired, unhealthy, or missing a requested capability
- **WHEN** background handles the request
- **THEN** it SHALL return a structured unavailable result with a normalized reason
- **AND** it SHALL update runtime diagnostics with the latest gateway status.

## ADDED Requirements

### Requirement: Background Mediates Memory Repository Requests
The background service worker SHALL mediate browser-side reads and writes to the active memory repository.

#### Scenario: Content script records learning event
- **GIVEN** the user dismisses, expands, rates, regenerates, or mutes an explanation
- **WHEN** the content script records the event
- **THEN** it SHALL send the event to background
- **AND** background SHALL write the event through the active memory repository adapter.

#### Scenario: Agent request needs memory
- **GIVEN** an Agent request needs prior learning context
- **WHEN** background prepares the request
- **THEN** it SHALL query the active memory repository adapter
- **AND** it SHALL pass only sanitized memory context to the provider.
