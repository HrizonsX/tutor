## ADDED Requirements

### Requirement: Composer Receives Runtime-Summarized Memory Context
Explain and rewrite composer requests SHALL receive summarized memory context prepared by the Local Agent Runtime when local runtime memory is available.

#### Scenario: Explain uses summarized memory
- **GIVEN** the selected target has local learning history
- **WHEN** the gateway invokes the explain provider adapter
- **THEN** the internal Agent request SHALL include sanitized summarized memory context for prior explanations, feedback summaries, profile hints, related objects, cooldowns, target state, evidence ids, and uncertainty
- **AND** it SHALL label that context as user learning state rather than verified world knowledge.

#### Scenario: Rewrite uses explanation preference memory
- **GIVEN** the user requests simpler wording, more context, or a different angle
- **WHEN** the gateway invokes the rewrite provider adapter
- **THEN** the internal Agent request SHALL include runtime-derived explanation preference hints and relevant feedback evidence when available
- **AND** it SHALL preserve previous version and feedback metadata.

### Requirement: Composer Does Not Receive Raw Memory Ledger
The composer boundary SHALL NOT pass unsanitized raw memory events or full page text to provider adapters.

#### Scenario: Raw event evidence exists
- **GIVEN** the Local Memory Store contains raw events for a target
- **WHEN** the composer request is built
- **THEN** the request SHALL include bounded summary fields, counts, timestamps, evidence ids, and sanitized feedback metadata
- **AND** it SHALL NOT include the full raw event ledger.

#### Scenario: Full page text is unavailable
- **GIVEN** stored memory contains only minimal fragment metadata and hashes
- **WHEN** an explanation is generated
- **THEN** the composer SHALL use the current minimal context plus summarized learning state
- **AND** it SHALL NOT require stored full page text.

### Requirement: Composer Handles Degraded Memory Explicitly
The composer boundary SHALL carry degraded or stale memory status into Agent requests without fabricating learning context.

#### Scenario: Summaries are stale
- **GIVEN** raw local memory exists but derived summaries are stale
- **WHEN** the gateway prepares an Agent request
- **THEN** the request constraints or memory packet SHALL indicate stale or degraded memory status
- **AND** it SHALL include only verified available memory fields.

#### Scenario: Memory repository unavailable
- **GIVEN** the Local Memory Store cannot be queried
- **WHEN** the composer boundary prepares an explain or rewrite request
- **THEN** it SHALL include unavailable or degraded memory status
- **AND** it SHALL NOT fabricate prior explanations, profile hints, related objects, or similarity scores.
