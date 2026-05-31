## ADDED Requirements

### Requirement: Maintain IndexedDB Learning Memory
The system SHALL maintain local user learning memory in IndexedDB, including encountered objects, feedback events, explanation versions, preferences, mute settings, summaries, and optional embedding vectors.

#### Scenario: Store explanation event locally
- **GIVEN** an Agent-returned explanation is displayed
- **WHEN** the event and explanation version are persisted
- **THEN** the system SHALL store the explanation version, target object, feedback-linkable metadata, and minimal context metadata in IndexedDB.

#### Scenario: Store mute preference locally
- **GIVEN** the user mutes an object or category
- **WHEN** the preference is recorded
- **THEN** the system SHALL persist the mute setting locally in a form future policy can retrieve.

### Requirement: Use Memory As Learning State Only
The system SHALL use local memory to describe the user's learning state and history, but SHALL NOT use local memory as an authoritative source of world knowledge.

#### Scenario: Build retrieval packet
- **GIVEN** local memory contains prior explanations, feedback, summaries, and related events for a target
- **WHEN** a retrieval packet is built
- **THEN** it SHALL describe prior user interactions, uncertainty, preferences, and cooldowns
- **AND** it SHALL NOT assert a fresh definition of the target as world knowledge.

#### Scenario: Prior explanation exists
- **GIVEN** the user previously saw an explanation for the same target
- **WHEN** the retrieval packet includes the prior version
- **THEN** the prior text SHALL be labeled as explanation history
- **AND** the system SHALL NOT treat it as a verified current definition.

### Requirement: Retrieve Similar Memories With Optional Embeddings
The system MAY use external embedding services to improve similar-memory retrieval, and SHALL keep embeddings optional.

#### Scenario: Embedding service available
- **GIVEN** an embedding provider is configured
- **WHEN** a sanitized memory summary is stored
- **THEN** the system MAY request an embedding through the background service worker
- **AND** it SHALL store the vector and summary metadata locally in IndexedDB.

#### Scenario: Embedding service unavailable
- **GIVEN** no embedding provider is configured or embedding generation fails
- **WHEN** the system retrieves memory for an Agent request
- **THEN** it SHALL fall back to exact object, alias, recency, feedback, cooldown, and explanation-history retrieval
- **AND** it SHALL NOT invent semantic similarity results.

### Requirement: Construct Retrieval Packet For External Agent
The system SHALL construct retrieval packets for external Agent requests from local learning state while preserving privacy and uncertainty.

#### Scenario: Agent request needs memory context
- **GIVEN** an explanation target has local learning history
- **WHEN** the background service worker prepares an Agent request
- **THEN** the retrieval packet SHALL include sanitized prior explanation metadata, feedback summaries, profile hints, mute settings, related objects, cooldowns, and uncertainty.

#### Scenario: Memory context contains page metadata
- **GIVEN** stored learning events include page context
- **WHEN** the retrieval packet is prepared
- **THEN** the packet SHALL use minimal metadata such as fragment identifiers, origins, hashes, and timestamps
- **AND** it SHALL NOT include stored full page text.
