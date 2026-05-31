## ADDED Requirements

### Requirement: Browser-To-Runtime Requests Are Stateless
Browser-originated Agent requests SHALL be stateless with respect to user memory and SHALL carry only immediate request context.

#### Scenario: Browser sends explain request
- **GIVEN** the user selects text or the overlay selects a target from the current page
- **WHEN** the browser extension sends an explain request
- **THEN** the request SHALL include only current target identity, selected text, current fragment, URL/title metadata, language when available, current DOM context needed for the request, request goal, and browser-safe constraints
- **AND** it SHALL NOT include browser-cached profile, memory packet, concept familiarity, prior explanation history, feedback history, or preference summaries.

#### Scenario: Browser sends rewrite request
- **GIVEN** the user requests a regenerated explanation
- **WHEN** the browser extension sends a rewrite request
- **THEN** the request MAY include the current previous explanation version and current feedback event
- **AND** it SHALL NOT include historical feedback or profile summaries from browser-local memory.

## MODIFIED Requirements

### Requirement: Stable Agent Protocol
The system SHALL define a stable Agent request and response contract for health, explain, rewrite, embedding, and memory-aware explanation capabilities, with a clear distinction between stateless browser-to-runtime requests and runtime-internal memory-injected provider requests.

#### Scenario: Browser Agent request is sent
- **GIVEN** local policy selected a target or a user requested regeneration
- **WHEN** the browser extension sends an Agent request to Gateway / Local Agent Runtime
- **THEN** the request SHALL include request id, capability kind, target identity, immediate context, current operation data, constraints, schema version, and browser-safe metadata
- **AND** it SHALL NOT include browser-derived memory packets, profile hints, prior explanations, derived summaries, or concept familiarity.

#### Scenario: Runtime provider request is prepared
- **GIVEN** Gateway / Local Agent Runtime has received a browser Agent request
- **WHEN** it prepares an internal provider request for explain or rewrite
- **THEN** the runtime MAY include sanitized runtime-owned memory packets, profile hints, prior explanation metadata, explanation preferences, provider mode, and configured model name when present.

#### Scenario: Agent returns structured status
- **WHEN** an Agent response is received
- **THEN** the response SHALL include a structured status such as `available`, `unavailable`, `ambiguous`, or `invalid`
- **AND** the system SHALL NOT infer provider state by parsing free-form text.

#### Scenario: Agent response is invalid
- **GIVEN** an Agent response is missing required fields for the requested capability
- **WHEN** Gateway / Local Agent Runtime or background validates the response
- **THEN** it SHALL normalize the result to `invalid`
- **AND** no explanation version or memory update SHALL be persisted from that invalid response.
