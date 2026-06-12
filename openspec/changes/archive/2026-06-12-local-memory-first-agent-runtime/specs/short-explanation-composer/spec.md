## ADDED Requirements

### Requirement: Composer Is Invoked Only By Runtime Decision
The explanation composer or provider adapter SHALL be invoked only when Local Agent Runtime decision policy chooses provider-backed generation.

#### Scenario: Decision skips generation
- **GIVEN** runtime decision policy returns an existing explanation, invalid input, muted rejection, duplicate suppression, or degraded unavailable result
- **WHEN** the explain request completes
- **THEN** the composer SHALL NOT be invoked
- **AND** the response SHALL preserve the runtime decision reason.

#### Scenario: Decision requests generation
- **GIVEN** runtime decision policy chooses `call_provider`
- **WHEN** the composer or provider adapter is invoked
- **THEN** it SHALL receive the selected target, filtered current context, sanitized runtime memory packet, requested style, constraints, and provider configuration
- **AND** it SHALL NOT decide whether the explanation should be displayed.

### Requirement: Composer Uses Runtime-Summarized Learning State
The composer SHALL use runtime-summarized memory as learning state and SHALL NOT consume raw memory ledgers or browser memory fields.

#### Scenario: Summarized memory is available
- **GIVEN** the Runtime has assembled a retrieval packet from SQLite-backed memory
- **WHEN** the composer request is prepared
- **THEN** it SHALL include bounded prior explanation metadata, feedback summaries, profile summary hints, concept state, related concepts, cooldowns, evidence ids, and uncertainty
- **AND** it SHALL label prior explanations as explanation history rather than verified definitions.

#### Scenario: Memory is degraded
- **GIVEN** runtime memory retrieval is unavailable or stale
- **WHEN** the composer request is prepared after a `call_provider` decision
- **THEN** it SHALL include structured degraded memory status
- **AND** it SHALL NOT fabricate user preference, familiarity, prior explanation, or related concept context.
