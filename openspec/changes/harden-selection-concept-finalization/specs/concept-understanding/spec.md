## ADDED Requirements

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
