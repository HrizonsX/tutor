# learning-reflection-reports Specification

## Purpose
TBD - created by archiving change enhance-cognitive-memory-for-browser-overlay. Update Purpose after archive.
## Requirements
### Requirement: Generate Daily Learning Reports
The Local Agent Runtime SHALL generate daily learning reports from raw events, concept projections, daily summaries, and relation references.

#### Scenario: Daily report summarizes concepts and topics
- **WHEN** a daily learning report is generated
- **THEN** it SHALL include the date, main topics, recently encountered concepts, explained concepts, repeated concepts, and source summary references.

#### Scenario: Daily report includes weak signals
- **WHEN** the day's events include repeated confusion, expansions, or repeated revisits
- **THEN** the report SHALL include possible weak concepts with uncertainty and source event references.

### Requirement: Generate Weekly Learning Reports
The Local Agent Runtime SHALL generate weekly learning reports by aggregating daily summaries and report inputs.

#### Scenario: Weekly report aggregates daily summaries
- **WHEN** a weekly report is generated
- **THEN** it SHALL summarize weekly topics, repeated concepts, explained concepts, weak concepts, stale concepts, and suggested review concepts.

#### Scenario: Weekly report includes relation references
- **WHEN** concept relations were formed, reused, or promoted during the week
- **THEN** the weekly report SHALL include bounded relation references with relation type, confidence, source dates, and learning-context caution.

### Requirement: Keep Reflection Policy Separate From Overlay Recall
Reflection reports SHALL use a separate policy from Overlay recall.

#### Scenario: Reflection can include unrelated stale concept
- **WHEN** a concept is possibly forgotten but unrelated to the current reading target
- **THEN** the reflection policy MAY include it in a report or review suggestion.

#### Scenario: Reflection does not force Overlay recall
- **WHEN** a concept appears in a daily or weekly reflection report
- **THEN** the system SHALL NOT use that fact alone to include the concept in an Overlay explanation.

### Requirement: Preserve Learning-State Boundary In Reports
Reflection reports SHALL present memory as user learning history rather than authoritative world knowledge.

#### Scenario: Report uses memory context labels
- **WHEN** a report includes a concept or relation
- **THEN** it SHALL label the item as local learning history or derived learning context and SHALL NOT present it as a verified source of world facts.

#### Scenario: Report avoids raw private text
- **WHEN** a report is generated from memory records
- **THEN** it SHALL NOT include full page text or stored relation evidence snippets.
