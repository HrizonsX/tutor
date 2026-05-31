# local-agent-memory-gateway Specification

## Purpose
TBD - created by archiving change unify-local-agent-memory-gateway. Update Purpose after archive.
## Requirements
### Requirement: Localhost Agent Gateway MVP
The system SHALL support a localhost gateway that acts as the Local Agent Runtime HTTP boundary for Agent, memory, provider adapter, structured response, and capability discovery flows.

#### Scenario: Local gateway is configured
- **GIVEN** the browser extension is enabled
- **WHEN** the background service worker initializes Agent, memory, health, or embedding access
- **THEN** it SHALL target a configured `127.0.0.1` or `localhost` HTTP endpoint
- **AND** it SHALL NOT require content scripts to know the endpoint
- **AND** it SHALL NOT target external model-provider domains.

#### Scenario: Local gateway exposes core endpoints
- **WHEN** the local gateway is healthy
- **THEN** it SHALL expose health, explain, rewrite, embedding, memory event write, and memory query capabilities either as separate endpoints or equivalent protocol actions
- **AND** it SHALL expose enough capability information for the browser extension to determine whether proactive requests should remain quiet.

#### Scenario: Local gateway is unavailable
- **GIVEN** the localhost gateway is not reachable
- **WHEN** the background service worker receives an Agent, embedding, or memory request
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
The localhost gateway SHALL own the MVP persistent learning memory repository for cross-browser use.

#### Scenario: Learning event is recorded
- **GIVEN** the user sees, dismisses, expands, regenerates, mutes, or rates an explanation
- **WHEN** the event is persisted
- **THEN** the browser extension SHALL write the structured event through the background-to-gateway memory API when local repository capability is available.

#### Scenario: Memory context is needed
- **GIVEN** local policy selects an explanation target
- **WHEN** the background service worker prepares an Agent request
- **THEN** it SHALL query the gateway memory repository for relevant events, profile hints, prior versions, summaries, graph relationships, cooldowns, and optional similar vectors.

#### Scenario: Repository stores memory graph
- **WHEN** the local memory repository persists learned knowledge state
- **THEN** it SHALL store learning events, profile hints, explanation versions, agent summaries, graph edges, optional vectors, schema version, and migration metadata.

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

### Requirement: Gateway Owns Provider Runtime
The local gateway SHALL own model-provider configuration, provider adapter execution, structured JSON parsing, schema validation, provider error normalization, and provider runtime logs.

#### Scenario: Explain request uses runtime provider
- **GIVEN** the gateway has an explain provider configured with an adapter
- **WHEN** the browser extension posts an internal Agent request to `/explain`
- **THEN** the gateway SHALL select the configured provider adapter
- **AND** it SHALL convert the internal request into the provider request
- **AND** it SHALL return a stable Agent explanation result to the browser extension.

#### Scenario: Rewrite request uses runtime provider
- **GIVEN** the gateway has rewrite capability enabled through the explain provider role or equivalent runtime configuration
- **WHEN** the browser extension posts an internal Agent request to `/rewrite`
- **THEN** the gateway SHALL handle provider adapter dispatch and return a stable Agent rewrite or explanation result.

#### Scenario: Gateway returns structured provider failure
- **GIVEN** provider dispatch fails due to auth, rate limit, timeout, unsupported model, invalid JSON, schema invalidity, or provider unavailability
- **WHEN** the gateway responds to the browser extension
- **THEN** it SHALL return a structured unavailable or invalid result with a normalized reason
- **AND** it SHALL NOT include provider token values in the response.

### Requirement: Gateway Development Stub
The local gateway SHALL continue to provide explicit development stub explain and rewrite behavior when no external provider is configured.

#### Scenario: Stub explain is enabled
- **GIVEN** the gateway is started in development stub mode
- **WHEN** the browser extension posts an internal Agent request to `/explain`
- **THEN** the gateway SHALL return a stable available Agent explanation result from the stub
- **AND** the browser extension SHALL render it through the same overlay path as a provider-backed result.

#### Scenario: Stub explain is disabled
- **GIVEN** no runtime provider is configured
- **AND** development stub mode is disabled
- **WHEN** the browser extension posts an internal Agent request to `/explain`
- **THEN** the gateway SHALL return a structured unavailable result
- **AND** the browser extension SHALL NOT create local fixture-generated knowledge text.

### Requirement: Own Cognitive Memory Recall Planning
Gateway / Local Agent Runtime SHALL own the recall planner used before explain and rewrite provider dispatch.

#### Scenario: Runtime prepares recall bridges
- **WHEN** an explain request names a current target
- **THEN** Gateway / Local Agent Runtime SHALL query exact concept memory, session context, and active one-hop relations and SHALL inject only policy-selected memory bridges.

#### Scenario: Browser recall fields are ignored
- **WHEN** a browser request includes memory bridges, relation candidates, daily summaries, concept projections, or report context
- **THEN** Gateway / Local Agent Runtime SHALL ignore those browser-provided fields for personalization.

