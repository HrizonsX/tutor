## Context

The Local Agent Runtime already persists raw memory events, explanation versions, memory candidates, derived summaries, retrieval summaries, and profile summaries. Runtime explain currently queries memory by exact `canonicalName`, then may return an exact prior explanation or call the provider with the exact-target memory packet.

The missing piece is bounded cross-concept continuity. Existing event-level `relatedConcepts` can appear in memory records, but there is no durable edge table, no bidirectional lookup for a later target, and no provider packet field that clearly separates related learning context from exact target history.

## Goals / Non-Goals

**Goals:**

- Persist weak concept associations in Local Agent Runtime memory.
- Build associations from conservative, evidence-backed runtime inputs.
- Retrieve a small set of related memories alongside exact target memory.
- Label related memories as historical user context only.
- Keep exact prior explanation reuse limited to the same canonical target.
- Keep the browser extension stateless with respect to association graph creation, storage, and retrieval.

**Non-Goals:**

- No embeddings or vector similarity requirement.
- No cloud service or browser-side graph cache.
- No strong entity disambiguation or authoritative knowledge graph.
- No use of related memory as a fact source.
- No direct `return_existing_explanation` from a non-exact related concept.

## Decisions

### Store associations as `memory_edges`

Add a first-class edge record rather than overloading `relatedObjects` inside summaries.

Proposed fields:

- `id`
- `sourceCanonicalName`
- `targetCanonicalName`
- `relationType`
- `confidence`
- `source`
- `sourceEventIds`
- `sourceExplanationVersionIds`
- `evidenceTextHash`
- `occurrenceCount`
- `createdAt`
- `updatedAt`
- `lastSeenAt`
- `status`

The SQLite store should index `sourceCanonicalName`, `targetCanonicalName`, and active status. The in-memory store should mirror this shape for tests.

Alternative considered: keep associations only in derived summaries. That would be simpler, but it makes bidirectional retrieval, deduplication, persistence verification, and summarizer maintenance harder.

### Keep linker rule-based in the first stage

The first linker should extract edges from:

- structured provider `terms`
- explanation version `structuredResponse.summary`
- target and terms in structured response fields
- memory event `relatedConcepts`
- conservative concept candidates from minimal context
- feedback events that request more context or simpler rewrites when related concepts are available

It should ignore self loops and normalize all names through the existing canonical name helper. Free-text extraction should be conservative: simple Chinese proper-name spans, English title-case or technical phrases, and existing extractor candidates are acceptable; ambiguous low-signal words should be ignored.

Alternative considered: use an LLM linker. That may be useful later, but it adds latency, cost, and a second source of model uncertainty before the evidence model is proven.

### Separate exact memory from related memory

Retrieval should continue to return exact `priorExplanations`, feedback, summaries, cooldowns, and profile hints for the requested target. Related edges should produce a separate `relatedMemories` array with:

- `canonicalName`
- `relationType`
- `direction`
- `confidence`
- `sourceRole: "related_memory"`
- `evidenceEventIds`
- `evidenceExplanationVersionIds`
- `summary`
- `lastSeenAt`
- `caution: "related_memory_is_not_fact_source"`

Related memory summaries may include lightweight derived summary text, latest explanation metadata, and feedback summary for the related concept. They must not include unsanitized raw context or full page text.

Alternative considered: merge related memory into `similarMemories`. That conflates evidence-backed local association edges with future embedding similarity results.

### Confidence is conservative and evidence-driven

Default confidence is `low`. Edges from structured provider terms or repeated co-occurrence can rise to `medium`. The first stage does not need `high` unless the implementation has clear repeated structured evidence. Muted or rejected edges stay out of retrieval.

When the active edge cap is exceeded, retrieval should prefer stronger confidence, more recent `lastSeenAt`, and stronger evidence source. A default cap of 20 active edges per concept and 3 to 5 injected related memories keeps prompt size bounded.

Alternative considered: no caps. That risks prompt bloat and noisy personalization.

### Provider prompts must preserve the fact boundary

Provider requests may include `relatedMemories`, but prompts and field guides must state that the field is user history context, not world knowledge. For fact-sensitive targets or related concepts, the provider must rely on its normal explanation/source-aware process rather than the related memory text.

Alternative considered: omit related memories from fact-sensitive requests. That is safer, but loses useful learning continuity. The explicit caution plus source-aware provider boundary keeps the first stage useful without making memory authoritative.

## Risks / Trade-offs

- Association noise -> Keep extraction conservative, confidence low by default, cap active edges, and let summarizer mute/reject weak edges.
- Prompt misuse -> Add explicit `related_memory_is_not_fact_source` cautions and tests that inspect provider requests.
- Schema migration drift -> Bump memory schema version, add `memory_edges` creation idempotently, and keep unsupported future schema behavior unchanged.
- Privacy creep -> Store evidence ids and hashes instead of full evidence text.
- Over-reuse -> Preserve exact-only `return_existing_explanation` policy and test related prior explanations do not skip provider calls.

## Migration Plan

1. Add `memory_edges` to Local Memory Store schema and in-memory store data.
2. Load existing stores with an empty edge set and mark schema migration complete.
3. Generate new edges only from future events and explanation versions; no bulk backfill is required for the first stage.
4. Keep query behavior compatible when no edges exist by returning `relatedMemories: []`.
5. Rollback is safe by ignoring the new table/field; existing raw events, versions, candidates, and summaries remain intact.

## Open Questions

- Should edge rejection/muting have a public memory API in the first implementation, or remain summarizer-internal?
- Should minimal context extraction use only existing concept candidate extraction, or add a tiny linker-specific phrase extractor?
- Should `high` confidence be withheld entirely until there is user-confirmed association feedback?
