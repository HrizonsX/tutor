## ADDED Requirements

### Requirement: Maintain Repository-Backed Learning Memory
The system SHALL maintain user learning memory through a repository boundary that can be backed by localhost memory service, browser IndexedDB fallback, or future storage implementations.

#### Scenario: Repository is available
- **GIVEN** a memory repository adapter is available
- **WHEN** the system records learning events, profile feedback, explanation versions, agent summaries, graph relationships, optional vectors, or migrations
- **THEN** business orchestration SHALL call the repository interface
- **AND** it SHALL NOT directly depend on IndexedDB, chrome.storage, or localStorage APIs.

#### Scenario: Localhost repository is active
- **GIVEN** provider mode is `local`
- **AND** the localhost gateway reports memory repository capability
- **WHEN** memory is read or written
- **THEN** the localhost repository SHALL be treated as the MVP persistent source of truth.

#### Scenario: Browser fallback is active
- **GIVEN** localhost memory repository capability is unavailable
- **WHEN** the system must preserve reading continuity
- **THEN** it MAY use browser-local repository fallback
- **AND** fallback records SHALL be marked as browser-local and not cross-browser shared.

### Requirement: Encapsulate Memory Migration Logic
The system SHALL encapsulate memory migrations inside the repository or storage layer.

#### Scenario: Schema version changes
- **GIVEN** stored memory data has an older schema version
- **WHEN** the repository opens the data
- **THEN** migration logic SHALL run inside the repository or storage layer
- **AND** business orchestration SHALL receive normalized records.

#### Scenario: Browser memory migrates to local repository
- **GIVEN** browser IndexedDB contains existing learning events or explanation versions
- **WHEN** the user enables the local memory repository
- **THEN** the system SHALL provide a repository-mediated migration path
- **AND** migrated records SHALL preserve timestamps, event ids when possible, uncertainty, and version links.

### Requirement: Query Memory Repository For Agent Context
The system SHALL query the active memory repository before Agent explanation or rewrite requests that need learning context.

#### Scenario: Explanation target has history
- **GIVEN** a selected target has prior learning events, profile hints, summaries, versions, graph edges, or vectors
- **WHEN** background prepares an Agent request
- **THEN** the repository SHALL return a sanitized memory packet with evidence ids, uncertainty, cooldowns, related objects, and version metadata.

#### Scenario: Memory query fails
- **GIVEN** the active memory repository cannot satisfy a query
- **WHEN** an Agent request is prepared
- **THEN** the system SHALL use a structured unavailable or degraded-memory state
- **AND** it SHALL NOT invent memory relationships or semantic similarity scores.

## REMOVED Requirements

### Requirement: Maintain IndexedDB Learning Memory
**Reason**: Learning memory is no longer required to be authored directly against IndexedDB as the persistent source of truth. MVP local mode needs a repository boundary so localhost service can provide cross-browser memory while IndexedDB remains a fallback or migration source.

**Migration**: Replace direct IndexedDB assumptions with repository-backed memory operations. Existing IndexedDB data SHALL be readable through a browser-local repository adapter and MAY be migrated into the localhost repository when local memory capability is enabled.
