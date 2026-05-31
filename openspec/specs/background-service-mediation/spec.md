# background-service-mediation Specification

## Purpose
TBD - created by archiving change external-agent-knowledge-explanation. Update Purpose after archive.
## Requirements
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

### Requirement: Background Mediates Memory Repository Requests
The background service worker SHALL mediate browser-side memory event writes and memory queries by forwarding them to Gateway / Local Agent Runtime only.

#### Scenario: Content script records learning event
- **GIVEN** the user dismisses, expands, rates, regenerates, or mutes an explanation
- **WHEN** the content script records the event
- **THEN** it SHALL send the event to background
- **AND** background SHALL forward the event through the gateway memory API.

#### Scenario: Agent request needs memory
- **GIVEN** an Agent request needs prior learning context
- **WHEN** background prepares the request
- **THEN** it SHALL forward the immediate request context to Gateway / Local Agent Runtime
- **AND** it SHALL rely on the runtime to query memory and inject sanitized memory context.

#### Scenario: Browser repository adapter is unavailable by design
- **WHEN** Gateway / Local Agent Runtime memory capability is unavailable
- **THEN** background SHALL return a structured unavailable or degraded-memory result
- **AND** it SHALL NOT use a browser-local memory repository adapter.

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

### Requirement: Background Delegates Local Memory Context Assembly
The background service worker SHALL delegate durable memory retrieval, summarization, profile derivation, concept familiarity, and explain-context assembly to Gateway / Local Agent Runtime.

#### Scenario: Explain request through local runtime
- **GIVEN** the local gateway is available with memory and explain capability
- **WHEN** background forwards an explanation request from a content script
- **THEN** background SHALL send the selected target, minimal context, request goal, and browser-safe metadata to the gateway
- **AND** it SHALL NOT perform long-term memory summarization, profile derivation, concept familiarity judgment, or raw memory history assembly for the provider request.

#### Scenario: Rewrite request through local runtime
- **GIVEN** the user requests a regenerated explanation
- **AND** the local gateway is available with memory and rewrite capability
- **WHEN** background forwards the rewrite request
- **THEN** background SHALL include current previous-version and feedback metadata
- **AND** it SHALL rely on Gateway / Local Agent Runtime to retrieve explanation preference summaries and inject memory context.

### Requirement: Background Forwards Memory Events Without Owning Summaries
The background service worker SHALL mediate memory event writes while leaving persistent storage and summary derivation to Gateway / Local Agent Runtime.

#### Scenario: Content records feedback event
- **GIVEN** a content script reports an explanation feedback event
- **WHEN** local runtime memory capability is available
- **THEN** background SHALL forward the structured event to the gateway memory API
- **AND** it SHALL NOT update browser-owned derived profile, concept state, explanation preference summaries, or other authoritative memory.

#### Scenario: Local memory write fails
- **GIVEN** the gateway memory event write fails or is unavailable
- **WHEN** background handles the failure
- **THEN** it SHALL return a structured unavailable or degraded-memory result
- **AND** it SHALL NOT write the event to browser-local fallback storage.

### Requirement: Background Preserves Sanitized Boundary
The background service worker SHALL keep browser-to-runtime memory messages privacy-trimmed and SHALL NOT expose local raw memory to content scripts.

#### Scenario: Content requests diagnostics
- **WHEN** diagnostics are returned to browser UI
- **THEN** background SHALL expose redacted memory status such as repository mode, availability, degraded reason, and freshness
- **AND** it SHALL NOT expose raw stored events, full page text, provider tokens, pairing tokens, unsanitized derived summaries, or browser-local memory payloads.

#### Scenario: Memory query response stays runtime-owned
- **GIVEN** background receives a memory query response from the gateway
- **WHEN** the response is used for diagnostics, policy, or display
- **THEN** background SHALL pass only sanitized status and packet fields needed for the current operation
- **AND** it SHALL NOT persist that response as browser memory or pass runtime store internals to content scripts.

### Requirement: Background Must Not Use Browser Memory Cache
The background service worker SHALL NOT persist, cache, derive, or query user memory data in browser-local storage or page-lifetime memory objects.

#### Scenario: Memory write fails
- **GIVEN** Gateway / Local Agent Runtime rejects or cannot receive a memory event
- **WHEN** background handles the event
- **THEN** it SHALL return a structured unavailable or degraded-memory result
- **AND** it SHALL NOT write the event to IndexedDB, localStorage, sessionStorage, chrome storage, or an in-memory memory cache.

#### Scenario: Memory query fails
- **GIVEN** Gateway / Local Agent Runtime cannot satisfy a memory query
- **WHEN** background handles the query result
- **THEN** it SHALL return a structured unavailable or degraded-memory result
- **AND** it SHALL NOT synthesize memory context from browser-local state.
