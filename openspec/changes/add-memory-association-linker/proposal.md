## Why

Current runtime memory retrieval reuses exact target history, but it cannot bring in weakly related learning history when the user later asks about a connected concept. This limits continuity: after explaining "Lai Qingde" with "Taiwan" in the explanation, a later "Taiwan" request has no way to know the user recently encountered "Lai Qingde" as related context.

## What Changes

- Add a Runtime-owned Memory Association Linker that extracts weak concept-to-concept associations from successful explanation results, structured provider terms, memory event `relatedConcepts`, minimal page context, and selected feedback events.
- Persist association evidence as local `memory_edges` records with source/target canonical names, relation type, confidence, evidence ids, status, and timestamps.
- Extend memory retrieval so exact target memory is still primary, while bounded `relatedMemories` are returned from active bidirectional edges.
- Ensure related memories are labeled as user learning context only, never as factual authority or a substitute for provider/source-aware judgment.
- Keep browser extension code out of association graph creation, caching, and retrieval.
- Keep first-stage linking rule-based, conservative, bounded, and local-only; no embeddings, cloud services, strong entity disambiguation, or browser-side graph cache are required.

## Capabilities

### New Capabilities
- `memory-association-linker`: Defines rule-based weak association extraction, edge lifecycle, related memory retrieval semantics, confidence handling, and fact-source cautions.

### Modified Capabilities
- `local-memory-store`: Persist `memory_edges` in SQLite/local store, deduplicate and cap active edges, and return bounded `relatedMemories` in retrieval packets.
- `learning-memory`: Treat associations and related memories as uncertain user learning history, not world knowledge or exact explanation reuse.
- `local-agent-memory-gateway`: Require Gateway / Local Agent Runtime ownership for edge creation, retrieval, and provider request injection while forbidding browser-side graph ownership.
- `provider-adapter-structured-json`: Mark `relatedMemories` in provider prompts as historical user context only and caution providers not to use it as a fact source.

## Impact

- Affected code: `src/local-memory-store.js`, `src/knowledge-agent.js`, `src/runtime-explain-pipeline.js`, `src/provider-adapters.js`, and tests under `test/`.
- Affected storage: local SQLite schema adds a `memory_edges` table and indexes for source/target lookup; in-memory test store mirrors the same model.
- Affected APIs: memory query packets and provider requests gain a bounded `relatedMemories` field.
- No new cloud service, browser storage dependency, embedding dependency, or browser plugin memory graph is introduced.
