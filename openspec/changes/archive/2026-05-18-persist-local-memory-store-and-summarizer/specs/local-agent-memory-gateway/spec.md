## ADDED Requirements

### Requirement: Gateway Uses Persistent Local Memory Store
The localhost gateway SHALL use the Local Agent Runtime's persistent Local Memory Store for memory capabilities when that store is configured.

#### Scenario: Memory event write persists locally
- **GIVEN** persistent local memory is configured
- **WHEN** the gateway receives a valid `/memory/events` request
- **THEN** it SHALL persist the event to the Local Memory Store
- **AND** the response SHALL identify local gateway repository mode, shared memory status, and the stored event metadata.

#### Scenario: Memory query reads summarized store
- **GIVEN** persistent local memory is configured
- **WHEN** the gateway receives a `/memory/query` request
- **THEN** it SHALL query the Local Memory Store for summarized learning context
- **AND** the result SHALL include repository mode, shared status, memory freshness or degraded state, and sanitized memory packet data.

### Requirement: Gateway Injects Memory Context For Explain And Rewrite
The Local Agent Runtime SHALL inject summarized memory context into explain and rewrite requests before provider adapter dispatch.

#### Scenario: Explain request has local memory
- **GIVEN** an `/explain` request names a target with local learning history
- **WHEN** the gateway prepares the provider request
- **THEN** it SHALL query the Local Memory Store
- **AND** it SHALL inject sanitized summarized memory context into the internal Agent request before dispatching to the provider adapter.

#### Scenario: Rewrite request has feedback history
- **GIVEN** a `/rewrite` request includes a previous explanation and feedback event
- **WHEN** the gateway prepares the provider request
- **THEN** it SHALL include relevant explanation preference summaries, prior version metadata, and feedback evidence ids from local memory when available.

#### Scenario: Browser packet does not override local memory
- **GIVEN** the browser request includes a stale or partial memory packet
- **AND** the Local Memory Store is available
- **WHEN** the gateway prepares an explain or rewrite request
- **THEN** local runtime memory context SHALL take precedence
- **AND** browser-provided memory context SHALL be ignored or merged only as degraded fallback metadata.

### Requirement: Gateway Reports Store And Summarizer Health
Gateway health and diagnostics SHALL expose redacted Local Memory Store and Memory Summarizer status.

#### Scenario: Health includes memory runtime state
- **WHEN** `/health` is requested
- **THEN** the gateway SHALL report memory repository mode, persistence availability, schema version, migration status, summarizer enabled state, backlog or stale-summary status, and last summary timestamp when available
- **AND** it SHALL NOT expose raw event payloads, full page text, pairing tokens, provider tokens, or unsanitized summaries.

#### Scenario: Summarizer degraded
- **GIVEN** Memory Summarizer processing has failed or fallen behind
- **WHEN** `/health` or diagnostics are requested
- **THEN** the gateway SHALL report a structured degraded memory reason
- **AND** proactive explanation behavior SHALL remain able to fail quietly or proceed with degraded memory status rather than fabricated context.

### Requirement: Gateway Supports Persistent Store Configuration
The Local Agent Runtime SHALL allow the gateway process to select persistent memory store mode and location through runtime configuration.

#### Scenario: Store path configured
- **GIVEN** a local memory store path is configured for the gateway runtime
- **WHEN** the gateway starts
- **THEN** it SHALL open or initialize the Local Memory Store at that location
- **AND** it SHALL bind memory APIs to that store for the lifetime of the process.

#### Scenario: In-memory mode is explicit
- **GIVEN** the gateway is started in an explicit in-memory development or test mode
- **WHEN** `/health` is requested
- **THEN** it SHALL report that memory persistence is unavailable or disabled
- **AND** it SHALL NOT present in-memory state as persistent cross-browser memory.
