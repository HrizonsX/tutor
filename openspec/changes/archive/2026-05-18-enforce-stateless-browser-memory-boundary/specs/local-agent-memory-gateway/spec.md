## ADDED Requirements

### Requirement: Gateway Unavailability Must Not Trigger Browser Memory Fallback
When Gateway / Local Agent Runtime is unavailable, unhealthy, unpaired, or missing memory capability, the browser extension SHALL NOT fall back to browser-local memory cache.

#### Scenario: Gateway unreachable during explain
- **GIVEN** the browser extension sends an explain request
- **AND** Gateway / Local Agent Runtime is unreachable
- **WHEN** background handles the failure
- **THEN** it SHALL return a structured unavailable result
- **AND** it SHALL NOT use browser-local learning memory, profile hints, prior explanations, or feedback history to generate an explanation.

#### Scenario: Memory capability missing
- **GIVEN** Gateway / Local Agent Runtime is reachable but does not report memory query or memory event write capability
- **WHEN** the browser extension needs memory-enhanced explanation or feedback recording
- **THEN** the extension SHALL report a structured degraded or unavailable memory state
- **AND** it SHALL NOT store memory events in browser-local fallback storage.

## MODIFIED Requirements

### Requirement: Local Memory Repository Source Of Truth
Gateway / Local Agent Runtime SHALL own the persistent learning memory repository for all browser extension memory reads, writes, and derived memory views.

#### Scenario: Learning event is recorded
- **GIVEN** the user sees, dismisses, expands, regenerates, mutes, or rates an explanation
- **WHEN** the event is persisted
- **THEN** the browser extension SHALL write the structured event through the background-to-gateway memory API
- **AND** Gateway / Local Agent Runtime SHALL be the memory source of truth for that event.

#### Scenario: Memory context is needed
- **GIVEN** local policy or a user action selects an explanation target
- **WHEN** Gateway / Local Agent Runtime prepares an Agent request
- **THEN** it SHALL query the runtime memory repository for relevant events, profile hints, prior versions, summaries, graph relationships, cooldowns, and optional similar vectors.

#### Scenario: Repository stores memory graph
- **WHEN** the runtime memory repository persists learned knowledge state
- **THEN** it SHALL store learning events, profile hints, explanation versions, agent summaries, graph edges, optional vectors, schema version, and migration metadata.

#### Scenario: Browser does not own memory graph
- **WHEN** the browser extension handles explanation, rewrite, feedback, mute, or regeneration flows
- **THEN** it SHALL NOT persist or cache the memory graph, profile hints, explanation history, derived concept state, or memory vectors.

### Requirement: Cross-Browser Memory Sharing
Gateway / Local Agent Runtime SHALL make learned memory available across supported browsers when those browser extensions connect to the same paired localhost gateway.

#### Scenario: Second browser connects
- **GIVEN** a user has learned concepts through one browser extension instance
- **WHEN** another browser extension instance connects to the same paired localhost gateway
- **THEN** memory queries from the second browser SHALL be able to retrieve the same runtime repository-backed learning state.

#### Scenario: Browser storage is not fallback
- **GIVEN** local memory repository capability is unavailable
- **WHEN** the extension records or retrieves learning memory
- **THEN** browser IndexedDB, localStorage, sessionStorage, chrome storage, and page-lifetime memory objects SHALL NOT be used as fallback memory stores.

#### Scenario: Local repository disabled
- **GIVEN** local provider mode is disabled or local memory capability is unavailable
- **WHEN** the extension needs learning memory
- **THEN** it SHALL return a structured unavailable or degraded-memory state
- **AND** it SHALL NOT preserve reading continuity by using browser-local memory.

### Requirement: Gateway Injects Memory Context For Explain And Rewrite
Gateway / Local Agent Runtime SHALL inject summarized runtime memory context into explain and rewrite requests before provider adapter dispatch.

#### Scenario: Explain request has local memory
- **GIVEN** an `/explain` request names a target with runtime learning history
- **WHEN** the gateway prepares the provider request
- **THEN** it SHALL query the Local Memory Store or runtime memory repository
- **AND** it SHALL inject sanitized summarized memory context into the internal Agent request before dispatching to the provider adapter.

#### Scenario: Rewrite request has feedback history
- **GIVEN** a `/rewrite` request includes a previous explanation and the current feedback event
- **WHEN** the gateway prepares the provider request
- **THEN** it SHALL include relevant explanation preference summaries, prior version metadata, and feedback evidence ids from runtime memory when available.

#### Scenario: Browser packet is ignored
- **GIVEN** the browser request includes a memory packet, profile hints, prior explanations, derived summaries, or concept familiarity
- **WHEN** the gateway prepares an explain or rewrite request
- **THEN** Gateway / Local Agent Runtime SHALL ignore browser-provided memory fields
- **AND** runtime-owned memory context SHALL be the only memory source used for personalization.
