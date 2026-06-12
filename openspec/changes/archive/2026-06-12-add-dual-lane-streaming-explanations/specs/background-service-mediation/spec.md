## ADDED Requirements

### Requirement: Background Mediates Streaming Explanation Sessions
The background service worker SHALL mediate streaming explanation sessions between content scripts and the paired localhost gateway.

#### Scenario: Content opens stream session
- **GIVEN** a content script requests a streamed explanation
- **WHEN** background accepts the request
- **THEN** background SHALL open or use a long-lived browser messaging channel for stream events
- **AND** it SHALL call only the paired localhost gateway for the streaming session.

#### Scenario: Background forwards gateway events
- **WHEN** background receives a valid stream event from the gateway
- **THEN** it SHALL forward the event to the originating content context with session id, sequence, event kind, and lane metadata preserved
- **AND** it SHALL NOT parse provider-specific response bodies in content code.

### Requirement: Background Preserves Secret And Memory Boundaries During Streaming
The background service worker SHALL preserve existing local gateway pairing, provider secret, and memory ownership boundaries for streaming sessions.

#### Scenario: Pairing token is applied
- **GIVEN** a gateway pairing token is configured
- **WHEN** background starts a streaming gateway request
- **THEN** it SHALL apply the pairing token through the agreed local gateway credential mechanism
- **AND** it SHALL NOT send the pairing token to the content script.

#### Scenario: Provider token is not exposed
- **WHEN** background mediates a streaming explanation session
- **THEN** it SHALL NOT receive, read, persist, log, or forward provider tokens, provider endpoints, or provider request bodies to content.

#### Scenario: Browser memory is not used
- **WHEN** streaming association recall is needed
- **THEN** background SHALL rely on Gateway / Local Agent Runtime for memory recall
- **AND** it SHALL NOT assemble, cache, or synthesize browser-local memory context.

### Requirement: Background Handles Streaming Reliability
The background service worker SHALL normalize stream-level gateway failures and cancellation without fabricating explanation text.

#### Scenario: Gateway stream fails before final
- **GIVEN** a streaming gateway request fails before a lane final event is received
- **WHEN** background handles the failure
- **THEN** it SHALL forward a structured lane or session unavailable event with a normalized local gateway reason
- **AND** it SHALL NOT generate local fallback explanation text.

#### Scenario: Content cancels stream
- **GIVEN** a stream session is active
- **WHEN** content cancels the session due to dismissal, feature disable, navigation, or a newer request
- **THEN** background SHALL abort the local gateway stream when possible
- **AND** it SHALL stop forwarding later events for the canceled session.

#### Scenario: Streaming is unsupported
- **GIVEN** gateway capability discovery does not report streaming support
- **WHEN** content requests an explanation
- **THEN** background SHALL use the existing non-stream explanation path
- **AND** it SHALL preserve existing local gateway timeout and unavailable behavior.
