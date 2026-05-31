## ADDED Requirements

### Requirement: Maintain Learning Memory
The system MUST maintain learning memory for concepts, recent topics, repeated triggers, user responses, and concept associations.

#### Scenario: Record explained concepts
- **GIVEN** the system shows an explanation for a new concept
- **WHEN** the explanation is displayed
- **THEN** the system MUST record that an explanation was shown for the concept.

#### Scenario: Track repeated confusion
- **GIVEN** the same concept triggers confusion inference multiple times
- **WHEN** the system updates learning memory
- **THEN** the system MUST record repeated confusion events
- **AND** the system MAY increase the concept's possibly weak signal.

#### Scenario: Track expanded explanations
- **GIVEN** the user expands an explanation
- **WHEN** the system updates learning memory
- **THEN** the system MUST record that the concept needed deeper explanation in that event.

#### Scenario: Track dismissed prompts
- **GIVEN** the user closes an explanation prompt
- **WHEN** the system updates learning memory
- **THEN** the system MUST record a dismissal event for the concept and prompt context.

#### Scenario: Track concept associations
- **GIVEN** the system explains a concept using a relationship to a previously encountered concept
- **WHEN** the system records the explanation event
- **THEN** the system MUST record the association between those concepts.

### Requirement: Record Explanation Events
The system MUST record each explanation event with enough structured information to support future retrieval and interruption control.

#### Scenario: Record shown explanation event
- **GIVEN** an explanation is shown to the user
- **WHEN** the event is recorded
- **THEN** the record MUST include the canonical concept, prompt context metadata, whether the concept is repeated, and whether historical concepts were used.

#### Scenario: Record user response to explanation
- **GIVEN** the user expands, dismisses, or ignores an explanation
- **WHEN** the response is observed
- **THEN** the system MUST record the response as an event associated with the explanation.

### Requirement: Avoid Memory Pollution From Ambiguous Feedback
The system MUST record user feedback as events and MUST NOT directly convert ambiguous single actions into certain mastery states.

#### Scenario: Dismissal does not mean mastered
- **GIVEN** the user closes an explanation prompt
- **WHEN** the system updates learning memory
- **THEN** the system MUST record a `dismissed` event
- **AND** the system MUST NOT directly mark the concept as mastered.

#### Scenario: Expansion does not prove lack of understanding
- **GIVEN** the user expands an explanation
- **WHEN** the system updates learning memory
- **THEN** the system MUST record an `expanded` event
- **AND** the system MAY increase a possible need for deeper explanation
- **AND** the system MUST NOT conclude from that single event that the user does not understand the concept.

#### Scenario: Repeated confusion remains probabilistic
- **GIVEN** the same concept repeatedly triggers confusion signals
- **WHEN** the system updates learning memory
- **THEN** the system MUST record `repeated_confusion`
- **AND** the system MAY increase the concept's possibly weak signal.

#### Scenario: Recent exposure does not mean mastered
- **GIVEN** the user recently encountered a concept multiple times without strong confusion behavior
- **WHEN** the system updates learning memory
- **THEN** the system MAY record `recently_seen` or `possibly_familiar`
- **AND** the system MUST NOT directly mark the concept as mastered.

#### Scenario: Single dismissal lowers interruption priority only
- **GIVEN** the system prepares to use learning memory for a concept with only one dismissal event
- **WHEN** the system computes explanation strategy
- **THEN** the system MUST NOT treat the concept as mastered
- **AND** the system MUST lower interruption frequency rather than permanently stop explaining the concept.

### Requirement: Derive Uncertain Learning Signals
The system MUST derive learning signals from event patterns while preserving uncertainty.

#### Scenario: Derive possibly weak
- **GIVEN** a concept has repeated confusion events, repeated revisits, or repeated expansions
- **WHEN** derived memory signals are computed
- **THEN** the system MAY mark the concept as `possibly_weak` with non-final confidence.

#### Scenario: Derive low intervention preference
- **GIVEN** the user repeatedly dismisses similar prompts quickly
- **WHEN** derived memory signals are computed
- **THEN** the system MAY mark similar prompts as `low_intervention_preferred`.

#### Scenario: Derive recently explained
- **GIVEN** the system recently displayed an explanation for a concept
- **WHEN** derived memory signals are computed
- **THEN** the system MUST mark the concept as recently explained for cooldown and repetition control.

### Requirement: Preserve Privacy In Learning Memory
The system MUST prefer storing concepts, structured events, derived signals, and minimal context metadata instead of full web page text.

#### Scenario: Store event state instead of full article text
- **GIVEN** the system records a learning event
- **WHEN** the event is persisted
- **THEN** the system MUST store the minimum necessary concept, event, and context metadata
- **AND** the system MUST avoid storing full page text unless explicitly required by the feature.

#### Scenario: Use stable canonical names
- **GIVEN** an event is associated with an aliased concept expression
- **WHEN** the event is persisted
- **THEN** the system MUST store the canonical concept name and MAY store the observed alias.
