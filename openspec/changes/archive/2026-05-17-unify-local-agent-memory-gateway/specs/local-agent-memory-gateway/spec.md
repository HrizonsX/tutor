## ADDED Requirements

### Requirement: Localhost Agent Gateway MVP
系统 SHALL support an MVP localhost Agent/Gateway for the `local` provider mode.

#### Scenario: Local gateway is configured
- **GIVEN** provider mode is `local`
- **WHEN** the background service worker initializes provider access
- **THEN** it SHALL target a configured `127.0.0.1` HTTP endpoint for Agent and memory capabilities
- **AND** it SHALL NOT require content scripts to know the endpoint.

#### Scenario: Local gateway exposes core endpoints
- **WHEN** the local gateway is healthy
- **THEN** it SHALL expose health, explain, rewrite, embedding, memory event write, and memory query capabilities either as separate endpoints or equivalent protocol actions.

#### Scenario: Local gateway is unavailable
- **GIVEN** provider mode is `local`
- **AND** the localhost gateway is not reachable
- **WHEN** the background service worker receives an Agent or memory request
- **THEN** it SHALL return a structured unavailable result
- **AND** proactive explanation UI SHALL remain silent.

### Requirement: Lightweight Local Pairing
系统 SHALL protect localhost gateway access with MVP-appropriate local pairing rather than unauthenticated open access.

#### Scenario: Pairing token exists
- **GIVEN** a local pairing token is configured
- **WHEN** background calls the localhost gateway
- **THEN** it SHALL include the token using the agreed header or request field
- **AND** diagnostics SHALL indicate that pairing is configured without exposing the token value.

#### Scenario: Pairing token is missing or rejected
- **GIVEN** provider mode is `local`
- **AND** no valid local pairing token is available
- **WHEN** a gateway request is attempted
- **THEN** the system SHALL return a structured unavailable result with a pairing-required or pairing-rejected reason.

#### Scenario: Gateway network binding
- **WHEN** the MVP local gateway starts
- **THEN** it SHALL bind to `127.0.0.1` by default
- **AND** it SHALL NOT expose the memory API on a LAN interface unless a future explicit feature enables it.

### Requirement: Local Memory Repository Source Of Truth
系统 SHALL allow the localhost service to own the MVP persistent learning memory repository for cross-browser use.

#### Scenario: Learning event is recorded
- **GIVEN** the user sees, dismisses, expands, regenerates, mutes, or rates an explanation
- **WHEN** the event is persisted
- **THEN** the browser extension SHALL write the structured event through the background-to-gateway memory API when local repository capability is available.

#### Scenario: Memory context is needed
- **GIVEN** local policy selects an explanation target
- **WHEN** the background service worker prepares an Agent request
- **THEN** it SHALL query the memory repository for relevant events, profile hints, prior versions, summaries, graph relationships, cooldowns, and optional similar vectors.

#### Scenario: Repository stores memory graph
- **WHEN** the local memory repository persists learned knowledge state
- **THEN** it SHALL store learning events, profile hints, explanation versions, agent summaries, graph edges, optional vectors, schema version, and migration metadata.

### Requirement: Cross-Browser Memory Sharing
系统 SHALL make learned memory available across supported browsers when those browser extensions connect to the same localhost gateway.

#### Scenario: Second browser connects
- **GIVEN** a user has learned concepts through one browser extension instance
- **WHEN** another browser extension instance connects to the same paired localhost gateway
- **THEN** memory queries from the second browser SHALL be able to retrieve the same repository-backed learning state.

#### Scenario: Browser storage is only fallback
- **GIVEN** local memory repository capability is available
- **WHEN** the extension records or retrieves learning memory
- **THEN** browser IndexedDB or local storage SHALL NOT be treated as the authoritative cross-browser source of truth.

#### Scenario: Local repository disabled
- **GIVEN** local provider mode is disabled or local memory capability is unavailable
- **WHEN** the extension needs learning memory
- **THEN** it MAY use browser-local repository fallback for continuity
- **AND** the fallback state SHALL be marked as browser-local rather than shared.

### Requirement: Memory Repository Preserves Privacy And Uncertainty
系统 SHALL store memory as learning state and user interaction history, not as authoritative world knowledge.

#### Scenario: Store memory event
- **WHEN** a memory event is written to the local repository
- **THEN** it SHALL contain minimal context metadata, target identity, event type, timestamps, version links, uncertainty, and evidence identifiers
- **AND** it SHALL avoid storing full page text unless a future explicit feature requires it.

#### Scenario: Agent proposes summary or relationship
- **GIVEN** the Agent proposes a summary, profile hint, or graph relationship
- **WHEN** the repository stores it
- **THEN** the stored record SHALL include evidence event ids, uncertainty, timestamp, and source metadata.
