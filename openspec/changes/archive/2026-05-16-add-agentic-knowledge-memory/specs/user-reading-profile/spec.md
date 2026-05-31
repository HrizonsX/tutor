## ADDED Requirements

### Requirement: Maintain Explainable Reading Profile
The system MUST maintain an explainable user reading profile based on feedback and reading events, including category interest, muted categories, explanation style preferences, intervention preference, familiar object signals, and repeated difficulty signals.

#### Scenario: Learn category interest
- **GIVEN** the user repeatedly expands or positively accepts explanations in a knowledge category
- **WHEN** the reading profile is updated
- **THEN** the system MUST increase that category's interest signal with evidence references.

#### Scenario: Learn muted category
- **GIVEN** the user chooses not to receive prompts for a knowledge category
- **WHEN** the reading profile is updated
- **THEN** the system MUST record a muted category preference that future policy can apply.

#### Scenario: Keep profile evidence-based
- **GIVEN** the profile stores a preference or difficulty signal
- **WHEN** the profile is inspected or used by policy
- **THEN** the system MUST retain evidence events and uncertainty for that signal.

### Requirement: Feedback Must Influence Future Behavior
The system MUST use explicit user feedback to adjust future object ranking, intervention priority, explanation style, regeneration style, and cooldown behavior.

#### Scenario: Marked known lowers priority
- **GIVEN** the user marks a knowledge object as known
- **WHEN** the object appears again soon
- **THEN** the system MUST lower intervention priority for that object without permanently marking it as mastered.

#### Scenario: Marked confusing raises support
- **GIVEN** the user marks an explanation as confusing or requests a simpler explanation
- **WHEN** a related object appears later
- **THEN** the system MUST raise support for more basic or analogy-based explanations when other prompt conditions are met.

#### Scenario: Regeneration affects style preference
- **GIVEN** the user regenerates explanations and later accepts a specific explanation style
- **WHEN** the reading profile is updated
- **THEN** the system MUST increase preference for that style in similar future contexts.

### Requirement: Apply Profile To Signal Selection
When multiple candidate knowledge objects appear, the system MUST use the reading profile to adjust which signals and objects are prioritized while preserving semantic relevance and low-interruption constraints.

#### Scenario: Prioritize user interest
- **GIVEN** multiple knowledge objects are semantically relevant
- **AND** one object belongs to a category the user repeatedly engages with
- **WHEN** the system ranks candidates
- **THEN** the system MUST increase the priority of that object relative to otherwise similar candidates.

#### Scenario: Suppress muted object
- **GIVEN** the user muted a specific object
- **WHEN** that object appears again
- **THEN** the system MUST suppress proactive prompts for that object unless the user explicitly requests explanation.

#### Scenario: Preserve semantic requirement
- **GIVEN** a profile preference favors one category
- **AND** another object is more important for understanding the current page
- **WHEN** the system ranks candidates
- **THEN** the system MUST keep current semantic importance as a required ranking factor.

### Requirement: Provide Profile Control
The system MUST allow profile-derived preferences to be cleared, muted, or overridden by the user.

#### Scenario: Clear object preference
- **GIVEN** the user clears learned preferences for a specific knowledge object
- **WHEN** the profile is updated
- **THEN** the system MUST stop applying prior object-level preference signals for that object.

#### Scenario: Clear category preference
- **GIVEN** the user clears or unmutes a knowledge category
- **WHEN** future candidate objects in that category are ranked
- **THEN** the system MUST stop applying the cleared category-level suppression.

#### Scenario: Avoid opaque personality labels
- **GIVEN** the system stores profile data
- **WHEN** the profile is used for policy
- **THEN** the profile MUST use specific preference and feedback signals rather than broad personality labels.
