## ADDED Requirements

### Requirement: Gate User-Selected Knowledge Memory Events
The system SHALL write user-selected knowledge memory events only after the finalized selection passes selected-concept validation.

#### Scenario: Rejected selection does not create knowledge memory
- **GIVEN** the user finalizes a punctuation-only, partial-word, too-short, large, or code-like selection
- **WHEN** selected-concept validation rejects the selection
- **THEN** the system SHALL NOT write a user-selected knowledge event for that selection
- **AND** it SHALL NOT create or retrieve a canonical knowledge object from that rejected value.

#### Scenario: Accepted selection writes observed alias
- **GIVEN** a finalized user selection passes selected-concept validation
- **WHEN** the system records the selected knowledge encounter
- **THEN** it SHALL preserve the observed selected text as alias evidence
- **AND** it SHALL use the normalized concept identity for canonical memory lookup when confidence is sufficient.

#### Scenario: Memory write uses same validation result as explanation gating
- **GIVEN** a finalized selection has already been validated for explanation eligibility
- **WHEN** the system considers writing a user-selected knowledge memory event
- **THEN** it SHALL reuse the same accepted or rejected validation result
- **AND** it SHALL NOT apply a looser memory-write rule than the explanation trigger rule.

#### Scenario: Rejected selection remains diagnosable
- **GIVEN** the system suppresses a user-selected knowledge memory event
- **WHEN** diagnostics are inspected
- **THEN** the system SHALL expose the rejection reason without storing the rejected selection as a knowledge object.
