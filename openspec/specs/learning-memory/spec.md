# learning-memory Specification

## Purpose
TBD - created by archiving change add-browser-cognitive-overlay. Update Purpose after archive.
## Requirements
### Requirement: Maintain Learning Memory
The system MUST maintain learning memory for concepts, recent topics, repeated triggers, user responses, and concept associations.

#### Scenario: Record explained concepts
- **GIVEN** the system shows an explanation for a new concept
- **WHEN** the explanation is displayed
- **THEN** the system MUST record that an explanation was shown for the concept.

#### Scenario: Track repeated confusion
- **GIVEN** the same concept triggers confusion inference multiple times
- **WHEN** the system updates learning memory
- **THEN** the system MUST record repeated confusion events
- **AND** the system MAY increase the concept's possibly weak signal.

#### Scenario: Track expanded explanations
- **GIVEN** the user expands an explanation
- **WHEN** the system updates learning memory
- **THEN** the system MUST record that the concept needed deeper explanation in that event.

#### Scenario: Track dismissed prompts
- **GIVEN** the user closes an explanation prompt
- **WHEN** the system updates learning memory
- **THEN** the system MUST record a dismissal event for the concept and prompt context.

#### Scenario: Track concept associations
- **GIVEN** the system explains a concept using a relationship to a previously encountered concept
- **WHEN** the system records the explanation event
- **THEN** the system MUST record the association between those concepts.

### Requirement: Record Explanation Events
The system MUST record each explanation event with enough structured information to support future retrieval and interruption control.

#### Scenario: Record shown explanation event
- **GIVEN** an explanation is shown to the user
- **WHEN** the event is recorded
- **THEN** the record MUST include the canonical concept, prompt context metadata, whether the concept is repeated, and whether historical concepts were used.

#### Scenario: Record user response to explanation
- **GIVEN** the user expands, dismisses, or ignores an explanation
- **WHEN** the response is observed
- **THEN** the system MUST record the response as an event associated with the explanation.

### Requirement: Avoid Memory Pollution From Ambiguous Feedback
The system MUST record user feedback as events and MUST NOT directly convert ambiguous single actions into certain mastery states.

#### Scenario: Dismissal does not mean mastered
- **GIVEN** the user closes an explanation prompt
- **WHEN** the system updates learning memory
- **THEN** the system MUST record a `dismissed` event
- **AND** the system MUST NOT directly mark the concept as mastered.

#### Scenario: Expansion does not prove lack of understanding
- **GIVEN** the user expands an explanation
- **WHEN** the system updates learning memory
- **THEN** the system MUST record an `expanded` event
- **AND** the system MAY increase a possible need for deeper explanation
- **AND** the system MUST NOT conclude from that single event that the user does not understand the concept.

#### Scenario: Repeated confusion remains probabilistic
- **GIVEN** the same concept repeatedly triggers confusion signals
- **WHEN** the system updates learning memory
- **THEN** the system MUST record `repeated_confusion`
- **AND** the system MAY increase the concept's possibly weak signal.

#### Scenario: Recent exposure does not mean mastered
- **GIVEN** the user recently encountered a concept multiple times without strong confusion behavior
- **WHEN** the system updates learning memory
- **THEN** the system MAY record `recently_seen` or `possibly_familiar`
- **AND** the system MUST NOT directly mark the concept as mastered.

#### Scenario: Single dismissal lowers interruption priority only
- **GIVEN** the system prepares to use learning memory for a concept with only one dismissal event
- **WHEN** the system computes explanation strategy
- **THEN** the system MUST NOT treat the concept as mastered
- **AND** the system MUST lower interruption frequency rather than permanently stop explaining the concept.

### Requirement: Derive Uncertain Learning Signals
The system MUST derive learning signals from event patterns while preserving uncertainty.

#### Scenario: Derive possibly weak
- **GIVEN** a concept has repeated confusion events, repeated revisits, or repeated expansions
- **WHEN** derived memory signals are computed
- **THEN** the system MAY mark the concept as `possibly_weak` with non-final confidence.

