# concept-understanding Specification

## Purpose
TBD - created by archiving change add-browser-cognitive-overlay. Update Purpose after archive.
## Requirements
### Requirement: Extract Key Concepts
The system MUST identify key concepts from the current reading context that are likely to affect user understanding.

#### Scenario: Extract important concepts from technical paragraphs
- **GIVEN** the current paragraph contains multiple technical terms
- **WHEN** the system analyzes the paragraph
- **THEN** the system MUST extract the concepts most likely to affect comprehension.

#### Scenario: Prioritize selected terms
- **GIVEN** the user selects a technical term in the current paragraph
- **WHEN** the system extracts key concepts
- **THEN** the selected term MUST be prioritized as a concept candidate.

#### Scenario: Include domain-specific concept types
- **GIVEN** the current content includes algorithm names, mathematical concepts, abbreviations, model structures, framework names, method names, or paper-specific terms
- **WHEN** the system extracts key concepts
- **THEN** the system MUST consider those domain-specific terms as concept candidates.

### Requirement: Extract Precise Contextual Concepts
The system MUST extract specific, context-bound, explainable concepts rather than over-generic words.

#### Scenario: Prefer policy gradient over policy
- **GIVEN** the current content contains "policy gradient"
- **WHEN** the system extracts concepts
- **THEN** the system MUST prioritize "policy gradient"
- **AND** the system MUST NOT only extract "policy".

#### Scenario: Prefer reward model over generic parts
- **GIVEN** the current content contains "reward model"
- **WHEN** the system extracts concepts
- **THEN** the system MUST prioritize "reward model"
- **AND** the system MUST NOT only extract "reward" or "model".

#### Scenario: Prefer KV cache over cache
- **GIVEN** the current content contains "KV cache"
- **WHEN** the system extracts concepts
- **THEN** the system MUST extract "KV cache"
- **AND** the system MUST NOT only extract "cache".

#### Scenario: Prefer concrete terms over generic words
- **GIVEN** the current content contains both generic words and specific domain terms
- **WHEN** the system chooses an explanation target
- **THEN** the system MUST prioritize the more specific and context-constrained domain term.

#### Scenario: Normalize aliases to a canonical concept
- **GIVEN** a concept appears as "KL div", "Kullback-Leibler divergence", or "KL divergence"
- **WHEN** the system writes or retrieves learning memory
- **THEN** the system MUST normalize the variants to the same canonical concept where possible.

#### Scenario: Normalize related PPO clipping terms
- **GIVEN** a concept appears as "PPO clip", "clipped objective", or "PPO clipping"
- **WHEN** the system writes or retrieves learning memory
- **THEN** the system MUST group the variants into the same concept cluster where possible.

### Requirement: Retrieve Relevant Learning Context
The system MUST retrieve relevant learning memory before generating an explanation.

#### Scenario: Avoid repeating prior explanations
- **GIVEN** the current concept has been explained before
- **WHEN** the system prepares a new explanation
- **THEN** the system MUST reference prior explanation events to avoid simple repetition.

#### Scenario: Connect to recent learning topics
- **GIVEN** the current concept is related to a recent learning topic
- **WHEN** the system prepares an explanation
- **THEN** the system MUST attempt to connect the current concept to the recent topic.

#### Scenario: Adapt for possibly weak concepts
- **GIVEN** the current concept is marked as possibly weak in learning memory
- **WHEN** the system prepares an explanation
- **THEN** the system MUST use a more basic and intuitive explanation style.

### Requirement: Generate Micro Explanation
The system MUST obtain a short proactive explanation from the external Agent when intervention is selected and provider access is available.

#### Scenario: Generate short explanation after retrieval
- **GIVEN** the system infers likely confusion
- **AND** relevant learning context has been retrieved
- **WHEN** the system requests a micro explanation
- **THEN** the request MUST go through the background service worker to the external Agent
- **AND** the returned explanation MUST be brief, intuitive, related to the current context, and avoid unnecessary new terminology.

