# short-explanation-composer Specification

## Purpose
TBD - created by archiving change add-agentic-knowledge-memory. Update Purpose after archive.
## Requirements
### Requirement: Compose Short LLM Explanations From Structured Context
The system MUST use an external Agent or large language model composer to generate short explanations from structured inputs rather than free-form full-page prompts or local fallback definitions.

#### Scenario: Generate from retrieval packet
- **GIVEN** policy selected a knowledge object for explanation
- **AND** a retrieval packet exists for that object
- **WHEN** the composer is invoked
- **THEN** the composer input MUST include the target object, knowledge type, minimal page context, memory summary, profile hints, explanation goal, and fact-sensitivity marker.

#### Scenario: Keep explanation short
- **GIVEN** the external Agent generates a micro explanation
- **WHEN** the explanation is returned
- **THEN** the explanation MUST be brief, understandable, and directly related to the current webpage context.

#### Scenario: Avoid new jargon
- **GIVEN** the external Agent explains a knowledge object
- **WHEN** it generates the explanation
- **THEN** it MUST avoid introducing unnecessary new terminology unless the term is essential and briefly clarified.

#### Scenario: Provider unavailable
- **GIVEN** no external Agent provider is configured or available
- **WHEN** the composer is invoked
- **THEN** it MUST return a structured unavailable result
- **AND** it MUST NOT synthesize a knowledge explanation locally.

### Requirement: Composer Must Not Own Intervention Decision
The LLM composer MUST NOT decide whether to display an explanation, which object to prioritize, or how to update user memory.

#### Scenario: Policy selects target before generation
- **GIVEN** multiple candidate knowledge objects exist
- **WHEN** the composer is invoked
- **THEN** the composer MUST receive exactly the selected target object or an explicit small set selected by policy.

#### Scenario: Composer output is not a policy decision
- **GIVEN** the composer returns an explanation
- **WHEN** the system decides whether to render it
- **THEN** the final display decision MUST remain with the overlay policy layer.

#### Scenario: Memory update remains event-based
- **GIVEN** the composer produces explanation text
- **WHEN** memory is updated
- **THEN** the system MUST record explanation events and user responses rather than treating composer text as a user profile fact.

### Requirement: Regenerate Explanation With Feedback
The system MUST support regenerating explanations through the external Agent based on explicit user feedback, previous explanation content, target style, and reading profile hints.

#### Scenario: Regenerate from different angle
- **GIVEN** the user clicks a regenerate or different wording control
- **WHEN** the composer is invoked again
- **THEN** the composer input MUST include the previous explanation, feedback event, target object, minimal context, and requested rewrite style.

#### Scenario: Simpler explanation requested
- **GIVEN** the user requests a simpler explanation
- **WHEN** the external Agent regenerates the explanation
- **THEN** the regenerated explanation MUST use more basic language than the previous version.

#### Scenario: More background requested
- **GIVEN** the user requests more background
- **WHEN** the external Agent regenerates or expands the explanation
- **THEN** the generated content MUST explain the object's background or role while staying tied to the current context.

#### Scenario: Regeneration provider unavailable
- **GIVEN** the user requests regeneration
- **AND** no external Agent provider is configured or available
- **WHEN** the request is processed
- **THEN** the system MUST return a structured unavailable result
- **AND** it MUST NOT replace the existing explanation with local fallback text.

### Requirement: Track Explanation Versions
The system MUST record generated and regenerated explanation versions with enough metadata to support feedback learning and repetition control.

#### Scenario: Record initial explanation version
- **GIVEN** an explanation is shown
- **WHEN** the event is recorded
- **THEN** the system MUST store an explanation version identifier, target object, style, timestamp, and minimal prompt metadata.

#### Scenario: Record regenerated version
- **GIVEN** an explanation is regenerated
- **WHEN** the regenerated explanation is shown
- **THEN** the system MUST link the new version to the previous version and the triggering feedback event.

#### Scenario: Learn from accepted version
- **GIVEN** the user accepts or positively responds to a regenerated version
- **WHEN** the profile is updated
- **THEN** the system MUST use that outcome as evidence for future explanation style preference.

### Requirement: Return Structured Agent Explanation Results
The composer boundary SHALL accept and return structured Agent results through the unified Agent protocol rather than treating free-form text as sufficient.

#### Scenario: Agent returns explanation
- **GIVEN** the background service worker receives a successful Agent response
- **WHEN** the composer boundary validates it
- **THEN** the result SHALL include status, capability kind, target identity, micro explanation, ambiguity metadata, rewrite metadata when applicable, fact-sensitivity metadata, provider metadata, and explanation version metadata.

#### Scenario: Agent identifies ambiguity
- **GIVEN** the selected text could refer to multiple meanings
- **WHEN** the Agent returns an ambiguous result
- **THEN** the composer boundary SHALL preserve the ambiguity metadata
- **AND** it SHALL NOT choose a meaning by using local hardcoded world knowledge.

#### Scenario: Provider lacks explain or rewrite capability
- **GIVEN** provider health reports that explain or rewrite is unsupported
- **WHEN** the composer boundary receives a request requiring that capability
- **THEN** it SHALL return a structured unavailable result
- **AND** it SHALL NOT generate a local fallback explanation or rewrite.