#### Scenario: Derive low intervention preference
- **GIVEN** the user repeatedly dismisses similar prompts quickly
- **WHEN** derived memory signals are computed
- **THEN** the system MAY mark similar prompts as `low_intervention_preferred`.

#### Scenario: Derive recently explained
- **GIVEN** the system recently displayed an explanation for a concept
- **WHEN** derived memory signals are computed
- **THEN** the system MUST mark the concept as recently explained for cooldown and repetition control.

### Requirement: Preserve Privacy In Learning Memory
The system MUST prefer storing concepts, structured events, derived signals, and minimal context metadata instead of full web page text.

#### Scenario: Store event state instead of full article text
- **GIVEN** the system records a learning event
- **WHEN** the event is persisted
- **THEN** the system MUST store the minimum necessary concept, event, and context metadata
- **AND** the system MUST avoid storing full page text unless explicitly required by the feature.

#### Scenario: Use stable canonical names
- **GIVEN** an event is associated with an aliased concept expression
- **WHEN** the event is persisted
- **THEN** the system MUST store the canonical concept name and MAY store the observed alias.

### Requirement: Record Knowledge Object Feedback Events
The system MUST record explicit user feedback about knowledge explanations as structured memory events associated with the target object, explanation version, context metadata, and feedback type.

#### Scenario: Record known feedback
- **GIVEN** the user marks an explanation or object as known
- **WHEN** the feedback is recorded
- **THEN** the system MUST store a `marked_known` event without permanently marking the object as mastered.

#### Scenario: Record confusing feedback
- **GIVEN** the user marks an explanation as confusing or not understood
- **WHEN** the feedback is recorded
- **THEN** the system MUST store a `marked_confusing` event without concluding that the user does not understand the object.

#### Scenario: Record wrong feedback
- **GIVEN** the user marks an explanation as inaccurate
- **WHEN** the feedback is recorded
- **THEN** the system MUST store a `marked_wrong` event and lower trust in that explanation version.

### Requirement: Record Regeneration Events
The system MUST record explanation regeneration as a memory event that links the target object, previous explanation version, requested style, and regenerated version.

#### Scenario: User requests different wording
- **GIVEN** the user clicks a regenerate control
- **WHEN** the request is recorded
- **THEN** the system MUST store the request with the target object, previous version, feedback reason, and requested style.

#### Scenario: Regenerated explanation receives feedback
- **GIVEN** the user responds to a regenerated explanation
- **WHEN** memory is updated
- **THEN** the system MUST link the response to the regenerated version and the original regeneration request.

### Requirement: Store Agentic Summaries With Evidence
The system MUST store agent-produced memory summaries only when they include source events, uncertainty, and timestamp metadata.

#### Scenario: Agent groups related objects
- **GIVEN** the agent proposes that two objects are related
- **WHEN** the relationship is stored
- **THEN** the system MUST store evidence events and uncertainty rather than a bare assertion.

#### Scenario: Agent derives user preference
- **GIVEN** the agent derives a likely preference from repeated feedback
- **WHEN** the preference is stored
- **THEN** the system MUST attach supporting event identifiers and avoid converting the preference into a permanent trait.

### Requirement: Preserve Minimal Context For Privacy
The system MUST store only the minimum necessary context for knowledge memory, feedback learning, and explanation regeneration.

#### Scenario: Store feedback context
- **GIVEN** the user provides feedback on an explanation
- **WHEN** the event is persisted
- **THEN** the system MUST store the target object, explanation version, feedback type, timestamp, and minimal fragment metadata.

#### Scenario: Avoid full page storage
- **GIVEN** the system records an encounter, explanation, or feedback event
- **WHEN** the event is persisted
- **THEN** the system MUST avoid storing full webpage text unless an explicit feature requires it.

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

### Requirement: Preserve Event-First Concept Memory
The system SHALL preserve raw learning events as the evidence base for concept memory and SHALL derive concept state as a recomputable view.

#### Scenario: Event is stored before concept projection
- **WHEN** a seen, explained, expanded, dismissed, selected-term, repeated-confusion, revisited, or ignored-overlay interaction occurs
- **THEN** the system SHALL persist the raw event before updating concept projections or summaries.