#### Scenario: Bridge to prior knowledge
- **GIVEN** the current concept is related to a concept the user recently encountered
- **WHEN** the system requests a micro explanation
- **THEN** the retrieval packet MUST include the relationship as local learning context
- **AND** the external Agent MAY use that relationship to bridge from prior context when useful.

#### Scenario: Provider unavailable for micro explanation
- **GIVEN** the local strategy selects a candidate for proactive explanation
- **AND** no external Agent provider is configured or available
- **WHEN** the system reaches explanation generation
- **THEN** the system MUST NOT generate a knowledge explanation from a local hardcoded concept library or fallback template
- **AND** the proactive overlay MUST remain silent.

### Requirement: Generate Expanded Explanation Content
The system MUST obtain fuller explanation or rewrite content from the external Agent when the user expands or regenerates an explanation and provider access is available.

#### Scenario: Include concept meaning and role
- **GIVEN** the user expands a micro explanation
- **WHEN** the system requests expanded content
- **THEN** the request MUST include the target, current explanation version, minimal context, retrieval packet summary, and requested goal
- **AND** the external Agent response MUST explain what the concept means and what role it plays in the current paragraph.

#### Scenario: Include prerequisites and associations
- **GIVEN** prerequisite knowledge or related historical concepts are available in local learning state
- **WHEN** the system requests expanded content
- **THEN** the retrieval packet MUST include those local learning-state hints
- **AND** the external Agent MAY use them to include useful prerequisites or links to concepts the user previously encountered.

#### Scenario: Provider unavailable for expansion
- **GIVEN** the user expands or regenerates an explanation
- **AND** no external Agent provider is configured or available
- **WHEN** expanded content cannot be generated
- **THEN** the system MUST fail quietly with a non-blocking unavailable state
- **AND** it MUST preserve the original explanation version if one exists.

### Requirement: Identify General Knowledge Objects
The system MUST identify general knowledge objects that are important to understanding the current reading context, extending concept extraction beyond technical terms.

#### Scenario: Detect cultural or historical object
- **GIVEN** the current paragraph relies on a cultural reference, historical event, public figure, place, organization, or work title
- **WHEN** the system extracts explainable objects
- **THEN** it MUST include the object as an explanation candidate when it is semantically important.

#### Scenario: Detect ordinary word with contextual meaning
- **GIVEN** an ordinary-looking word has a special meaning in the current article or domain
- **WHEN** the system extracts explainable objects
- **THEN** it MUST consider the contextual meaning rather than only the surface word.

#### Scenario: Preserve phrase-level precision
- **GIVEN** the current paragraph contains a multi-word knowledge object
- **WHEN** the system extracts explainable objects
- **THEN** it MUST prefer the complete object phrase over isolated generic words.

### Requirement: Retrieve Agentic Context Before Explanation
The system MUST retrieve agentic knowledge context before generating or regenerating explanations for general knowledge objects.

#### Scenario: Retrieve object memory
- **GIVEN** an explainable object is selected
- **WHEN** the system prepares an explanation
- **THEN** it MUST retrieve object memory, prior explanation versions, user feedback, profile hints, related objects, and cooldowns before composer invocation.

#### Scenario: Avoid repeated basic explanation
- **GIVEN** the user has already received and accepted a basic explanation for an object
- **WHEN** the object appears again
- **THEN** the retrieved context MUST instruct the explanation strategy to avoid repeating the same basic explanation.

#### Scenario: Bridge to recent object
- **GIVEN** the selected object relates to a recently encountered object in memory
- **WHEN** the system prepares an explanation
- **THEN** the retrieved context MUST include the bridge relationship for possible use by the composer.

### Requirement: Prepare External Agent Explanation Request
The system SHALL prepare privacy-trimmed explanation request inputs for the external Agent after local policy selects a target, without using local world-knowledge definitions to answer the request.

