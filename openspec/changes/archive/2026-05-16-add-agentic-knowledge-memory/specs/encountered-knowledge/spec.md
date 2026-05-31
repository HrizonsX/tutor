## ADDED Requirements

### Requirement: Identify Semantic Key Knowledge Objects
The system MUST identify knowledge objects that are important for understanding the current webpage semantics, including but not limited to people, places, organizations, works, historical events, theories, cultural references, technology terms, and domain-specific concepts.

#### Scenario: Identify non-technical key object
- **GIVEN** the current reading fragment depends on a historical reference, film title, geographical term, or cultural allusion
- **WHEN** the system analyzes the fragment
- **THEN** the system MUST include that object as a knowledge object candidate.

#### Scenario: Ignore incidental object mentions
- **GIVEN** a named object appears in the fragment but is not important to understanding the current sentence or paragraph
- **WHEN** the system ranks knowledge object candidates
- **THEN** the system MUST lower the priority of the incidental object.

#### Scenario: Preserve technical concept support
- **GIVEN** the current fragment contains a technical term that is important for comprehension
- **WHEN** the system identifies knowledge object candidates
- **THEN** the system MUST keep the technical term eligible as a knowledge object.

### Requirement: Normalize Knowledge Object Identity
The system MUST normalize aliases and surface forms for knowledge objects while preserving the observed text that appeared in the webpage.

#### Scenario: Group aliases for same object
- **GIVEN** the same object appears through alternate names, abbreviations, translated names, or common aliases
- **WHEN** the system stores or retrieves knowledge memory
- **THEN** the system MUST map those forms to a stable canonical object where confidence is sufficient.

#### Scenario: Preserve uncertain alias evidence
- **GIVEN** the system is not confident that two names refer to the same object
- **WHEN** the agent prepares a memory update
- **THEN** the system MUST preserve the candidate alias evidence without merging the objects as certain.

### Requirement: Maintain Encountered Knowledge Memory
The system MUST maintain event-first memory for encountered knowledge objects, including first seen time, recent encounters, explanation history, feedback events, related objects, and evidence used by agentic summaries.

#### Scenario: Record first encounter
- **GIVEN** a knowledge object is detected for the first time
- **WHEN** the system stores the encounter
- **THEN** the system MUST record the canonical object, observed alias, knowledge type, timestamp, and minimal context metadata.

#### Scenario: Record repeated encounter
- **GIVEN** a knowledge object has been seen before
- **WHEN** the user encounters the object again in a new fragment
- **THEN** the system MUST record the new encounter without treating the user as having mastered the object.

#### Scenario: Link related objects
- **GIVEN** an explanation or retrieval packet uses a relationship between two knowledge objects
- **WHEN** the system records the explanation or retrieval result
- **THEN** the system MUST record the relationship with evidence and uncertainty.

### Requirement: Retrieve Agentic Knowledge Context
Before generating or regenerating an explanation, the system MUST retrieve a structured knowledge context packet containing object identity, prior explanations, user feedback, related objects, profile hints, cooldowns, and uncertainty.

#### Scenario: Retrieve context for unseen object
- **GIVEN** the current knowledge object has not been explained before
- **WHEN** the system prepares a candidate explanation
- **THEN** the retrieval packet MUST state that no prior explanation exists and include relevant encounter evidence.

#### Scenario: Retrieve context for repeated object
- **GIVEN** the current knowledge object was previously explained or regenerated
- **WHEN** the system prepares another explanation
- **THEN** the retrieval packet MUST include prior explanation versions and feedback outcomes to avoid simple repetition.

#### Scenario: Retrieve related prior knowledge
- **GIVEN** the current object is related to objects the user recently encountered
- **WHEN** the system prepares the retrieval packet
- **THEN** the packet MUST include the related objects and the reason they are relevant.

### Requirement: Route Fact-Sensitive Knowledge
The system MUST classify whether a knowledge object requires source verification or conservative handling before explanation.

#### Scenario: Stable knowledge object
- **GIVEN** the target object is stable background knowledge such as a classic work, historical concept, or basic scientific concept
- **WHEN** the system prepares a short explanation
- **THEN** the system MUST allow the LLM composer to generate a conservative explanation from the supplied context.

#### Scenario: Recent or disputed object
- **GIVEN** the target object involves recent events, current company status, living public figures, disputed claims, or high-risk factual details
- **WHEN** the system prepares a short explanation
- **THEN** the system MUST mark the object as fact-sensitive and require source verification or a conservative fallback before display.

#### Scenario: Source verification unavailable
- **GIVEN** a fact-sensitive object requires verification and no verification source is available
- **WHEN** the system decides whether to display an explanation
- **THEN** the system MUST either avoid displaying the explanation or clearly constrain it to non-specific background context.
