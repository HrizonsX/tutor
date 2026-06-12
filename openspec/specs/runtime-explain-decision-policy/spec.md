# runtime-explain-decision-policy Specification

## Purpose
TBD - created by archiving change local-memory-first-agent-runtime. Update Purpose after archive.
## Requirements
### Requirement: Runtime Filters Explain Inputs
The Local Agent Runtime SHALL validate and filter explain and rewrite inputs before memory retrieval or provider invocation.

#### Scenario: Invalid target is rejected before memory lookup
- **GIVEN** a browser-originated explain request has an empty target, a target below the minimum useful length, a target above the configured maximum length, or a target classified as noise
- **WHEN** the Runtime receives the request
- **THEN** it SHALL return a structured decision result with reason `reject_invalid_input` or `reject_noise`
- **AND** it SHALL NOT query long-term memory or call an external provider for that request.

#### Scenario: Duplicate trigger is suppressed before provider call
- **GIVEN** an equivalent target and context was recently handled inside the configured duplicate-trigger window
- **WHEN** the Runtime receives another explain request for that target and context
- **THEN** it SHALL return a structured decision result with a duplicate or cooldown reason
- **AND** it SHALL NOT call an external provider.

### Requirement: Runtime Builds Filtered Context
The Local Agent Runtime SHALL normalize the current page context into a bounded, privacy-trimmed context packet before decision policy runs.

#### Scenario: Context filter trims browser input
- **GIVEN** a browser-originated request includes selected text, surrounding fragment text, URL, title, language, and operation metadata
- **WHEN** the Runtime builds the filtered context packet
- **THEN** it SHALL retain only bounded current-interaction fields needed for explanation or rewrite
- **AND** it SHALL NOT retain full page text or browser-provided memory/profile fields.

#### Scenario: Browser memory fields are ignored
- **GIVEN** a browser-originated request contains a memory packet, profile hints, prior explanations, concept familiarity, feedback history, derived summaries, or retrieval summaries
- **WHEN** the Runtime prepares the filtered context packet
- **THEN** it SHALL ignore those browser-provided fields
- **AND** runtime-owned memory SHALL remain the only source of personalization.

### Requirement: Runtime Retrieves Memory Before Decision
The Local Agent Runtime SHALL query the active Local Memory Store before deciding whether an explanation needs provider generation.

#### Scenario: Retrieval packet is assembled
- **GIVEN** a filtered explain request has a valid target
- **WHEN** the Runtime prepares decision inputs
- **THEN** it SHALL query SQLite-backed memory for concept state, prior explanation metadata, feedback summaries, profile summary, related concepts, cooldowns, memory candidates, and retrieval freshness
- **AND** it SHALL assemble a retrieval packet labeled as user learning state rather than authoritative world knowledge.

#### Scenario: Memory query is degraded
- **GIVEN** the Local Memory Store cannot provide fresh summarized memory
- **WHEN** the Runtime prepares decision inputs
- **THEN** it SHALL include a structured degraded memory status in the decision inputs
- **AND** it SHALL NOT fabricate concept familiarity, related concepts, profile preferences, or semantic similarity.

### Requirement: Runtime Decision Policy Gates Provider Calls
The Local Agent Runtime SHALL run decision policy before invoking any external LLM, embedding, or provider adapter for explain and rewrite requests.

#### Scenario: Existing explanation is reused
- **GIVEN** memory contains a suitable existing explanation version for the requested target and current context
- **WHEN** decision policy chooses `return_existing_explanation`
- **THEN** the Runtime SHALL return the existing explanation result with version metadata
- **AND** it SHALL NOT call an external provider.

#### Scenario: Muted target is rejected
- **GIVEN** runtime-owned concept state or profile summary indicates the target or category is muted for proactive explanation
- **WHEN** decision policy evaluates a proactive explain request
- **THEN** the Runtime SHALL return a structured decision result with reason `reject_muted`
- **AND** it SHALL NOT call an external provider.

#### Scenario: Provider is called only by policy
- **GIVEN** input filtering, context filtering, memory retrieval, and decision policy complete
- **WHEN** decision policy chooses `call_provider`
- **THEN** the Runtime SHALL call the configured provider adapter
- **AND** the provider call SHALL receive only filtered current context and sanitized runtime-owned retrieval context.

### Requirement: Runtime Persists Explain Evidence
The Local Agent Runtime SHALL persist explain-path evidence after a valid runtime decision or provider-backed explanation.

#### Scenario: Provider explanation is persisted
- **GIVEN** decision policy chooses `call_provider`
- **AND** the provider adapter returns a valid structured explanation result
- **WHEN** the Runtime finalizes the response
- **THEN** it SHALL write an explanation version, at least one raw memory event, and one or more memory candidates when candidate signals are present
- **AND** those records SHALL reference the request id, target, context summary, provider metadata, and evidence ids available for later summarization.

#### Scenario: Invalid provider output is not persisted as an explanation
- **GIVEN** the provider adapter returns invalid JSON, schema-invalid JSON, or a malformed Agent result
- **WHEN** the Runtime finalizes the response
- **THEN** it SHALL NOT write an explanation version from that output
- **AND** it MAY write a raw failure event that does not update long-term concept state or profile summary.

### Requirement: Summarizer Owns Derived Memory Updates
The Local Agent Runtime SHALL keep long-term derived memory updates out of the synchronous explain request path.

#### Scenario: Explain path enqueues summarization
- **GIVEN** the Runtime writes raw events, explanation versions, or memory candidates during explain or rewrite handling
- **WHEN** those writes complete
- **THEN** it SHALL enqueue or mark summarizer work for affected targets
- **AND** it SHALL return without requiring concept state, profile summary, or retrieval summary updates to complete.

#### Scenario: Long-term memory is updated by summarizer only
- **GIVEN** a raw event or memory candidate suggests a possible user preference, familiarity signal, confusion signal, or explanation quality signal
- **WHEN** the synchronous explain request completes
- **THEN** the Runtime SHALL NOT directly update concept state, profile summary, or retrieval summary from that single signal
- **AND** those derived views SHALL be updated only by summarizer logic using evidence-backed rules or future summarizer providers.