### Requirement: Run Async Relation Discovery
Gateway / Local Agent Runtime SHALL run day-indexed relation discovery outside the blocking Overlay explanation path.

#### Scenario: Explanation is not blocked by discovery
- **WHEN** a new concept explanation is requested
- **THEN** the runtime SHALL be able to dispatch the provider request using fast recall without waiting for daily-summary relation discovery to complete.

#### Scenario: Discovery processes selected days
- **WHEN** async relation discovery runs
- **THEN** it SHALL select bounded relevant days, load day-scoped concept blocks, invoke relation proposal when available, and pass proposals through the relation gate.

### Requirement: Enforce Relation Proposal Gate
Gateway / Local Agent Runtime SHALL validate and gate relation proposals before writing relation state.

#### Scenario: Gate validates proposal output
- **WHEN** relation proposal output is received
- **THEN** the runtime SHALL validate schema, canonical names, source dates, relation type, self-loop status, confidence, and basis before persistence.

#### Scenario: Gate controls Overlay usability
- **WHEN** a proposal is persisted as candidate because evidence is weak
- **THEN** the runtime SHALL mark it unavailable for Overlay recall until stronger evidence promotes it.

### Requirement: Generate Reflection Reports
Gateway / Local Agent Runtime SHALL generate daily and weekly reflection reports through the runtime memory repository.

#### Scenario: Report generation uses reflection policy
- **WHEN** a daily or weekly report is generated
- **THEN** the runtime SHALL use ReflectionReportPolicy rather than OverlayRecallPolicy.

#### Scenario: Report generation does not mutate Overlay recall
- **WHEN** a report includes a weak, stale, or possibly forgotten concept
- **THEN** the runtime SHALL NOT automatically add that concept to future Overlay recall without an eligible relation or exact target match.

### Requirement: Limit LLM Relation Work
Gateway / Local Agent Runtime SHALL bound and cache LLM relation work.

#### Scenario: Discovery concurrency is bounded
- **WHEN** multiple selected days require relation proposal calls
- **THEN** the runtime SHALL apply a configured concurrency limit.

#### Scenario: Proposal cache avoids repeated calls
- **WHEN** the same target, daily summary hash, and proposer version have already produced relation proposal output
- **THEN** the runtime MAY reuse cached proposal results instead of calling the provider again.

### Requirement: Gateway Runtime Config API
The localhost gateway SHALL expose paired configuration endpoints or equivalent protocol actions for reading and updating gateway-owned runtime configuration.

#### Scenario: Config is read
- **WHEN** a paired browser extension requests gateway runtime configuration
- **THEN** the gateway SHALL return redacted effective runtime configuration, config version, update timestamp, supported hot-update fields, and restart-required field metadata.

#### Scenario: Config is updated
- **WHEN** a paired browser extension submits a valid gateway-owned configuration update
- **THEN** the gateway SHALL validate the update
- **AND** it SHALL persist and apply supported hot-updatable fields for subsequent requests.

#### Scenario: Config update is unauthorized
- **GIVEN** local pairing is required
- **WHEN** an unpaired or rejected request attempts to read or update runtime configuration
- **THEN** the gateway SHALL return a structured pairing-required or pairing-rejected result
- **AND** it SHALL NOT expose runtime configuration or secret presence metadata.

### Requirement: Gateway Applies Runtime Config Without Restart For Supported Fields
The gateway SHALL apply supported runtime configuration updates without requiring process restart.

#### Scenario: Provider runtime config changes
- **WHEN** provider or relation proposer routing configuration is updated successfully
- **THEN** subsequent `/explain`, `/rewrite`, `/embedding`, and scheduled relation proposal dispatches SHALL use the updated routing configuration.

#### Scenario: Memory recall policy changes
- **WHEN** relation depth, bridge caps, selected day limits, relation proposal concurrency, report limits, or forgetting window settings are updated successfully
- **THEN** subsequent memory query, recall planning, relation discovery, and report generation operations SHALL use the updated settings.

### Requirement: Gateway Owns Relation Proposer Dispatch
Gateway / Local Agent Runtime SHALL own relation proposer dispatch and SHALL NOT depend on browser-supplied relation proposals or memory bridges.

#### Scenario: Browser sends relation fields
- **GIVEN** an `/explain` or `/rewrite` request contains browser-provided relation proposals, relation candidates, memory bridges, daily summaries, or report context
- **WHEN** the gateway normalizes the request
- **THEN** it SHALL ignore those browser-provided memory graph fields
- **AND** it SHALL use only runtime-owned memory and relation proposer configuration.

#### Scenario: Runtime dispatches proposer
- **WHEN** relation discovery is scheduled by the gateway after successful explanation persistence
- **THEN** the gateway SHALL dispatch relation proposal through runtime-owned provider configuration
- **AND** it SHALL persist only gated relation records.
