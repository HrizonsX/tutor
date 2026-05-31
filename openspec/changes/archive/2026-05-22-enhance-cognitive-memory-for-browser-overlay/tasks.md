## 1. Store Model And Configuration

- [x] 1.1 Add cognitive memory config defaults for daily summary windows, selected-day limits, relation proposal concurrency, bridge caps, relation depth, and proposal cache versioning.
- [x] 1.2 Extend in-memory Local Memory Store data with daily summaries, concept projections, relation proposal metadata, and reflection report snapshots.
- [x] 1.3 Add SQLite tables or records for daily summaries, concept projections, relation proposal metadata, and reflection report snapshots with date and canonical-name indexes.
- [x] 1.4 Add schema migration metadata and load logic that opens existing stores with empty cognitive memory records.
- [x] 1.5 Add privacy helpers for context hashes, evidence text hashes, source-date clamping, source id clamping, and no-snippet relation evidence normalization.

## 2. Concept Projection And Daily Summaries

- [x] 2.1 Implement concept projection derivation from raw events, profile events, explanation versions, and memory candidates.
- [x] 2.2 Include concept projection fields for aliases, event counts, timestamps, derived signals, uncertainty, source event ids, estimated familiarity, estimated difficulty, and forgetting inputs.
- [x] 2.3 Implement daily summary generation from raw events and concept projections without storing full page text or evidence snippets.
- [x] 2.4 Persist daily summaries with summary version, summary hash, topics, concept refs, relation refs, event counts, source event ids, and timestamps.
- [x] 2.5 Mark concept projections and daily summaries stale when relevant raw events or summarizer versions change.

## 3. Relation Discovery And Gating

- [x] 3.1 Add a day selector interface that accepts a target concept and structured daily summaries and returns bounded relevant days.
- [x] 3.2 Add a day-scoped concept block loader that preserves which concepts and relation refs belong to each selected date.
- [x] 3.3 Add relation proposer request and response schemas with allowed relation types, confidence, basis, source dates, usability metadata, and rejected candidate reasons.
- [x] 3.4 Update provider adapter structured JSON handling for relation proposal parse, schema validation, normalization, and invalid-output degradation.
- [x] 3.5 Implement Relation Gate validation for schema, canonical names, source dates, day-block membership, relation type, self-loops, confidence, basis, and overlay usability.
- [x] 3.6 Persist gated relation proposals as candidate, active, or rejected records with ids, dates, hashes, source kind, proposer version, gate reason, occurrence count, and timestamps.
- [x] 3.7 Add promotion and demotion logic so weak daily-summary inference remains candidate while explicit current context, provider structured relation, prior active relation, or repeated consistent evidence can become active.

## 4. Overlay Recall Planner

- [x] 4.1 Implement fast recall planning that queries exact concept memory, session context, and active one-hop relations before provider dispatch.
- [x] 4.2 Rank memory bridges by confidence, relation type usefulness, recency, forgetting risk when relevant, difficulty, familiarity, and recently-used penalty.
- [x] 4.3 Enforce OverlayRecallPolicy limits for relation depth, micro bridge count, expanded bridge count, `related_to` handling, and current-explanation-first behavior.
- [x] 4.4 Add memory bridge packet fields with related concept, relation type, confidence, source role, caution, source dates, and evidence ids.
- [x] 4.5 Record used memory bridges after explanation while leaving proposed-but-unused candidates unmarked as used.

## 5. Async Runtime Flow And Gateway Boundary

- [x] 5.1 Invoke async relation discovery after relevant memory events and explanation versions are persisted without blocking the provider request.
- [x] 5.2 Add proposal caching keyed by target canonical name, daily summary hash, and proposer version.
- [x] 5.3 Enforce configured concurrency limits for day-scoped relation proposal calls.
- [x] 5.4 Update gateway request normalization to ignore browser-provided daily summaries, concept projections, memory bridges, relation proposals, and report context.
- [x] 5.5 Expose redacted health or diagnostics for cognitive memory summarizer, daily summary freshness, relation discovery backlog, proposal cache, and degraded states.

## 6. Reflection Reports

- [x] 6.1 Implement ReflectionReportPolicy separately from OverlayRecallPolicy.
- [x] 6.2 Generate daily learning reports from daily summaries, concept projections, event counts, weak signals, repeated concepts, and relation refs.
- [x] 6.3 Generate weekly learning reports from daily summaries with topics, repeated concepts, explained concepts, weak concepts, stale concepts, review suggestions, and bounded relation refs.
- [x] 6.4 Persist report snapshots or structured report inputs by date range without full page text or evidence snippets.
- [x] 6.5 Ensure report contents do not automatically make unrelated concepts eligible for Overlay recall.

## 7. Provider And Composer Integration

- [x] 7.1 Update provider requests to include bounded memory bridges and recall policy constraints from the runtime planner.
- [x] 7.2 Update composer/provider prompts to treat memory bridges as local learning context and not fact sources.
- [x] 7.3 Ensure fact-sensitive targets or bridge concepts keep source-aware accuracy boundaries despite memory bridge context.
- [x] 7.4 Ensure repeated concept explanations use ranked one-hop active bridges rather than all relations.

## 8. Tests

- [x] 8.1 Add concept projection tests for event counts, timestamps, uncertainty, no mastery inference, and forgetting input fields.
- [x] 8.2 Add daily summary tests for structured fields, date and concept lookup, summary hash, source ids, and no stored snippets.
- [x] 8.3 Add relation proposal and gate tests for valid active promotion, weak candidate persistence, invalid rejection, self-loop rejection, source-date validation, and no all-pairs scanning.
- [x] 8.4 Add Overlay recall tests for exact memory, session continuity, active one-hop bridges, bridge caps, depth 1, unrelated forgotten concept exclusion, and repeated concept ranking.
- [x] 8.5 Add gateway tests showing provider dispatch is not blocked by async relation discovery and browser-provided memory fields are ignored.
- [x] 8.6 Add provider adapter tests for relation proposal schema validation, invalid JSON degradation, day ownership preservation, and non-authoritative memory cautions.
- [x] 8.7 Add reflection report tests for daily reports, weekly reports, weak/stale/review suggestions, relation refs, and separation from Overlay recall.
- [x] 8.8 Run the relevant test suite and update fixtures or snapshots required by new memory packet and report fields.
