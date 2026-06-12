## Why

The confusion-inference spec requires intervention scoring to combine content, behavior, learning-memory, and profile signals, and `scoreIntervention` already implements the memory side: `possibly_weak` raises priority, `recently_marked_known` and muting suppress, profile hints steer style and difficulty. But the production content runtime always passes an ephemeral learning context with empty `derivedSignals`, empty `profileHints`, and only a locally tracked dismissal cooldown (`createEphemeralLearningContext` in `src/extension/content.js`). Every memory- and profile-weighted branch in the scorer is dead in production: repeat prompts are not suppressed by marked-known feedback across pages, weak-memory concepts get no priority boost, muted categories only work within one page session, and prior `marked_wrong` feedback never tightens fact-sensitivity.

The data already exists. The gateway memory store derives exactly these fields per concept (`deriveSignals`, `deriveCooldowns`, `deriveProfileHints` feed `queryMemory`'s memory packet), and the full transport chain — content `memoryClient.queryMemory` → background `QUERY_MEMORY` message → gateway `POST /memory/query` — is wired and tested. Nothing consumes it on the scoring path.

## What Changes

- The content runtime queries gateway memory for the active top concept before scoring, through the existing background memory channel, and maps the returned memory packet's derived signals, cooldowns, profile hints, feedback events, prior explanations, and related objects into the learning context passed to `scoreIntervention`.
- Fact-sensitivity classification consumes the packet's feedback events, so prior `marked_wrong` feedback yields `needs_source` per the existing classifier rules.
- Memory context acquisition is bounded: per-concept TTL cache, in-flight deduplication, a hard wait budget per evaluation pass, a global failure cooldown when the gateway is unavailable, and a bounded cache size. All knobs live in browser config under `inference.memoryContext`.
- Degradation is silent and complete: when the gateway is unreachable, unpaired, slow, or the client lacks a memory query channel, scoring falls back to the existing ephemeral learning context with unchanged behavior.
- Local in-page cooldowns (recent dismissal) merge with gateway-derived cooldowns as a union; neither side can clear the other's suppression.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `confusion-inference`: Add requirements for runtime memory-context acquisition in the browser scoring path — sourcing from the gateway memory repository, bounded caching and rate behavior, silent degradation, and feedback-aware fact-sensitivity.

## Impact

- `src/extension/content.js`: memory-context fetch + cache, learning-context construction from the memory packet, reordered fact-sensitivity classification.
- `src/shared/config.js`: `inference.memoryContext` defaults and nested merge.
- `test/content.test.js`: new scoring scenarios (marked-known suppression, weak-memory boost, unavailable degradation, cache behavior, feedback-driven fact sensitivity).
- No gateway, protocol, or storage changes; no new message types; no new endpoints.
