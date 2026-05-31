## ADDED Requirements

### Requirement: Use Reading Profile In Intervention Priority
The system MUST use the user reading profile as one input to intervention priority while preserving requirements for content relevance and low-interruption behavior.

#### Scenario: Raise priority for interested category
- **GIVEN** a semantically important knowledge object appears
- **AND** the user profile indicates repeated engagement with that object's category
- **WHEN** intervention priority is computed
- **THEN** the system MUST raise priority relative to otherwise similar objects.

#### Scenario: Lower priority for muted category
- **GIVEN** a knowledge object belongs to a category the user muted
- **WHEN** intervention priority is computed
- **THEN** the system MUST lower or suppress proactive priority for that object.

#### Scenario: Profile does not override missing content relevance
- **GIVEN** the user profile shows interest in a category
- **AND** the current object is not important for understanding the current fragment
- **WHEN** intervention priority is computed
- **THEN** the system MUST NOT raise priority enough to prompt solely from profile interest.

### Requirement: Use Explicit Feedback As Future Signal
The system MUST use explicit feedback events as future inference signals for similar objects, explanation style, and cooldown behavior.

#### Scenario: Recent known feedback suppresses repetition
- **GIVEN** the user recently marked an object as known
- **WHEN** that object appears again
- **THEN** the system MUST reduce proactive explanation priority for that object.

#### Scenario: Confusing feedback increases support
- **GIVEN** the user marked an explanation as confusing
- **WHEN** a related object appears with additional content or behavior evidence
- **THEN** the system MUST increase support for simpler or more contextual explanation.

#### Scenario: Wrong feedback requires caution
- **GIVEN** the user marked a previous explanation as inaccurate
- **WHEN** the same or related object is considered again
- **THEN** the system MUST require higher confidence, source verification, or conservative fallback before showing another explanation.

### Requirement: Use Regeneration Behavior As Preference Signal
The system MUST treat regeneration requests and accepted regenerated explanations as signals about explanation style and object difficulty.

#### Scenario: Repeated regeneration lowers confidence in current style
- **GIVEN** the user repeatedly regenerates explanations of the same style
- **WHEN** future explanation strategy is selected
- **THEN** the system MUST lower preference for that style in similar contexts.

#### Scenario: Accepted regenerated style raises preference
- **GIVEN** the user accepts a regenerated explanation using a specific style
- **WHEN** future explanation strategy is selected
- **THEN** the system MUST increase preference for that style when relevant.
