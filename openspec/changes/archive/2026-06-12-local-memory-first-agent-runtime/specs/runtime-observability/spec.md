## ADDED Requirements

### Requirement: Report Runtime Explain Pipeline Diagnostics
Runtime diagnostics SHALL expose redacted explain pipeline state for troubleshooting filter, memory, decision, provider, persistence, and summarizer behavior.

#### Scenario: Explain decision is recorded
- **GIVEN** the Runtime handles an explain or rewrite request
- **WHEN** diagnostics are requested
- **THEN** diagnostics SHALL include the latest request capability, filter status, decision kind, normalized reasons, provider call status, memory freshness, persistence status, summarizer enqueue status, and timestamp
- **AND** diagnostics SHALL NOT expose full page text, raw memory payloads, provider tokens, or pairing tokens.

#### Scenario: SQLite store state is reported
- **GIVEN** the Local Memory Store is configured
- **WHEN** health or diagnostics are requested
- **THEN** the Runtime SHALL report SQLite availability, schema version, migration status, persistence mode, FTS availability when known, summarizer backlog, last summarizer run, and last summarizer error when present
- **AND** it SHALL NOT expose raw event bodies or unsanitized profile summaries.

#### Scenario: Provider skip is visible
- **GIVEN** runtime decision policy returns without calling a provider
- **WHEN** diagnostics are requested
- **THEN** diagnostics SHALL show that provider dispatch was skipped by runtime decision policy
- **AND** diagnostics SHALL include the structured decision reason without requiring free-form text parsing.
