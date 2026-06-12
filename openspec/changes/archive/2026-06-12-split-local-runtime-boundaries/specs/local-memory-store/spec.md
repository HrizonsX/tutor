## ADDED Requirements

### Requirement: Memory Runtime Mediates Store Access
Gateway and Local Agent Runtime memory operations SHALL access the Local Memory Store through Memory Runtime or an equivalent runtime-owned memory interface.

#### Scenario: Memory event write uses Memory Runtime
- **GIVEN** the gateway receives a valid `/memory/events` request
- **WHEN** Local Agent Runtime records the event
- **THEN** it SHALL write the event through Memory Runtime
- **AND** HTTP gateway code SHALL NOT directly call Local Memory Store persistence functions.

#### Scenario: Memory query uses Memory Runtime
- **GIVEN** the gateway receives a valid `/memory/query`, `/explain`, or `/rewrite` request that needs memory context
- **WHEN** Local Agent Runtime retrieves memory
- **THEN** it SHALL query through Memory Runtime
- **AND** HTTP gateway code SHALL NOT directly assemble memory packets from Local Memory Store internals.

#### Scenario: Memory store implementation remains replaceable
- **GIVEN** Memory Runtime is constructed with the existing SQLite-backed Local Memory Store
- **WHEN** memory health, query, write, summarizer, or relation discovery behavior is requested
- **THEN** Memory Runtime SHALL preserve existing Local Memory Store behavior while hiding store implementation details from the gateway.

### Requirement: Memory Runtime Owns Memory Lifecycle Hooks
Memory Runtime SHALL expose the memory lifecycle hooks needed by Local Agent Runtime without requiring gateway code to know store-specific methods.

#### Scenario: Provider result is persisted
- **GIVEN** Local Agent Runtime receives a valid provider-backed explanation result
- **WHEN** it finalizes the result
- **THEN** it SHALL persist raw events, explanation versions, memory candidates, used memory bridge events, and relation discovery scheduling through Memory Runtime.

#### Scenario: Runtime memory config changes
- **WHEN** runtime configuration hot-applies memory cognitive policy fields
- **THEN** Local Agent Runtime SHALL update Memory Runtime with the effective memory policy
- **AND** gateway HTTP routing SHALL NOT directly call Local Memory Store configuration methods.

#### Scenario: Memory health is requested
- **WHEN** `/health` or diagnostics request memory state
- **THEN** Memory Runtime SHALL provide redacted memory repository, persistence, summarizer, and relation discovery status suitable for gateway health aggregation.