#### Scenario: Projection remains uncertain
- **WHEN** concept state is derived from raw events
- **THEN** the system SHALL include uncertainty and source event ids and SHALL NOT treat the projection as authoritative mastery state.

### Requirement: Record Memory Used During Explanation
The system SHALL record which historical concepts and relations were used to bridge an explanation.

#### Scenario: Explanation records memory bridges
- **WHEN** an explanation uses a historical concept bridge
- **THEN** the system SHALL record the target concept, bridge concept, relation type, relation id when available, explanation version id, timestamp, and source role.

#### Scenario: Unused candidates are not treated as used
- **WHEN** relation discovery proposes candidates that are not injected into the final explanation request
- **THEN** the system SHALL NOT record them as used-in-explanation memory bridges.

### Requirement: Store Relation Proposals As Learning Context
The system SHALL store relation proposals and gated relations as uncertain learning context rather than world knowledge.

#### Scenario: LLM proposal is not automatically active
- **WHEN** an LLM returns a structured relation proposal
- **THEN** the system SHALL store it only after relation gate validation and SHALL NOT treat the proposal alone as an active relation.

#### Scenario: Relation evidence omits snippets
- **WHEN** a relation proposal or gated relation is persisted
- **THEN** it SHALL store source event ids, explanation version ids, source dates, context hashes, evidence text hashes, source kind, proposer version, and confidence reason
- **AND** it SHALL NOT store an evidence snippet.

### Requirement: Store Memory Candidates Separately
The system SHALL store memory candidates as uncertain signals separate from long-term derived memory.

#### Scenario: Candidate created from explanation behavior
- **GIVEN** a user requests simpler wording, more background, marks an explanation confusing, marks an explanation inaccurate, or repeatedly expands related explanations
- **WHEN** the Runtime records the behavior
- **THEN** it SHALL write raw event evidence and MAY write a memory candidate with uncertainty and source event ids
- **AND** it SHALL NOT directly convert that candidate into a profile preference or concept state.

#### Scenario: Candidate created from provider output
- **GIVEN** a valid provider explanation contains structured hints such as terms, confidence, actions, or explanation summary
- **WHEN** the Runtime persists the explanation
- **THEN** it MAY write bounded memory candidates linked to the explanation version
- **AND** those candidates SHALL be treated as model-generated signals requiring summarizer review.

### Requirement: Summarizer Promotes Derived Learning Memory
The Memory Summarizer SHALL be the only component that promotes raw evidence or memory candidates into concept state, profile summary, or retrieval summary.

#### Scenario: Concept state is derived
- **GIVEN** multiple raw events or candidates support a familiar, confusing, muted, recently explained, needs simpler explanation, or preferred style signal
- **WHEN** the summarizer updates concept state
- **THEN** it SHALL write source event ids, source candidate ids when applicable, timestamp, summarizer version, and uncertainty
- **AND** it SHALL avoid certain mastery or certain non-understanding from ambiguous evidence.

#### Scenario: Profile summary is derived
- **GIVEN** repeated evidence supports a possible explanation preference or domain familiarity signal
- **WHEN** the summarizer updates profile summary
- **THEN** it SHALL store the summary with evidence references, uncertainty, and summarizer metadata
- **AND** it SHALL NOT treat a single accidental click or one model output as a durable user trait.

### Requirement: Retrieval Packet Is Recomputed From Runtime Memory
The retrieval packet used for explain and rewrite SHALL be assembled at request time from runtime-owned memory views and bounded raw evidence.

#### Scenario: Explain retrieval packet is built
- **GIVEN** SQLite contains concept state, profile summary, explanation history, feedback evidence, and retrieval summaries for a target
- **WHEN** the Runtime prepares an explain decision
- **THEN** it SHALL assemble a retrieval packet from those runtime-owned sources
- **AND** it SHALL label the packet as local learning state rather than world knowledge.

#### Scenario: Browser refresh loses no durable memory
- **GIVEN** the browser page is refreshed or the browser is closed
- **WHEN** the same Runtime SQLite store remains available
- **THEN** future retrieval packets SHALL continue to use runtime memory persisted in SQLite
- **AND** browser-local memory SHALL NOT be required.
