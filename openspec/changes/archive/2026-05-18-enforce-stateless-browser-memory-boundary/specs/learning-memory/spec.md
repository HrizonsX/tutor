## ADDED Requirements

### Requirement: Browser Extension Must Not Cache Memory Data
The browser extension SHALL NOT persist or cache user learning memory, user profile, explanation history, feedback history, concept familiarity, explanation preferences, derived memory summaries, or memory vectors in IndexedDB, localStorage, sessionStorage, chrome storage, or page-lifetime memory objects.

#### Scenario: Page refresh clears browser memory state
- **GIVEN** a browser page has shown explanations and reported feedback events
- **WHEN** the page is refreshed
- **THEN** the browser extension SHALL NOT restore learning memory, profile hints, explanation history, concept familiarity, or feedback history from browser-local state.

#### Scenario: Browser restart clears browser memory state
- **GIVEN** a browser instance has used the extension
- **WHEN** the browser is closed and reopened
- **THEN** the extension SHALL NOT retain memory-related data unless it is retrieved from Gateway / Local Agent Runtime.

#### Scenario: Ephemeral UI state is not memory
- **WHEN** the browser extension keeps overlay visibility, current selection, pending request state, abort controllers, loading state, error state, or the currently displayed result
- **THEN** that state SHALL be limited to the current page interaction
- **AND** it SHALL NOT be used as learning memory after refresh, navigation, or browser restart.

## MODIFIED Requirements

### Requirement: Retrieve Similar Memories With Optional Embeddings
The Gateway / Local Agent Runtime MAY use embedding services to improve similar-memory retrieval, and SHALL keep embeddings optional.

#### Scenario: Embedding service available
- **GIVEN** an embedding provider is configured in the Gateway / Local Agent Runtime
- **WHEN** a sanitized memory summary is stored
- **THEN** the runtime MAY request an embedding through the runtime provider boundary
- **AND** it SHALL store vector and summary metadata in the Local Memory Store or another runtime-owned memory repository.

#### Scenario: Embedding service unavailable
- **GIVEN** no embedding provider is configured or embedding generation fails
- **WHEN** the runtime retrieves memory for an Agent request
- **THEN** it SHALL fall back to exact object, alias, recency, feedback, cooldown, and explanation-history retrieval from runtime-owned memory
- **AND** it SHALL NOT invent semantic similarity results.

#### Scenario: Browser vector storage forbidden
- **WHEN** similar-memory retrieval is enabled
- **THEN** the browser extension SHALL NOT store vectors, sanitized summaries, or similarity indexes in IndexedDB, localStorage, sessionStorage, chrome storage, or page-lifetime memory objects.

### Requirement: Construct Retrieval Packet For External Agent
The Gateway / Local Agent Runtime SHALL construct retrieval packets for Agent requests from runtime-owned local learning state while preserving privacy and uncertainty.

#### Scenario: Agent request needs memory context
- **GIVEN** an explanation target has learning history in the Local Memory Store or runtime-owned memory repository
- **WHEN** the Gateway / Local Agent Runtime prepares an Agent request
- **THEN** the retrieval packet SHALL include sanitized prior explanation metadata, feedback summaries, profile hints, mute settings, related objects, cooldowns, and uncertainty.

#### Scenario: Memory context contains page metadata
- **GIVEN** stored learning events include page context
- **WHEN** the retrieval packet is prepared
- **THEN** the packet SHALL use minimal metadata such as fragment identifiers, origins, hashes, and timestamps
- **AND** it SHALL NOT include stored full page text.

#### Scenario: Browser request omits memory packet
- **WHEN** the browser extension sends an explain or rewrite request to Gateway / Local Agent Runtime
- **THEN** the request SHALL NOT include browser-computed retrieval packets, profile hints, prior explanation history, concept familiarity, or feedback history
- **AND** personalization SHALL come from runtime memory injection.

### Requirement: Maintain Repository-Backed Learning Memory
The system SHALL maintain user learning memory through a Gateway / Local Agent Runtime repository boundary backed by the Local Memory Store or another runtime-owned memory repository.

