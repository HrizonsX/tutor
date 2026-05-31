## ADDED Requirements

### Requirement: Persist Daily Memory Summaries
The Local Memory Store SHALL persist structured daily memory summaries as derived memory records.

#### Scenario: Daily summary survives restart
- **WHEN** the Local Memory Store restarts after a daily summary was created
- **THEN** the summary SHALL remain queryable by date and by referenced canonical concepts.

#### Scenario: Daily summary stores minimal evidence
- **WHEN** a daily summary is persisted
- **THEN** it SHALL store summary version, summary hash, source event ids, topic labels, concept references, relation references, and timestamps without full page text.

### Requirement: Persist Concept Projections
The Local Memory Store SHALL persist or rebuild concept projections derived from raw memory events.

#### Scenario: Concept projection includes event counts
- **WHEN** a concept projection is stored or returned
- **THEN** it SHALL include canonical name, aliases, seen count, explained count, expanded count, dismissed count, repeated confusion count, timestamps, derived signals, uncertainty, and source event ids.

#### Scenario: Stale projection can be rebuilt
- **WHEN** a projection schema or summarizer version changes
- **THEN** the store SHALL mark the projection stale or rebuild it from raw events without deleting raw evidence.

### Requirement: Persist Relation Proposal And Gate Metadata
The Local Memory Store SHALL preserve relation proposal and gate metadata required to audit relation state without storing evidence snippets.

#### Scenario: Relation stores hashes and dates
- **WHEN** a relation candidate or active relation is persisted
- **THEN** it SHALL store source and target canonical names, relation type, status, confidence, basis, source dates, evidence event ids, explanation version ids, context hash, evidence text hash, proposer version, gate reason, occurrence count, and timestamps.

#### Scenario: Relation query excludes rejected records
- **WHEN** Overlay recall queries active one-hop relations
- **THEN** the store SHALL exclude rejected relations and SHALL apply configured relation and bridge limits.

### Requirement: Persist Reflection Report Snapshots
The Local Memory Store SHALL persist daily and weekly reflection report snapshots or report inputs for repeatable report retrieval.

#### Scenario: Report snapshot is queryable
- **WHEN** a daily or weekly report is generated
- **THEN** the store SHALL allow the report or its structured input snapshot to be queried by date range.

#### Scenario: Report snapshot avoids raw text
- **WHEN** a report snapshot is persisted
- **THEN** it SHALL NOT store full page text or evidence snippets.
