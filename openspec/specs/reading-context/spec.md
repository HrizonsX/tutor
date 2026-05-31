# reading-context Specification

## Purpose
TBD - created by archiving change add-browser-cognitive-overlay. Update Purpose after archive.
## Requirements
### Requirement: Detect Current Reading Context
The system MUST identify the content fragment the user is most likely reading while the user browses web content.

#### Scenario: Update context after viewport changes
- **GIVEN** the user is reading a web page
- **WHEN** the user scrolls, pauses, or changes the viewport
- **THEN** the system MUST update the current reading context to the most likely visible content fragment.

#### Scenario: Continue context detection after dynamic content changes
- **GIVEN** page content changes dynamically after initial load
- **WHEN** the user continues reading
- **THEN** the system MUST continue identifying the current reading context from the updated page content.

#### Scenario: Track context near selected text
- **GIVEN** the user selects text inside or near a visible paragraph
- **WHEN** the system updates reading context
- **THEN** the selected text and its surrounding paragraph MUST be considered part of the current context candidate set.

### Requirement: Observe Reading Behavior
The system MUST observe reading behavior signals related to the current reading context for later confusion inference.

#### Scenario: Record long dwell as one possible signal
- **GIVEN** the user remains near a content fragment longer than normal reading expectations
- **WHEN** the system records behavior for that fragment
- **THEN** the system MUST record dwell as one possible signal without treating it as sufficient evidence of confusion.

#### Scenario: Record repeated revisits
- **GIVEN** the user repeatedly returns to the same content fragment
- **WHEN** the same fragment is revisited multiple times
- **THEN** the system MUST record the revisits as a possible attention or confusion signal.

#### Scenario: Record relevant text selection
- **GIVEN** the user selects a term or sentence related to the current paragraph
- **WHEN** the system records behavior
- **THEN** the system MUST record the selection as an attention signal associated with the current reading context.

#### Scenario: Record repeated pauses near the same concept
- **GIVEN** the user pauses multiple times near the same extracted concept
- **WHEN** the system aggregates behavior signals
- **THEN** the system MUST associate the repeated pauses with that concept candidate.

#### Scenario: Detect possible inactivity
- **GIVEN** the user remains on a page without scrolling, selection, pointer activity, keyboard activity, or other reading behavior
- **WHEN** the inactive period exceeds the configured threshold
- **THEN** the system MUST record the state as possible inactivity rather than active reading.

#### Scenario: Detect large text or code selections
- **GIVEN** the user selects a large text span or a code block
- **WHEN** the system records the selection behavior
- **THEN** the system MUST classify the signal as possible copying, excerpting, or note-taking behavior.

### Requirement: Minimize Reading Context Data
The system MUST collect and retain only the minimum reading context needed to support concept extraction, confusion inference, and explanation.

#### Scenario: Store lightweight context metadata
- **GIVEN** the system has identified a current reading fragment
- **WHEN** the system records reading context state
- **THEN** the system MUST prefer lightweight metadata, concept candidates, and fragment identity over storing full page text.

#### Scenario: Limit analysis context window
- **GIVEN** the system needs to analyze text around the current reading fragment
- **WHEN** the system prepares content for analysis
- **THEN** the system MUST limit the context window to the minimum text needed for the feature.