#### Scenario: Repository is available
- **GIVEN** a runtime memory repository is available
- **WHEN** learning events, profile feedback, explanation versions, agent summaries, graph relationships, optional vectors, or migrations are recorded
- **THEN** Gateway / Local Agent Runtime SHALL call the runtime repository interface
- **AND** browser extension orchestration SHALL NOT directly depend on IndexedDB, chrome.storage, localStorage, sessionStorage, or browser memory objects for memory.

#### Scenario: Gateway repository is active
- **GIVEN** Gateway / Local Agent Runtime reports memory repository capability
- **WHEN** memory is read or written
- **THEN** the runtime repository SHALL be treated as the persistent source of truth.

#### Scenario: Runtime memory capability unavailable
- **GIVEN** Gateway / Local Agent Runtime memory repository capability is unavailable
- **WHEN** the browser extension needs learning memory for explanation, rewrite, feedback, or profile policy
- **THEN** the system SHALL return a structured unavailable or degraded-memory state
- **AND** the browser extension SHALL NOT use browser-local repository fallback.

#### Scenario: Browser storage is not a repository implementation
- **WHEN** the extension runtime is built or initialized
- **THEN** browser IndexedDB, localStorage, sessionStorage, chrome storage, and page-lifetime memory objects SHALL NOT be configured as learning-memory repository implementations.

### Requirement: Encapsulate Memory Migration Logic
The system SHALL encapsulate memory migrations inside Gateway / Local Agent Runtime repository or storage layers.

#### Scenario: Schema version changes
- **GIVEN** runtime-owned memory data has an older schema version
- **WHEN** the runtime repository opens the data
- **THEN** migration logic SHALL run inside the runtime repository or storage layer
- **AND** business orchestration SHALL receive normalized records.

#### Scenario: Legacy browser memory is not imported at runtime startup
- **GIVEN** browser IndexedDB or browser-local storage contains existing learning events or explanation versions from an older extension
- **WHEN** the browser extension starts, refreshes, sends explain or rewrite requests, or records feedback
- **THEN** it SHALL NOT read, migrate, or replay that browser-local memory as part of normal runtime behavior.

#### Scenario: Explicit legacy import is separate
- **GIVEN** a future feature imports legacy browser memory into Gateway / Local Agent Runtime
- **WHEN** that import is executed
- **THEN** it SHALL be an explicit migration flow outside normal extension memory fallback
- **AND** imported records SHALL become runtime-owned memory after import.

### Requirement: Query Memory Repository For Agent Context
Gateway / Local Agent Runtime SHALL query the active runtime memory repository before Agent explanation or rewrite provider dispatch that needs learning context.

#### Scenario: Explanation target has history
- **GIVEN** a selected target has prior learning events, profile hints, summaries, versions, graph edges, or vectors in runtime-owned memory
- **WHEN** Gateway / Local Agent Runtime prepares an Agent request
- **THEN** the runtime repository SHALL return a sanitized memory packet with evidence ids, uncertainty, cooldowns, related objects, and version metadata.

#### Scenario: Memory query fails
- **GIVEN** the active runtime memory repository cannot satisfy a query
- **WHEN** Gateway / Local Agent Runtime prepares an Agent request
- **THEN** the system SHALL use a structured unavailable or degraded-memory state
- **AND** it SHALL NOT invent memory relationships or semantic similarity scores.

#### Scenario: Browser does not query memory for provider context
- **WHEN** the browser extension prepares an explain or rewrite request
- **THEN** it SHALL NOT query or assemble learning memory, profile hints, prior explanations, derived summaries, or concept familiarity for provider context.

### Requirement: Use Persistent Local Memory As Authoritative Repository
The system SHALL treat persistent Local Memory Store state as the authoritative learning memory when local runtime memory capability is available.

#### Scenario: Local store is available
- **GIVEN** the local gateway reports persistent memory capability
- **WHEN** learning events, explanation versions, profile events, summaries, graph edges, vectors, or migrations are read or written
- **THEN** the system SHALL use the Local Memory Store through the runtime repository boundary
- **AND** browser IndexedDB SHALL NOT be treated as the authoritative source of truth.

#### Scenario: Browser fallback is forbidden
- **GIVEN** local memory capability is unavailable
- **WHEN** the browser extension records or queries learning memory
- **THEN** it SHALL receive or return a structured unavailable or degraded-memory state
- **AND** it SHALL NOT persist or query browser-local fallback memory.
