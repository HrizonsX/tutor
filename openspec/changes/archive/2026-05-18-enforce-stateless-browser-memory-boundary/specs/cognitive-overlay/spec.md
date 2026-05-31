## ADDED Requirements

### Requirement: Keep Overlay State Ephemeral
The overlay SHALL keep only current-page UI state and SHALL NOT use overlay state as learning memory across refresh, navigation, or browser restart.

#### Scenario: Overlay tracks current prompt
- **GIVEN** an explanation prompt is visible
- **WHEN** the overlay stores the current prompt, loading state, error state, selected text, pending request state, or temporary result for rendering
- **THEN** that state SHALL be limited to the current page interaction.

#### Scenario: Overlay state is not memory
- **WHEN** the page refreshes, navigates, or the browser restarts
- **THEN** the overlay SHALL NOT restore profile hints, explanation history, feedback history, concept familiarity, preference summaries, or memory-derived cooldowns from browser-local state.

## MODIFIED Requirements

### Requirement: Avoid Repeated Interruptions
The system MUST prevent repeated prompts for the same current-page interaction using ephemeral browser policy and runtime-provided memory signals, without browser-local memory cache.

#### Scenario: Do not prompt immediately after dismissal
- **GIVEN** the user just closed a prompt in the current page interaction
- **WHEN** similar trigger signals appear within the ephemeral cooldown period
- **THEN** the system MUST NOT immediately show another prompt.

#### Scenario: Do not repeat recently explained concepts
- **GIVEN** Gateway / Local Agent Runtime reports that the same concept was recently explained
- **WHEN** the user has no strong current-page confusion behavior
- **THEN** the system MUST NOT repeat the explanation.

#### Scenario: Do not repeatedly prompt the same paragraph
- **GIVEN** a paragraph recently triggered an overlay in the current page interaction
- **WHEN** the user remains near the same paragraph
- **THEN** the system MUST apply paragraph-level cooldown before showing another prompt.

#### Scenario: Reduce prompts for possibly familiar concepts
- **GIVEN** Gateway / Local Agent Runtime reports a concept as possibly familiar or recently seen
- **WHEN** the system considers a basic explanation
- **THEN** the system MUST reduce the priority of basic repeated explanations.

### Requirement: Learn From User Feedback
The system MUST report user reactions to Gateway / Local Agent Runtime as future inference and memory signals.

#### Scenario: Expansion informs future help
- **GIVEN** the user expands an explanation
- **WHEN** the system handles the expansion
- **THEN** the browser extension MUST report an expansion event to Gateway / Local Agent Runtime
- **AND** it SHALL NOT store a browser-local derived memory signal.

#### Scenario: Immediate dismissal reduces interruption priority
- **GIVEN** the user immediately closes a prompt
- **WHEN** the system handles the dismissal
- **THEN** the browser extension MAY reduce prompts in the current page interaction for a cooldown period
- **AND** it MUST report the dismissal event to Gateway / Local Agent Runtime for durable memory.

#### Scenario: Repeated concept triggers inform weakness
- **GIVEN** the same concept repeatedly triggers overlays or confusion signals
- **WHEN** the system reports those events
- **THEN** Gateway / Local Agent Runtime MUST record repeated events that can increase the concept's possibly weak signal.

### Requirement: Provide Regenerate Explanation Control
The overlay MUST provide a control for regenerating an explanation with a different wording, simpler style, or more context.

#### Scenario: Regenerate explanation
- **GIVEN** the user clicks the regenerate control
- **WHEN** the system requests a new explanation
- **THEN** the request MUST include the prior explanation version for the current prompt, target object, current feedback reason, requested style, and immediate current context
- **AND** it SHALL NOT include a browser-computed retrieval packet or browser-local feedback history.

#### Scenario: Replace displayed version
- **GIVEN** a regenerated explanation is returned
- **WHEN** the overlay displays it
- **THEN** the overlay MUST link it to the previous version for the current feedback event
- **AND** durable version history SHALL be owned by Gateway / Local Agent Runtime.

#### Scenario: Regeneration unavailable
- **GIVEN** regeneration cannot be completed because model access, verification, memory capability, or runtime context is unavailable
- **WHEN** the user requests regeneration
- **THEN** the overlay MUST fail quietly with a non-blocking state
- **AND** it MUST preserve the original explanation.

### Requirement: Allow Object And Category Muting
The overlay MUST allow users to request suppression of future proactive prompts for a specific object or category.

#### Scenario: Mute object
- **GIVEN** the user chooses not to see prompts for a specific object
- **WHEN** the overlay records the action
- **THEN** the browser extension MUST report the mute event to Gateway / Local Agent Runtime
- **AND** future durable suppression SHALL come from runtime profile or policy state.

#### Scenario: Mute category
- **GIVEN** the user chooses not to see prompts for a category of knowledge objects
- **WHEN** the overlay records the action
- **THEN** the browser extension MUST report the mute event to Gateway / Local Agent Runtime
- **AND** future durable suppression SHALL come from runtime profile or policy state.

#### Scenario: Mute is reversible
- **GIVEN** the user has muted an object or category
- **WHEN** the user clears that preference
- **THEN** the browser extension MUST report the clear event to Gateway / Local Agent Runtime
- **AND** future policy MUST stop applying the mute signal after runtime profile state reflects the clear event.

### Requirement: Handle Provider Unavailability Without Blocking Reading
The overlay SHALL handle provider or runtime unavailable states without interrupting reading or replacing existing explanations with fabricated content.

#### Scenario: Proactive provider unavailable
- **GIVEN** local policy selected a candidate for proactive explanation
- **AND** the background service worker returns provider, gateway, runtime, or memory capability unavailable
- **WHEN** the overlay receives the result
- **THEN** it SHALL show no proactive knowledge card.

#### Scenario: Explicit regeneration provider unavailable
- **GIVEN** the user explicitly requests regeneration
- **AND** the background service worker returns provider, gateway, runtime, or memory capability unavailable
- **WHEN** the overlay handles the response
- **THEN** it SHALL show a compact non-blocking unavailable state
- **AND** it SHALL preserve the previous explanation text and version.

#### Scenario: No local memory fallback copy
- **GIVEN** the runtime is unavailable
- **WHEN** the overlay handles explicit or proactive explanation flows
- **THEN** it SHALL NOT display explanations generated from browser-local memory, prior browser explanation history, or cached profile hints.