#### Scenario: User selects a term
- **GIVEN** the user selects a short term in a technical or knowledge-bearing article
- **WHEN** local policy judges the selection worth explaining
- **THEN** the system SHALL pass the selected text, minimal surrounding context, retrieval packet summary, user memory hints, and request goal to the background service worker for Agent explanation.

#### Scenario: Local candidate unknown to fixtures
- **GIVEN** the selected term is not present in any local test fixture or alias list
- **WHEN** the term is precise enough to explain
- **THEN** the system SHALL still package it as an Agent explanation target
- **AND** it SHALL NOT generate a local generic definition for the unknown term.

### Requirement: Enter New Concepts As Independent Memory Units
The system SHALL create or retrieve a canonical concept unit for a newly selected or detected concept before attempting historical linkage.

#### Scenario: New concept does not require relation
- **WHEN** a current concept has no eligible historical connection
- **THEN** the system SHALL still record the concept as a canonical memory unit without inventing a relation.

#### Scenario: Alias match reuses concept
- **WHEN** a new surface form normalizes to an existing canonical concept
- **THEN** the system SHALL use the existing concept memory rather than creating a duplicate concept.

### Requirement: Build Narrow Historical Candidate Pools
The system SHALL build a bounded candidate pool before asking whether a new concept relates to historical memory.

#### Scenario: Candidate pool uses local evidence
- **WHEN** a new concept is evaluated for possible historical linkage
- **THEN** the candidate pool SHALL be limited to current context concepts, current session recent concepts, provider structured terms, existing one-hop relations, alias matches, or concepts from selected daily memory blocks.

#### Scenario: Full memory scan is forbidden
- **WHEN** relation discovery runs for a new concept
- **THEN** it SHALL NOT compare the concept against every stored historical concept as an unbounded all-pairs operation.

### Requirement: Treat Similarity As Candidate Signal Only
The system SHALL NOT convert semantic similarity or co-occurrence alone into an active typed relation.

#### Scenario: Similarity does not establish relation
- **WHEN** a historical concept is selected only because it is semantically similar to the current concept
- **THEN** the system SHALL treat it at most as a relation candidate and SHALL NOT make it active without stronger evidence.

#### Scenario: Co-occurrence does not establish strong relation
- **WHEN** two concepts appear in the same page, day, or summary without explicit relationship evidence
- **THEN** the system SHALL NOT create an active strong relation between them.

### Requirement: Validate Explicit Selected Concepts
The system SHALL validate finalized selected text before prioritizing it as an explanation target or canonical concept candidate.

#### Scenario: Reject punctuation-only selection
- **GIVEN** the user finalizes a selection that contains only punctuation, whitespace, or symbols
- **WHEN** the system validates the selected concept
- **THEN** it SHALL reject the selection with a stable diagnostic reason
- **AND** it SHALL NOT prioritize the selection as an explanation target.

#### Scenario: Reject partial Latin word selection
- **GIVEN** the user finalizes a selection whose start or end falls inside a larger Latin letter or digit sequence
- **WHEN** surrounding selection context is available
- **THEN** the system SHALL reject the selection as a partial word
- **AND** it SHALL preserve the reason for diagnostics.

#### Scenario: Reject under-supported short CJK fragment
- **GIVEN** the user finalizes a one-character CJK selection that is not supported by an existing alias, candidate, or configured exception
- **WHEN** the system validates the selected concept
- **THEN** it SHALL reject the selection as too short to be a reliable concept.

#### Scenario: Accept valid short concept selection
- **GIVEN** the user finalizes a short selected phrase that contains a valid concept, knowledge object, technical abbreviation, or supported alias
- **WHEN** the phrase passes noise, boundary, size, and context validation
- **THEN** the system SHALL keep it eligible for concept prioritization and explanation request preparation.

#### Scenario: Keep unknown precise concepts explainable
- **GIVEN** a finalized selected term is not present in local fixtures or alias lists
- **WHEN** the term passes selected-concept validation
- **THEN** the system SHALL keep the term eligible as an external Agent explanation target.
