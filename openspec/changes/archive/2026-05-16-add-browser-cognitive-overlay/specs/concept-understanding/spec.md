## ADDED Requirements

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
The system MUST generate a short proactive explanation when intervention is selected.

#### Scenario: Generate short explanation after retrieval
- **GIVEN** the system infers likely confusion
- **AND** relevant learning context has been retrieved
- **WHEN** the system generates a micro explanation
- **THEN** the explanation MUST be brief, intuitive, related to the current context, and avoid unnecessary new terminology.

#### Scenario: Bridge to prior knowledge
- **GIVEN** the current concept is related to a concept the user recently encountered
- **WHEN** the system generates a micro explanation
- **THEN** the explanation MUST use the relationship to bridge from prior context when useful.

### Requirement: Generate Expanded Explanation Content
The system MUST generate a more complete explanation when the user expands a micro explanation.

#### Scenario: Include concept meaning and role
- **GIVEN** the user expands a micro explanation
- **WHEN** the system generates expanded content
- **THEN** the explanation MUST explain what the concept means and what role it plays in the current paragraph.

#### Scenario: Include prerequisites and associations
- **GIVEN** prerequisite knowledge or related historical concepts are available
- **WHEN** the system generates expanded content
- **THEN** the explanation MUST include useful prerequisites and relevant links to concepts the user previously encountered.
