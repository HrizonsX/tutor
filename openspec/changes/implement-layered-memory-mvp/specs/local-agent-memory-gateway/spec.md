## ADDED Requirements

### Requirement: Select Memory Repository Backend
Gateway / Local Agent Runtime SHALL select the active memory repository backend from runtime configuration while preserving browser-facing endpoint contracts.

#### Scenario: Layered repository configured
- **WHEN** runtime configuration selects the layered memory repository
- **THEN** Gateway / Local Agent Runtime SHALL route health, memory event writes, memory queries, explain/rewrite memory injection, relation discovery, and report generation through the layered repository
- **AND** the browser extension SHALL continue using the existing endpoint family.

#### Scenario: Fallback repository configured
- **WHEN** runtime configuration selects SQLite or in-memory local store mode
- **THEN** Gateway / Local Agent Runtime SHALL route memory operations through the existing Local Memory Store
- **AND** browser requests SHALL not need to distinguish the backend.

### Requirement: Report Layered Memory Health
Gateway health and diagnostics SHALL expose redacted layered memory repository status when the layered backend is active.

#### Scenario: Health includes layered components
- **WHEN** `/health` is requested and layered memory is active
- **THEN** the response SHALL include redacted Postgres, Redis, vector adapter, outbox worker, schema, and projection freshness status
- **AND** it SHALL not expose connection secrets, raw event payloads, full page text, provider tokens, or evidence snippets.

#### Scenario: Layer is degraded
- **WHEN** Postgres, Redis, vector recall, or outbox projection is degraded
- **THEN** gateway health SHALL identify the degraded layer and reason
- **AND** proactive browser behavior SHALL be able to fail quietly or proceed with bounded degraded memory status.

### Requirement: Preserve Stateless Browser Boundary
Gateway / Local Agent Runtime SHALL keep the browser extension stateless with respect to layered memory storage and recall planning.

#### Scenario: Browser sends memory fields
- **WHEN** an explain or rewrite request includes browser-provided memory packet, relation candidates, vector candidates, daily summaries, or memory bridges
- **THEN** Gateway / Local Agent Runtime SHALL ignore those fields for personalization
- **AND** it SHALL use only the active runtime-owned memory repository.

#### Scenario: Gateway unavailable
- **WHEN** the active memory repository is unavailable or unpaired
- **THEN** browser extension code SHALL receive structured unavailable or degraded memory results
- **AND** it SHALL not fall back to IndexedDB, localStorage, sessionStorage, chrome storage, or page-lifetime memory objects.

### Requirement: Inject Layered Memory Into Provider Requests
Gateway / Local Agent Runtime SHALL inject sanitized layered memory context into explain and rewrite provider requests when the layered repository is active.

#### Scenario: Layered memory has selected bridges
- **WHEN** an explain or rewrite request has selected exact, session, relation, or vector recall bridges
- **THEN** the provider request SHALL include only policy-selected bounded memory context
- **AND** each bridge SHALL include source role, relation or recall reason, evidence ids when available, uncertainty, and non-fact-source caution.

#### Scenario: Exact prior explanation exists only for target
- **WHEN** exact prior explanation reuse is considered
- **THEN** Gateway / Local Agent Runtime SHALL only return an existing explanation for the same canonical target
- **AND** related or vector-recalled concepts SHALL not bypass provider generation as if they were exact target history.
