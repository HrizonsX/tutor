## MODIFIED Requirements

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

## ADDED Requirements

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
