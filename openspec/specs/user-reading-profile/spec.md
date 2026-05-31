# user-reading-profile Specification

## Purpose
TBD - created by archiving change add-agentic-knowledge-memory. Update Purpose after archive.
## Requirements
### Requirement: Maintain Explainable Reading Profile
Gateway / Local Agent Runtime MUST maintain an explainable user reading profile based on feedback and reading events, including category interest, muted categories, explanation style preferences, intervention preference, familiar object signals, and repeated difficulty signals.

#### Scenario: Learn category interest
- **GIVEN** the user repeatedly expands or positively accepts explanations in a knowledge category
- **WHEN** Gateway / Local Agent Runtime updates the reading profile
- **THEN** it MUST increase that category's interest signal with evidence references.

#### Scenario: Learn muted category
- **GIVEN** the user chooses not to receive prompts for a knowledge category
- **WHEN** Gateway / Local Agent Runtime updates the reading profile
- **THEN** it MUST record a muted category preference that future policy can apply.

#### Scenario: Keep profile evidence-based
- **GIVEN** the profile stores a preference or difficulty signal
- **WHEN** the profile is inspected or used by policy
- **THEN** the profile MUST retain evidence events and uncertainty for that signal.

#### Scenario: Browser forwards profile evidence only
- **GIVEN** a browser interaction creates profile evidence
- **WHEN** the browser extension handles the interaction
- **THEN** it MUST forward the structured event to Gateway / Local Agent Runtime
- **AND** it SHALL NOT persist or derive browser-local profile hints.

### Requirement: Feedback Must Influence Future Behavior
Gateway / Local Agent Runtime MUST use explicit user feedback to adjust future object ranking, intervention priority, explanation style, regeneration style, and cooldown behavior.

#### Scenario: Marked known lowers priority
- **GIVEN** the user marks a knowledge object as known
- **WHEN** the object appears again soon
- **THEN** Gateway / Local Agent Runtime MUST lower intervention priority for that object without permanently marking it as mastered.

#### Scenario: Marked confusing raises support
- **GIVEN** the user marks an explanation as confusing or requests a simpler explanation
- **WHEN** a related object appears later
- **THEN** Gateway / Local Agent Runtime MUST raise support for more basic or analogy-based explanations when other prompt conditions are met.

#### Scenario: Regeneration affects style preference
- **GIVEN** the user regenerates explanations and later accepts a specific explanation style
- **WHEN** Gateway / Local Agent Runtime updates the reading profile
- **THEN** it MUST increase preference for that style in similar future contexts.

#### Scenario: Browser does not apply durable feedback policy locally
- **GIVEN** explicit feedback has been recorded
- **WHEN** future behavior is personalized using that feedback
- **THEN** the personalization SHALL come from Gateway / Local Agent Runtime profile or policy state
- **AND** not from browser-local profile cache.

### Requirement: Apply Profile To Signal Selection
When multiple candidate knowledge objects appear, Gateway / Local Agent Runtime MUST use the reading profile to adjust which signals and objects are prioritized while preserving semantic relevance and low-interruption constraints.

#### Scenario: Prioritize user interest
- **GIVEN** multiple knowledge objects are semantically relevant
- **AND** one object belongs to a category the user repeatedly engages with
- **WHEN** Gateway / Local Agent Runtime ranks candidates or returns profile-aware policy signals
- **THEN** it MUST increase the priority of that object relative to otherwise similar candidates.

#### Scenario: Suppress muted object
- **GIVEN** the user muted a specific object
- **WHEN** that object appears again
- **THEN** Gateway / Local Agent Runtime MUST suppress proactive prompts for that object unless the user explicitly requests explanation.

#### Scenario: Preserve semantic requirement
- **GIVEN** a profile preference favors one category
- **AND** another object is more important for understanding the current page
- **WHEN** Gateway / Local Agent Runtime ranks candidates or returns policy signals
- **THEN** it MUST keep current semantic importance as a required ranking factor.

#### Scenario: Browser uses only runtime profile signals
- **WHEN** browser UI behavior depends on profile, mute, familiarity, preference, or difficulty signals
- **THEN** those signals SHALL come from Gateway / Local Agent Runtime for the current request
- **AND** the browser extension SHALL NOT load them from local profile storage.

### Requirement: Provide Profile Control
The system MUST allow profile-derived preferences to be cleared, muted, or overridden by the user through Gateway / Local Agent Runtime profile state.

#### Scenario: Clear object preference
- **GIVEN** the user clears learned preferences for a specific knowledge object
- **WHEN** Gateway / Local Agent Runtime profile state is updated
- **THEN** the system MUST stop applying prior object-level preference signals for that object.

#### Scenario: Clear category preference
- **GIVEN** the user clears or unmutes a knowledge category
- **WHEN** future candidate objects in that category are ranked
- **THEN** Gateway / Local Agent Runtime MUST stop applying the cleared category-level suppression.

#### Scenario: Avoid opaque personality labels
- **GIVEN** the system stores profile data
- **WHEN** the profile is used for policy
- **THEN** the profile MUST use specific preference and feedback signals rather than broad personality labels.

#### Scenario: Browser control sends event
- **GIVEN** the user clears, mutes, or overrides a preference in browser UI
- **WHEN** the browser extension handles the control
- **THEN** it SHALL report a structured event to Gateway / Local Agent Runtime
- **AND** it SHALL NOT mutate browser-local profile storage.

### Requirement: Browser Extension Must Not Store Reading Profile
The browser extension SHALL NOT persist or cache user reading profile data, profile evidence, profile hints, familiar object signals, muted preferences, category interests, difficulty signals, or explanation style preferences.

#### Scenario: Profile data after refresh
- **GIVEN** the user has provided feedback through the overlay
- **WHEN** the page is refreshed
- **THEN** the browser extension SHALL NOT restore reading profile data from browser-local state
- **AND** any profile-aware behavior SHALL require Gateway / Local Agent Runtime profile data.

#### Scenario: Profile data after browser restart
- **GIVEN** the user has used profile-affecting controls such as known, confusing, mute, or regenerate
- **WHEN** the browser restarts
- **THEN** the extension SHALL NOT retain profile hints or preference summaries unless Gateway / Local Agent Runtime provides them.