### Requirement: Forbid Knowledge Fallback Explanations
The composer boundary SHALL NOT generate production knowledge explanations from local fallback templates or hardcoded concept definitions.

#### Scenario: No model client or provider available
- **GIVEN** no Agent provider is configured or reachable
- **WHEN** a short explanation is requested
- **THEN** the composer boundary SHALL return a structured unavailable result
- **AND** it SHALL NOT return local fallback explanation text.

#### Scenario: Fixture data exists
- **GIVEN** local fixture definitions exist for tests or development demos
- **WHEN** production explanation generation runs
- **THEN** those fixtures MUST NOT be used to create user-facing knowledge explanations.

### Requirement: Composer Uses Unified Agent Capability Kinds
The composer boundary SHALL use explicit Agent capability kinds for micro explanation, expanded explanation, regeneration, and rewrite.

#### Scenario: Micro explanation requested
- **WHEN** local policy requests a proactive micro explanation
- **THEN** the composer boundary SHALL send or validate an Agent request with an explicit explain capability kind and micro goal.

#### Scenario: Regeneration requested
- **GIVEN** the user requests simpler wording, more context, or a different angle
- **WHEN** the composer boundary prepares the request
- **THEN** it SHALL use the unified rewrite or explain capability kind according to provider capabilities
- **AND** it SHALL include previous version metadata and feedback event metadata.

### Requirement: Composer Receives Memory Packet From Repository Boundary
The composer boundary SHALL consume memory context prepared through the active memory repository boundary.

#### Scenario: Memory packet available
- **GIVEN** the active memory repository returns a sanitized memory packet
- **WHEN** the composer boundary invokes the Agent
- **THEN** it SHALL include the packet as learning state and history
- **AND** it SHALL label prior explanations as explanation history rather than verified world knowledge.

#### Scenario: Memory packet unavailable
- **GIVEN** memory repository context is unavailable or degraded
- **WHEN** the composer boundary invokes the Agent
- **THEN** it SHALL include the degraded-memory status in request constraints
- **AND** it SHALL NOT fabricate prior learning context.

### Requirement: Validate Structured Provider JSON Explain Results
The composer boundary SHALL accept adapter-backed explain results only after provider JSON has been parsed, schema-validated, and normalized into the stable explanation result shape.

#### Scenario: Structured provider JSON becomes explanation version
- **GIVEN** an adapter returns an available explain result containing validated `explanation`, `summary`, `confidence`, `terms`, `actions`, and `versionMetadata`
- **WHEN** the composer boundary validates the result
- **THEN** it SHALL expose the explanation through the current `text` and `microExplanation` fields
- **AND** it SHALL preserve structured fields that are part of the stable Explanation Result
- **AND** it SHALL create explanation version metadata from the normalized provider metadata.

#### Scenario: Invalid provider JSON is rejected
- **GIVEN** the adapter returns reason `provider_json_parse_failed`
- **WHEN** the composer boundary handles the result
- **THEN** it SHALL return a structured unavailable or invalid result
- **AND** it SHALL NOT create or persist an explanation version.

#### Scenario: Schema-invalid provider JSON is rejected
- **GIVEN** the adapter returns reason `provider_schema_invalid`
- **WHEN** the composer boundary handles the result
- **THEN** it SHALL return a structured unavailable or invalid result
- **AND** it SHALL NOT replace an existing explanation with provider output.

### Requirement: Preserve External-Only Knowledge Generation
Structured JSON support SHALL NOT introduce a local concept library or local semantic explanation fallback.

#### Scenario: Provider unavailable during explain
- **GIVEN** no external provider, local gateway, or remote Agent is configured or available for explanation generation
- **WHEN** a short explanation is requested
- **THEN** the composer boundary SHALL return a structured unavailable result
- **AND** it SHALL NOT synthesize term explanations from local hardcoded knowledge.

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

### Requirement: Consume Bounded Memory Bridges
The composer boundary SHALL accept bounded memory bridges prepared by Gateway / Local Agent Runtime.

#### Scenario: Composer receives bridge constraints
- **WHEN** a provider request includes memory bridges
- **THEN** the request SHALL include relation type, related concept, confidence, source role, caution, relation depth, and maximum bridge count.

#### Scenario: Composer does not receive unbounded graph
- **WHEN** a concept has more historical relations than the Overlay policy limit
- **THEN** the composer request SHALL include only the selected bounded bridge set.

### Requirement: Keep Current Explanation Primary
The composer SHALL use memory only to improve the current explanation and SHALL NOT let historical memory override the current target.

#### Scenario: Current target remains primary
- **WHEN** memory bridges are present
- **THEN** the generated explanation SHALL still explain the current target in the current context first.

#### Scenario: Unrelated memory is excluded
- **WHEN** memory context has no active relation or session continuity to the current target
- **THEN** the composer request SHALL NOT include it as a bridge.

### Requirement: Preserve Non-Authoritative Memory Boundary
The composer SHALL treat memory bridges as local learning context rather than verified factual source material.

#### Scenario: Memory bridge is cautioned
- **WHEN** a memory bridge is included in a composer request
- **THEN** it SHALL carry a caution that the bridge is not a fact source.

#### Scenario: Fact-sensitive explanation does not rely on memory
- **WHEN** the current target or bridge concept is fact-sensitive
- **THEN** the composer SHALL rely on provider capability or source-aware flow for factual accuracy rather than memory bridge content.
