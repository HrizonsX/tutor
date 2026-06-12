## ADDED Requirements

### Requirement: Intervention Scoring Sources Runtime Memory Context
The browser content runtime SHALL source learning-memory and profile signals for intervention scoring from the gateway memory repository through the existing background memory channel, instead of scoring with an empty learning context.

#### Scenario: Memory packet informs the scoring pass
- **GIVEN** the gateway memory repository holds derived signals, cooldowns, or profile hints for the active concept
- **WHEN** the content runtime evaluates an intervention for that concept
- **THEN** it SHALL query the memory repository for that concept before scoring
- **AND** the returned derived signals, cooldowns, profile hints, feedback events, prior explanations, and related objects SHALL be passed to intervention scoring.

#### Scenario: Cross-page feedback suppresses repeat prompts
- **GIVEN** the user marked a concept as known on an earlier page or session
- **WHEN** the same concept triggers scoring signals on a new page
- **THEN** the gateway-derived marked-known state SHALL reduce intervention priority according to existing scoring rules without requiring same-page feedback history.

#### Scenario: Prior inaccuracy feedback tightens fact sensitivity
- **GIVEN** the memory repository holds marked-wrong feedback for the active concept
- **WHEN** the content runtime classifies fact sensitivity for a new intervention
- **THEN** the classification SHALL consume the repository feedback events
- **AND** the needs-source classification path SHALL apply per existing classifier rules.

### Requirement: Memory Context Acquisition Is Bounded
Memory-context queries on the scoring path SHALL be bounded in latency, frequency, and storage so the evaluation loop stays responsive regardless of gateway state.

#### Scenario: Per-concept queries are cached
- **WHEN** the same concept is evaluated repeatedly within the configured memory-context TTL
- **THEN** the runtime SHALL issue at most one memory query for that concept per TTL window
- **AND** concurrent evaluations SHALL share one in-flight query.

#### Scenario: Slow gateway cannot stall evaluation
- **GIVEN** a memory query exceeds the configured wait budget
- **WHEN** the evaluation pass is waiting on it
- **THEN** the pass SHALL proceed with the ephemeral learning context
- **AND** the late result MAY settle into the cache for later passes.

#### Scenario: Unavailable gateway enters a failure cooldown
- **GIVEN** a memory query returns unavailable or fails
- **WHEN** subsequent evaluations run within the configured failure cooldown
- **THEN** the runtime SHALL NOT issue further memory queries during the cooldown
- **AND** scoring SHALL proceed with the ephemeral learning context.

#### Scenario: Cache stays bounded
- **WHEN** the number of cached concept contexts exceeds the configured maximum
- **THEN** the runtime SHALL evict the oldest entries so the cache size stays bounded on long sessions.

### Requirement: Memory Context Degrades To Immediate Context
When no memory packet is available, intervention scoring SHALL behave exactly as it does with the ephemeral immediate-context learning state.

#### Scenario: Missing memory channel keeps current behavior
- **GIVEN** the runtime has no memory query channel or the feature is disabled by config
- **WHEN** interventions are scored
- **THEN** scoring SHALL use the ephemeral learning context with locally tracked cooldowns and no derived memory signals.

#### Scenario: Local and gateway cooldowns merge as a union
- **GIVEN** a dismissal is tracked locally in the page session or derived from gateway memory
- **WHEN** the learning context is built from a memory packet
- **THEN** a cooldown reported by either side SHALL remain in effect
- **AND** neither side SHALL clear a cooldown the other reports.
