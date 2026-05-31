## Why

Browser Cognitive Overlay memory needs to evolve from exact-target explanation history and weak association edges into a concept-centered learning memory that can support controlled historical recall, forgetting-aware continuity, and daily or weekly reflection without polluting explanations.

The runtime already owns local memory events and summaries, and the in-progress `add-memory-association-linker` change establishes edge persistence. This change builds the higher-level cognitive memory layer that decides which concepts, dates, and typed relationships are useful for the current explanation and which belong only in reflection.

## What Changes

- Add concept-level memory projections derived from raw events, including counts, timestamps, uncertainty, familiarity, difficulty, weakness signals, and forgetting-risk inputs.
- Add structured daily memory summaries as a temporal index over learned concepts, daily topics, event counts, and relation references.
- Add a controlled relationship discovery flow where daily summaries select likely relevant days, day-scoped concept blocks feed an LLM relation proposer, and a relation gate decides whether proposals become candidate, active, or rejected relations.
- Preserve privacy by storing event ids, explanation version ids, source dates, context hashes, and evidence text hashes, but no stored evidence snippets or full page text.
- Add distinct policies for Overlay recall and reflection reports:
  - Overlay recall remains narrow, current-explanation-first, one-hop, and capped.
  - Reflection reports may use wider day and week windows to summarize learning, weak concepts, stale concepts, and relationship chains.
- Add forgetting-aware ranking for relevant historical concepts, while forbidding forgetting risk from triggering unrelated Overlay recall.
- Update provider request context so retrieved memory bridges are typed, bounded, and labeled as local learning context rather than world knowledge.
- Keep browser extension code out of concept memory projection, daily summary generation, relation proposal, relation gating, graph persistence, and report generation.

## Capabilities

### New Capabilities
- `concept-memory-recall`: Defines concept-level memory projections, daily memory summaries as temporal indexes, relationship proposal and gating, Overlay recall policy, reflection policy, and forgetting-aware recall semantics.
- `learning-reflection-reports`: Defines daily and weekly learning reflection reports built from memory summaries, concept state, and relation references without affecting Overlay recall.

### Modified Capabilities
- `learning-memory`: Require event-first concept memory, uncertain concept state projection, relation-use events, and no direct mastery or non-understanding conclusions from single actions.
- `concept-understanding`: Require new concepts to enter memory as canonical concept units and use current context, session context, daily summaries, and relation gates for possible historical linkage.
- `local-memory-store`: Persist daily summaries, concept state projections, relation proposal metadata, source dates, hashes, and report inputs while preserving raw/derived memory boundaries.
- `local-agent-memory-gateway`: Own the pre-explanation recall planner, post-explanation memory writes, async relation discovery, relation gating, and report generation boundaries.
- `short-explanation-composer`: Consume bounded memory bridges and policy constraints while keeping current content primary and treating memory as non-authoritative learning context.
- `provider-adapter-structured-json`: Support structured relation proposal schemas and reject or degrade invalid relation outputs without treating provider proposals as automatically active memory relations.

## Impact

- Affected code: `src/local-memory-store.js`, `src/knowledge-agent.js`, `src/runtime-explain-pipeline.js`, `src/provider-adapters.js`, `src/agent-service.js`, `src/local-gateway.js`, and tests under `test/`.
- Affected storage: Local Memory Store gains daily summary records, concept projection records or derived summary shapes, relation proposal/gate metadata, report snapshots, and indexes by date and canonical concept.
- Affected APIs: memory query packets gain policy-aware bridge fields; provider requests gain bounded memory bridge constraints; report endpoints or local runtime APIs expose daily and weekly reflection summaries.
- Affected runtime behavior: first explanation for a new concept may proceed with fast exact/session recall, while async relation discovery enriches future recall through day-indexed proposal and gated relation persistence.
- No browser-local memory graph, browser-side vector store, evidence snippet storage, full page storage, or automatic embedding-based relation creation is introduced.
