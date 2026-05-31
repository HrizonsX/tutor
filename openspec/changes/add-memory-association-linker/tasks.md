## 1. Store Model

- [ ] 1.1 Add memory association config defaults for active edge caps and related memory injection limits.
- [ ] 1.2 Extend Local Memory Store data with `memoryEdges` for in-memory mode.
- [ ] 1.3 Add SQLite `memory_edges` table, source/target/status indexes, schema version migration metadata, and load logic.
- [ ] 1.4 Implement edge normalization, evidence id clamping, evidence text hashing, self-loop rejection, and status defaults.
- [ ] 1.5 Implement edge upsert/deduplication that updates occurrence count, evidence ids, timestamps, and confidence.

## 2. Association Linker

- [ ] 2.1 Add a Runtime-owned Memory Association Linker module or store helper with relation types for structured terms, mentions, co-occurrence, user context, provider terms, and feedback.
- [ ] 2.2 Extract conservative associations from successful explanation versions, including structured `terms`, summary, and structured response fields.
- [ ] 2.3 Extract associations from runtime memory event `relatedConcepts` without adding browser-side graph behavior.
- [ ] 2.4 Add minimal-context extraction only through bounded conservative rules or existing concept candidate extraction.
- [ ] 2.5 Invoke linker after explanation version persistence and memory event persistence while preserving raw evidence first.

## 3. Retrieval And Summaries

- [ ] 3.1 Add bidirectional active edge lookup for memory queries using source and target canonical names.
- [ ] 3.2 Build `relatedMemories` entries with direction, relation type, confidence, evidence ids, summary, last seen timestamp, source role, and non-fact-source caution.
- [ ] 3.3 Keep exact target `priorExplanations`, feedback, cooldowns, and summaries separate from `relatedMemories`.
- [ ] 3.4 Enforce per-concept active edge caps and related memory injection limits using confidence, recency, and evidence strength.
- [ ] 3.5 Extend summarizer processing to maintain edge confidence/status and include high-value relationships in derived retrieval summaries.

## 4. Runtime And Provider Boundary

- [ ] 4.1 Ensure runtime explain provider requests include `memoryPacket.relatedMemories` when returned by memory retrieval.
- [ ] 4.2 Preserve exact-only `return_existing_explanation` policy so related prior explanations never skip provider calls.
- [ ] 4.3 Update request normalization to ignore browser-provided `relatedMemories`, `memoryEdges`, and other memory graph fields.
- [ ] 4.4 Update provider adapter prompt and field guide to label related memories as user history context only.
- [ ] 4.5 Preserve fact-sensitive cautions so related memories are never described as source material or verified facts.

## 5. Tests

- [ ] 5.1 Add linker tests for structured terms, event `relatedConcepts`, minimal context extraction, self-loop rejection, and relation types.
- [ ] 5.2 Add Local Memory Store tests for SQLite edge persistence across restart, deduplication, occurrence count, confidence updates, and caps.
- [ ] 5.3 Add retrieval tests for incoming, outgoing, bidirectional, empty, rejected, and bounded `relatedMemories`.
- [ ] 5.4 Add runtime pipeline tests showing related memories are injected into provider requests but do not trigger `return_existing_explanation`.
- [ ] 5.5 Add provider adapter tests asserting related memory field guide text and fact-sensitive non-source cautions.
- [ ] 5.6 Run the relevant test suite and update any snapshots or fixtures required by the new memory packet field.
