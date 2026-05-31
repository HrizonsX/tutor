## ADDED Requirements

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
