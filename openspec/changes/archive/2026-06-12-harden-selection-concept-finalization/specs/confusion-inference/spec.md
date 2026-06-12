## ADDED Requirements

### Requirement: Ignore Invalid Selection Signals For Intervention
The system MUST NOT use rejected explicit-selection candidates as evidence for confusion or proactive explanation.

#### Scenario: Invalid selection does not raise priority
- **GIVEN** a finalized selection is rejected by selected-concept validation
- **WHEN** the system computes intervention priority
- **THEN** it MUST NOT treat that selection as a positive behavior signal
- **AND** it MUST NOT trigger an explanation only because that rejected selection occurred.

#### Scenario: Large or code-like selection remains ambiguous
- **GIVEN** the user finalizes a large text span or code-like selection
- **WHEN** the system evaluates the behavior
- **THEN** it MUST keep treating the action as possible copying, excerpting, or note-taking behavior
- **AND** it MUST NOT treat the selection as an explicit concept explanation request.

#### Scenario: Accepted selection can still support intervention
- **GIVEN** a finalized selection passes selected-concept validation
- **AND** the current reading fragment contains relevant content or memory evidence
- **WHEN** the system computes intervention priority
- **THEN** it MAY use the accepted selection as one positive behavior signal according to existing scoring rules.

#### Scenario: Rejected selection records silence reason
- **GIVEN** a finalized selection is rejected
- **WHEN** the system decides not to intervene
- **THEN** it SHALL expose a concise rejection reason through the existing diagnostics surface.
