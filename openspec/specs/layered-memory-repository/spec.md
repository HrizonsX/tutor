# layered-memory-repository Specification

## Purpose
TBD - created by archiving change implement-layered-memory-mvp. Update Purpose after archive.
## Requirements
### Requirement: Provide Layered Memory Repository
The system SHALL provide a layered memory repository implementation with Postgres as durable source of truth, Redis as ephemeral session view, and a vector recall adapter boundary.

#### Scenario: Layered repository is selected
- **WHEN** Gateway / Local Agent Runtime starts with layered memory repository configuration
- **THEN** it SHALL construct the Postgres store, Redis session view, vector recall adapter, and outbox worker boundary
- **AND** it SHALL expose memory query and memory event write capabilities through the same runtime repository contract used by the existing local store.

#### Scenario: Layered repository is unavailable
- **WHEN** the layered repository is selected but Postgres or required configuration is unavailable
- **THEN** memory APIs SHALL return structured unavailable results
- **AND** gateway health SHALL include the unavailable layer without falling back to browser-local memory.

### Requirement: Persist Event-First Memory In Postgres
The layered memory repository SHALL persist raw learning evidence and derived memory views in Postgres while preserving raw event rebuildability.

#### Scenario: Memory event write succeeds
- **WHEN** a valid memory event is written through the layered repository
- **THEN** the repository SHALL persist a raw event row and a durable outbox row in the same Postgres transaction
- **AND** it SHALL preserve canonical target identity, event type, timestamp, repository metadata, uncertainty, and evidence identifiers.

#### Scenario: Derived views are rebuilt
- **WHEN** concept state, daily summary, relation record, or vector profile projections are rebuilt
- **THEN** the repository SHALL keep raw events as source evidence
- **AND** derived records SHALL reference source event ids rather than replacing raw evidence.

### Requirement: Maintain Concept Registry And Alias State
The layered memory repository SHALL maintain concept registry and alias records needed for canonical lookup and recall planning.

#### Scenario: New concept is observed
- **WHEN** a raw event or explanation version references a canonical concept and observed alias
- **THEN** the repository SHALL upsert the canonical concept and alias metadata in Postgres
- **AND** subsequent memory queries SHALL be able to resolve the alias to the canonical concept.

#### Scenario: Alias is ambiguous
- **WHEN** an alias cannot be confidently resolved to a single canonical concept
- **THEN** the repository SHALL avoid inventing a canonical merge
- **AND** recall planning SHALL proceed with exact target state or degraded alias status.

### Requirement: Maintain Redis Session View
The layered memory repository SHALL use Redis only for short-lived session continuity and suppression state.

#### Scenario: Event updates session state
- **WHEN** a memory event or explanation result is persisted
- **THEN** the repository SHALL update Redis recent concepts, recently explained targets, and short-lived suppression state for the active session
- **AND** failure to update Redis SHALL degrade session recall without losing the Postgres write.

#### Scenario: Session state expires
- **WHEN** Redis TTL expires or Redis data is cleared
- **THEN** long-term memory SHALL remain queryable from Postgres
- **AND** gateway health SHALL not treat expired session state as durable memory loss.

### Requirement: Provide Vector Recall Adapter Boundary
The layered memory repository SHALL expose vector recall through an adapter contract rather than directly depending on a specific vector database.

#### Scenario: Vector adapter is disabled
- **WHEN** no vector recall adapter is configured
- **THEN** memory query SHALL continue using exact target state, session view, and active relations
- **AND** it SHALL not invent semantic similarity results.

#### Scenario: Vector adapter returns candidates
- **WHEN** a configured vector recall adapter returns candidate concepts for a memory query
- **THEN** the recall planner SHALL treat those candidates as bounded historical learning context
- **AND** it SHALL include scores, recall reasons, source role, and non-fact-source caution when selected for provider injection.

### Requirement: Process Outbox Projections
The layered memory repository SHALL process Postgres outbox records to update recomputable long-term memory projections.

#### Scenario: Outbox worker processes event
- **WHEN** an unprocessed outbox row exists for a raw memory event
- **THEN** the outbox worker SHALL update affected concept projections, relation candidate aggregates, daily summary state, and vector profile projection hooks
- **AND** it SHALL mark the outbox row processed only after projection work succeeds or records a retryable failure.

#### Scenario: Outbox worker lags
- **WHEN** outbox rows remain unprocessed beyond the configured threshold
- **THEN** diagnostics SHALL expose projection lag and failed projection counts
- **AND** memory query SHALL return exact/session fallback with degraded freshness instead of fabricated derived state.

### Requirement: Plan Bounded Layered Recall
The layered memory repository SHALL plan memory recall from exact state, Redis session view, active relations, and vector candidates while preserving current-explanation-first behavior.

#### Scenario: Related learning context exists
- **WHEN** exact memory, session concepts, active relations, or vector candidates are relevant to the current target
- **THEN** memory query SHALL rank candidates with current relevance, evidence strength, relation status, recency, and forgetting risk
- **AND** it SHALL inject no more than the configured Top 1-3 memory bridges.

#### Scenario: Memory is unrelated
- **WHEN** historical memory has no active relation, session continuity, exact match, or accepted vector relevance to the current target
- **THEN** memory query SHALL exclude that memory from provider context
- **AND** it SHALL not let long-term memory override the current page content.

### Requirement: Support Development Fallbacks
The layered memory repository SHALL coexist with existing SQLite and in-memory Local Memory Store implementations during the MVP migration.

#### Scenario: Fallback repository is selected
- **WHEN** runtime configuration selects SQLite or in-memory store mode
- **THEN** Gateway / Local Agent Runtime SHALL use the existing Local Memory Store behavior
- **AND** layered Postgres, Redis, and vector adapter dependencies SHALL not be required.

#### Scenario: Contract tests run
- **WHEN** repository contract tests exercise memory write, query, health, and relation recall behavior
- **THEN** the tests SHALL cover the layered repository and existing fallback implementations with compatible response shapes.
