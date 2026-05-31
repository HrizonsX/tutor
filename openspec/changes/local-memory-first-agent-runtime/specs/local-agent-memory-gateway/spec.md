## ADDED Requirements

### Requirement: Gateway Is The Runtime Intelligence Boundary
The localhost gateway SHALL expose the Local Agent Runtime as the only intelligent boundary for browser plugin explain, rewrite, memory, provider, health, and diagnostics requests.

#### Scenario: Explain enters runtime pipeline
- **GIVEN** the browser extension posts a stateless explain request to the gateway
- **WHEN** the gateway handles `/explain`
- **THEN** it SHALL route the request through runtime input filtering, context filtering, memory retrieval, decision policy, optional provider adapter dispatch, and post-result persistence
- **AND** it SHALL NOT act as a pass-through proxy directly from browser request to provider request.

#### Scenario: Rewrite enters runtime pipeline
- **GIVEN** the browser extension posts a stateless rewrite request with the current previous version and current feedback event
- **WHEN** the gateway handles `/rewrite`
- **THEN** it SHALL route the request through runtime-owned memory retrieval and decision policy
- **AND** it SHALL use runtime-derived explanation preferences when available.

### Requirement: Gateway Ignores Browser Memory Payloads
The localhost gateway SHALL ignore browser-provided long-term memory fields when preparing explain, rewrite, or provider requests.

#### Scenario: Browser sends stale memory fields
- **GIVEN** an incoming gateway request includes browser-provided memory packet, profile hints, feedback history, concept familiarity, prior explanations, or derived summaries
- **WHEN** the gateway prepares runtime decision inputs
- **THEN** it SHALL strip or ignore those fields
- **AND** it SHALL query the Local Memory Store for any personalization needed by the runtime.

### Requirement: Gateway Returns Runtime Decision Metadata
The localhost gateway SHALL return structured runtime decision metadata for explain and rewrite requests.

#### Scenario: Provider call is skipped
- **GIVEN** runtime decision policy returns an existing explanation, invalid-input rejection, muted rejection, duplicate suppression, or degraded memory response
- **WHEN** the gateway responds to the browser extension
- **THEN** the response SHALL include decision kind, normalized reason, provider call status, memory freshness, and relevant version metadata when available
- **AND** the browser extension SHALL NOT need to infer the decision by parsing explanation text.

#### Scenario: Provider call succeeds
- **GIVEN** runtime decision policy calls a provider and receives a valid structured response
- **WHEN** the gateway responds to the browser extension
- **THEN** the response SHALL include provider metadata, explanation version metadata, memory write status, decision kind `call_provider`, and summarizer enqueue status.
