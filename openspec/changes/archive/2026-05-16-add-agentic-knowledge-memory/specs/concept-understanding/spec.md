## ADDED Requirements

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
