## Context

The Local Agent Runtime already persists raw memory events, explanation versions, memory candidates, derived summaries, retrieval summaries, and profile summaries. Runtime explain currently queries exact target memory before provider dispatch, and the in-progress `add-memory-association-linker` change adds persistent edge storage and bounded `relatedMemories`.

This change adds the cognitive memory layer above that substrate. The goal is not to remember more text. The goal is to understand which concepts the user has encountered over time, which historical concepts are relevant to a current explanation, and which stale or weak concepts belong in a reflection report instead of the Overlay.

The user has made two design decisions that shape the solution:

- Overlay recall and reflection reports use different policies.
- Relation evidence shall not store an evidence snippet for now; only ids, hashes, dates, source metadata, and structured confidence reasons are stored.

## Goals / Non-Goals

**Goals:**

- Maintain event-first concept memory and derived concept projections.
- Store daily memory summaries as a temporal index over learned concepts, topics, and relation references.
- Use daily summaries to find likely relevant history without scanning every raw event or every concept pair.
- Let LLM calls propose day relevance and relation candidates only through strict structured schemas.
- Gate LLM relation proposals before persistence as active relations.
- Keep Overlay recall narrow, one-hop, capped, current-explanation-first, and forgetting-aware only when relevance is already established.
- Keep reflection reports broader, time-windowed, and suitable for stale or weak concepts that should not interrupt current reading.
- Preserve browser statelessness for learning memory and keep runtime memory as the source of truth.

**Non-Goals:**

- No browser-side memory graph, browser-side daily summary cache, browser-local vector index, or browser-owned relation discovery.
- No evidence snippet storage or full page text storage for relation evidence.
- No use of embedding similarity as a direct relation creator.
- No direct active relation persistence from unverified LLM output.
- No recursive relation expansion beyond depth 1 for Overlay recall.
- No use of related historical concepts as authoritative world knowledge.

## Decisions

### Use daily summaries as a temporal memory index

Daily summaries should be stored as structured records, not only prose. Each summary should include date, summary version, summary hash, topic labels, concept references, event counts, relation references, and source event ids.

This gives the runtime a compact time dimension: a new concept can be compared against daily summaries first, then against the concepts from selected days. It avoids all-pairs concept comparison across long-term memory.

Alternative considered: query every historical concept directly for each new target. That is simpler conceptually, but it scales poorly and creates too many weak relation candidates.

### Split synchronous recall from asynchronous relation discovery

The explanation path should remain fast:

1. Normalize the target.
2. Query exact concept memory.
3. Query current session context.
4. Query active one-hop relations.
5. Send only top memory bridges to the provider.

Day selection, LLM relation proposal, and relation gating should run asynchronously after the event or explanation is persisted. The first explanation may not have all historical bridges; later explanations can benefit from enriched memory.

Alternative considered: block every explanation on day selection and relation proposal. That maximizes continuity for first encounters, but it adds latency, cost, and failure modes to the primary Overlay interaction.

### Treat LLM relation output as proposals, not truth

The LLM may choose relevant days and propose typed relation candidates from day-scoped concept blocks. It must return structured JSON using a constrained schema with canonical names, source dates, relation type, confidence, basis, and usability hints.

The Relation Gate decides persistence state:

- `active` only when basis is explicit current context, provider structured relation, prior active relation, or repeated consistent evidence.
- `candidate` when basis is daily-summary inference, weak semantic similarity, or insufficient evidence.
- `rejected` when schema validation fails, names are unknown, relation type is disallowed, a self-loop appears, source dates do not match loaded day blocks, or confidence is unsupported.

Alternative considered: let the LLM directly write active relations. That risks converting world knowledge, hallucinated links, or weak temporal similarity into durable memory.

### Keep relation evidence private and structured

Relation records should store source event ids, source explanation version ids, source dates, context hashes, evidence text hashes, source kind, extractor or proposer version, confidence reason, occurrence count, timestamps, status, and confidence.

They should not store evidence snippets in this change. This keeps privacy stronger, but means debugging and audit must rely on ids, hashes, and structured source metadata.

Alternative considered: store bounded evidence snippets. That would improve human auditability, but it stores more user reading text and conflicts with the current privacy decision.

### Use separate Overlay and reflection policies

OverlayRecallPolicy is narrow:

- Current explanation first.
- Relation depth 1.
- Micro explanation bridge cap 1.
- Expanded explanation bridge cap 2 or 3.
- No explicit relation means no long-term bridge.
- `related_to` defaults out of micro explanations.
- Forgetting risk boosts only already-relevant candidates.

ReflectionReportPolicy is wider:

- Uses daily and weekly windows.
- Can include repeated, weak, stale, and possibly forgotten concepts.
- Can show relationship chains or newly formed relations.
- Does not feed unrelated concepts into the current Overlay explanation.

Alternative considered: one shared retrieval policy. That would be simpler, but it would either overload the Overlay or make reports too narrow to be useful.

### Rank repeated target recall from active one-hop memory

When a concept has already been encountered, exact memory and active one-hop relations should be ranked before provider dispatch. The runtime should not send all related concepts. Ranking should use confidence, relation type usefulness, recency, forgetting risk when relevant, estimated difficulty, estimated familiarity, and a recently-used penalty.

Alternative considered: send all one-hop relations with depth 1. Depth control alone is not enough; high-degree concepts can still overload prompts.

### Keep embeddings optional and non-authoritative

Embedding or semantic similarity may later help prefilter daily summaries or propose weak candidates, but it must not create active typed relations by itself. Similarity has no reliable relation type, direction, or evidence.

Alternative considered: vector-search historical concepts and build relations from nearest neighbors. That confuses semantic proximity with typed concept relation evidence.

## Risks / Trade-offs

- LLM relation proposals may hallucinate or over-associate -> Relation Gate treats proposals as candidates unless evidence basis is strong, validates schema, and rejects unknown names or unsupported relation types.
- Daily summary selection may miss relevant history -> Fast exact/session/active-edge recall still works, and report generation can surface stale concepts without forcing Overlay bridges.
- Async enrichment may not help the first explanation -> The first path remains fast; future occurrences gain continuity after relation discovery completes.
- No evidence snippets reduce auditability -> Store hashes, source dates, event ids, version ids, source kind, proposer version, and confidence reason.
- Day-level LLM calls can become expensive -> Use local prefiltering, date windows, weekly/monthly indexes later, concurrency limits, and cache keys based on target, summary hash, and proposer version.
- Active relation graph can grow too large -> Cap active edges per concept and cap provider bridge injection by policy.
- Forgetting risk may tempt unrelated recall -> Apply forgetting only after relevance eligibility is satisfied.

## Migration Plan

1. Add storage support for daily summaries, concept projections, relation proposal metadata, report snapshots, and date/concept indexes.
2. Load existing stores with empty daily summaries and report snapshots; preserve raw events, explanation versions, derived summaries, and existing edge data.
3. Generate daily summaries only from future summarizer runs or explicit backlog processing; do not require a bulk historical backfill for MVP.
4. Keep memory query behavior compatible when no daily summaries or active relations exist by returning empty bridge arrays and degraded or unavailable relation discovery status.
5. Rollback by ignoring new summary/report/proposal tables or fields; existing event and explanation memory remains intact.

## Open Questions

- Should daily summaries be rebuilt on demand for recent missing days, or only produced by scheduled summarizer work?
- Should relation proposal operate only after successful explanations, or also after selected-term and seen events with enough current context?
- What is the first default window for day selection: 7, 14, or 30 days?
- Should `related_to` ever be active for Overlay micro explanations, or remain reflection-only until user-confirmed?
