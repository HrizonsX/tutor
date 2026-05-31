## ADDED Requirements

### Requirement: Background Delegates Local Memory Context Assembly
The background service worker SHALL delegate durable memory retrieval, summarization, and explain-context assembly to the local gateway when local runtime memory capability is available.

#### Scenario: Explain request through local runtime
- **GIVEN** the local gateway is available with memory and explain capability
- **WHEN** background forwards an explanation request from a content script
- **THEN** background SHALL send the selected target, minimal context, request goal, and browser-safe metadata to the gateway
- **AND** it SHALL NOT perform long-term memory summarization or assemble raw memory history for the provider request.

#### Scenario: Rewrite request through local runtime
- **GIVEN** the user requests a regenerated explanation
- **AND** the local gateway is available with memory and rewrite capability
- **WHEN** background forwards the rewrite request
- **THEN** background SHALL include previous version and feedback metadata
- **AND** it SHALL rely on the Local Agent Runtime to retrieve explanation preference summaries and inject memory context.

### Requirement: Background Forwards Memory Events Without Owning Summaries
The background service worker SHALL mediate memory event writes while leaving persistent storage and summary derivation to the active repository.

#### Scenario: Content records feedback event
- **GIVEN** a content script reports an explanation feedback event
- **WHEN** local runtime memory capability is available
- **THEN** background SHALL forward the structured event to the gateway memory API
- **AND** it SHALL NOT update browser-owned derived profile, concept state, or explanation preference summaries as authoritative memory.

#### Scenario: Local memory write fails
- **GIVEN** the gateway memory event write fails or is unavailable
- **WHEN** browser fallback is configured
- **THEN** background MAY write the event to browser-local fallback
- **AND** diagnostics SHALL mark memory repository status as browser-local or degraded.

### Requirement: Background Preserves Sanitized Boundary
The background service worker SHALL keep browser-to-runtime memory messages privacy-trimmed and shall not expose local raw memory to content scripts.

#### Scenario: Content requests diagnostics
- **WHEN** diagnostics are returned to browser UI
- **THEN** background SHALL expose redacted memory status such as repository mode, availability, degraded reason, and freshness
- **AND** it SHALL NOT expose raw stored events, full page text, provider tokens, pairing tokens, or unsanitized derived summaries.

#### Scenario: Memory query response used by browser fallback
- **GIVEN** browser fallback logic requests memory context
- **WHEN** background receives a memory query response from the gateway
- **THEN** it SHALL pass only sanitized packet fields needed for policy or display
- **AND** it SHALL NOT pass local store internals or raw private event payloads to content scripts.
