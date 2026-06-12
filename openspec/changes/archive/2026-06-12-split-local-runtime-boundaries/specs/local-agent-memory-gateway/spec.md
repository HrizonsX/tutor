## ADDED Requirements

### Requirement: Gateway Delegates Runtime Responsibilities
The Local Gateway HTTP API SHALL delegate Agent, Memory, Provider, and runtime configuration responsibilities to Local Agent Runtime interfaces rather than directly owning runtime internals.

#### Scenario: Explain request is delegated
- **GIVEN** the browser extension posts a valid Agent request to `/explain`
- **WHEN** the gateway handles the HTTP request
- **THEN** it SHALL authenticate the request, parse the request body, delegate explanation handling to the Local Agent Runtime, and serialize the runtime result
- **AND** it SHALL NOT directly query the Local Memory Store, create the runtime explain pipeline, or call a Provider Adapter for that request.

#### Scenario: Rewrite request is delegated
- **GIVEN** the browser extension posts a valid Agent request to `/rewrite`
- **WHEN** the gateway handles the HTTP request
- **THEN** it SHALL authenticate the request, parse the request body, delegate rewrite handling to the Local Agent Runtime, and serialize the runtime result
- **AND** it SHALL NOT directly query the Local Memory Store, create the runtime explain pipeline, or call a Provider Adapter for that request.

#### Scenario: Memory endpoint is delegated
- **GIVEN** the browser extension posts a memory event write or memory query request
- **WHEN** the gateway handles `/memory/events` or `/memory/query`
- **THEN** it SHALL delegate the operation through Local Agent Runtime or Memory Runtime
- **AND** it SHALL NOT directly import or instantiate Local Memory Store implementation code in the HTTP gateway module.

### Requirement: Local Agent Runtime Owns Request Orchestration
The Local Agent Runtime SHALL own explain and rewrite orchestration across input normalization, memory retrieval, decision policy, provider invocation, persistence, summarizer scheduling, and relation discovery scheduling.

#### Scenario: Provider-backed explanation succeeds
- **GIVEN** a valid explain request requires provider generation
- **WHEN** Local Agent Runtime handles the request
- **THEN** it SHALL query runtime-owned memory, run decision policy, call Provider Runtime, persist valid explanation evidence through Memory Runtime, and return the finalized Agent result.

#### Scenario: Existing explanation is reused
- **GIVEN** runtime-owned memory contains a suitable exact prior explanation for the requested target
- **WHEN** Local Agent Runtime policy chooses to reuse it
- **THEN** the runtime SHALL return the existing explanation result without asking the HTTP gateway to inspect memory internals or provider configuration.

#### Scenario: Runtime capability is unavailable
- **GIVEN** Provider Runtime or Memory Runtime cannot satisfy a requested capability
- **WHEN** Local Agent Runtime handles the request
- **THEN** it SHALL return a structured unavailable, degraded, or invalid result with a normalized reason
- **AND** the gateway SHALL preserve that structured result when serializing the HTTP response.

### Requirement: Gateway HTTP Surface Remains Compatible
The runtime boundary split SHALL preserve existing Local Gateway endpoint shapes, local pairing behavior, HTTP status mapping, JSON response structure, redacted logging, and development stub behavior.

#### Scenario: Existing endpoint remains available
- **WHEN** the local gateway starts after the boundary split
- **THEN** `/health`, `/config`, `/explain`, `/rewrite`, `/embedding`, `/memory/events`, and `/memory/query` SHALL remain available with the same protocol-level request and response shapes.

#### Scenario: Pairing is enforced before delegation
- **GIVEN** a pairing token is configured
- **WHEN** an unauthenticated gateway request is received
- **THEN** the gateway SHALL reject the request with the existing structured pairing rejection reason before delegating to Local Agent Runtime.

#### Scenario: Development stub remains explicit
- **GIVEN** the gateway is started in explicit development stub mode
- **WHEN** `/explain` or `/rewrite` is requested
- **THEN** the request SHALL still return a stable development stub Agent result through the same HTTP endpoint surface
- **AND** stub behavior SHALL NOT require browser-side fixture generation.
