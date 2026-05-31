## ADDED Requirements

### Requirement: Show Low-Interruption Overlay
The system MUST display proactive explanation prompts in a low-interruption overlay that does not block reading.

#### Scenario: Show prompt without blocking reading
- **GIVEN** the system decides to intervene
- **WHEN** the overlay is displayed on the page
- **THEN** the overlay MUST NOT obscure the main reading content
- **AND** the overlay MUST NOT prevent the user from continuing to read.

#### Scenario: Allow prompt dismissal
- **GIVEN** an overlay prompt is visible
- **WHEN** the user chooses to close it
- **THEN** the system MUST dismiss the prompt and record the dismissal event.

### Requirement: Provide Expandable Explanation
The system MUST allow the user to expand a micro explanation into a fuller explanation.

#### Scenario: Expand from micro explanation
- **GIVEN** the user sees a micro explanation
- **WHEN** the user expands it
- **THEN** the system MUST show a more complete explanation without requiring the user to switch to a chat window.

#### Scenario: Record expansion
- **GIVEN** the user expands an explanation
- **WHEN** the expanded explanation is shown
- **THEN** the system MUST record the expansion event for learning memory.

### Requirement: Avoid Repeated Interruptions
The system MUST prevent repeated prompts for the same concept, same paragraph, or recently dismissed prompt context.

#### Scenario: Do not prompt immediately after dismissal
- **GIVEN** the user just closed a prompt
- **WHEN** similar trigger signals appear within the cooldown period
- **THEN** the system MUST NOT immediately show another prompt.

#### Scenario: Do not repeat recently explained concepts
- **GIVEN** the same concept was recently explained
- **WHEN** the user has no strong confusion behavior
- **THEN** the system MUST NOT repeat the explanation.

#### Scenario: Do not repeatedly prompt the same paragraph
- **GIVEN** a paragraph recently triggered an overlay
- **WHEN** the user remains near the same paragraph
- **THEN** the system MUST apply paragraph-level cooldown before showing another prompt.

#### Scenario: Reduce prompts for possibly familiar concepts
- **GIVEN** learning memory marks a concept as possibly familiar or recently seen
- **WHEN** the system considers a basic explanation
- **THEN** the system MUST reduce the priority of basic repeated explanations.

### Requirement: Learn From User Feedback
The system MUST use user reactions to overlays as future inference and memory signals.

#### Scenario: Expansion informs future help
- **GIVEN** the user expands an explanation
- **WHEN** the system updates memory and inference state
- **THEN** the system MUST record that the concept may need more support in similar contexts.

#### Scenario: Immediate dismissal reduces interruption priority
- **GIVEN** the user immediately closes a prompt
- **WHEN** the system updates memory and inference state
- **THEN** the system MUST reduce the priority of similar prompts for a cooldown period.

#### Scenario: Repeated concept triggers inform weakness
- **GIVEN** the same concept repeatedly triggers overlays or confusion signals
- **WHEN** the system updates memory and inference state
- **THEN** the system MUST record repeated events that can increase the concept's possibly weak signal.

### Requirement: Must Not Behave Like A Chat Sidebar
The system MUST NOT make a chat sidebar or manual ask flow the primary interaction model.

#### Scenario: Provide help without an active user question
- **GIVEN** the user is reading a web page
- **WHEN** the user has not actively asked a question
- **THEN** the system MUST still be able to provide a proactive micro explanation at an appropriate time.

#### Scenario: Use overlay instead of chat window for primary help
- **GIVEN** the user needs help with the current reading context
- **WHEN** the system provides help
- **THEN** the help MUST appear as an inline overlay experience rather than requiring the user to switch to a chat window.

### Requirement: Must Not Act As An Autonomous Browser Agent
The system MUST NOT browse, click, search, scroll, fill forms, or execute page actions for the user.

#### Scenario: Explain without operating the page
- **GIVEN** the system detects possible confusion
- **WHEN** the system intervenes
- **THEN** the system MUST only explain or prompt
- **AND** the system MUST NOT automatically operate the page.

#### Scenario: Avoid automatic external search
- **GIVEN** the system needs to explain a concept
- **WHEN** it prepares the explanation
- **THEN** the system MUST NOT automatically search the web or navigate away from the current page as part of the user-facing intervention.
