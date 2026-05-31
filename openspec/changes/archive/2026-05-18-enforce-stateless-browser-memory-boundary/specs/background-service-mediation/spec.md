## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Background Mediates External Agent Requests
The background service worker SHALL be the only extension component that calls Gateway / Local Agent Runtime APIs for knowledge explanation, ambiguity judgment, rewrite generation, embedding, health, diagnostics, and memory-backed Agent context.

#### Scenario: Content script requests an explanation
- **GIVEN** a content script has selected text, minimal surrounding context, target identity, page metadata, language, current DOM context, and an explanation goal
- **WHEN** it needs an Agent explanation
- **THEN** it MUST send those immediate inputs to the background service worker
- **AND** it MUST NOT call an external Agent, localhost Agent/Gateway, LLM, embedding API, or memory repository directly.

#### Scenario: Background constructs privacy-trimmed request
- **GIVEN** the background service worker receives an explanation request from a content script
- **WHEN** it prepares the outbound Gateway / Local Agent Runtime request
- **THEN** it SHALL include only selected text, minimal surrounding context, target identity, request goal, current operation metadata, and policy metadata needed for the request
- **AND** it SHALL NOT include full page text, unsanitized memory, browser-computed memory packets, profile hints, prior explanation history, concept familiarity, or feedback history.

#### Scenario: Background routes through gateway
- **WHEN** a content script sends the standard background message shape for explain, rewrite, embedding, health, diagnostics, or memory events
- **THEN** the background service worker SHALL route the request through Gateway / Local Agent Runtime without requiring content script changes.

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
