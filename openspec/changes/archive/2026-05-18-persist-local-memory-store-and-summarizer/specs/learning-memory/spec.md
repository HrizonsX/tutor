## ADDED Requirements

### Requirement: Preserve Raw And Derived Memory Boundaries
The system SHALL preserve raw learning events as evidence and SHALL store derived summaries as recomputable memory views.

#### Scenario: Feedback creates evidence before summary
- **GIVEN** the user marks an explanation as known, confusing, inaccurate, muted, or needing different wording
- **WHEN** learning memory is updated through the active repository
- **THEN** the raw feedback event SHALL be persisted as evidence
- **AND** any profile hint, concept state, or explanation preference derived from that feedback SHALL be stored as a separate summary record with source event ids.

#### Scenario: Derived summary is not authoritative history
- **GIVEN** a derived memory summary exists for a target
- **WHEN** the system builds learning context
- **THEN** it SHALL treat the summary as a derived view over raw events
- **AND** it SHALL retain the ability to inspect or rebuild from the source event ids.

### Requirement: Use Persistent Local Memory As Authoritative Repository
The system SHALL treat persistent Local Memory Store state as the authoritative learning memory when local gateway memory capability is available.

#### Scenario: Local store is available
- **GIVEN** the local gateway reports persistent memory capability
- **WHEN** learning events, explanation versions, profile events, summaries, graph edges, vectors, or migrations are read or written
- **THEN** the system SHALL use the Local Memory Store through the repository boundary
- **AND** browser IndexedDB SHALL NOT be treated as the authoritative cross-browser source of truth.

#### Scenario: Browser fallback is marked degraded
- **GIVEN** local memory capability is unavailable
- **WHEN** the browser-local repository records or queries learning memory
- **THEN** returned memory packets SHALL be marked as browser-local or degraded
- **AND** later migration to the Local Memory Store SHALL preserve event ids, timestamps, uncertainty, and version links when possible.

### Requirement: Derive Profile And Explanation Preference With Evidence
The system SHALL derive user profile and explanation preference signals from repeated event patterns with evidence and uncertainty.

#### Scenario: Repeated simpler requests
- **GIVEN** the user repeatedly requests simpler explanations for related targets
- **WHEN** the Memory Summarizer updates profile hints
- **THEN** it SHALL derive a possible simpler-style preference with source event ids and uncertainty
- **AND** it SHALL avoid storing a permanent user trait.

#### Scenario: Accepted regeneration influences future style
- **GIVEN** a regenerated explanation receives positive or lower-friction feedback
- **WHEN** the Memory Summarizer updates explanation preference views
- **THEN** it SHALL record the accepted style signal with the previous version id, regenerated version id, feedback event id, timestamp, and uncertainty.

### Requirement: Keep Learning Memory Privacy Minimal
The system SHALL keep persistent local learning memory limited to structured events, summaries, and minimal context metadata.

#### Scenario: Summarizer receives minimal evidence
- **GIVEN** raw events include page context metadata
- **WHEN** the Memory Summarizer builds derived memory views
- **THEN** it SHALL use minimal fields such as canonical target, observed alias, knowledge type, fragment id, origin/path hashes, timestamps, event type, and version ids
- **AND** it SHALL NOT require stored full page text.

#### Scenario: Provider packet uses sanitized memory
- **GIVEN** persistent learning memory contains raw event evidence and derived summaries
- **WHEN** memory context is prepared for an Agent request
- **THEN** the packet SHALL include sanitized summaries and evidence ids
- **AND** it SHALL NOT include unsanitized raw events or full page text.
