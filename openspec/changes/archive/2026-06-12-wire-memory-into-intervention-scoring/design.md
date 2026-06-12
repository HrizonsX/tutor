## Context

`evaluate()` runs on a 3-second interval plus debounced DOM/selection triggers, serialized by the `evaluating` flag. Any memory lookup on this path must be cheap in steady state and must never stall or break the loop when the gateway is down. The scorer can flip decisions in both directions on memory evidence (suppress via `recently_marked_known`/muting, trigger via `possibly_weak` even without behavior signals), so the lookup has to happen before scoring, not opportunistically after.

## Decisions

### Fetch placement and ordering

Fetch the memory packet right after the top candidate is extracted, before fact-sensitivity classification, so the classifier can consume `memoryPacket.feedbackEvents`. Order inside `evaluate()`: top candidate → memory packet (bounded await) → feature-enabled re-check (hot disable during the await) → `classifyFactSensitivity` with packet feedback → encounter event write → learning context → `scoreIntervention`.

### Bounded await, not fire-and-forget

A purely async cache-warming design would miss the first scoring pass per concept — exactly the pass triggered by an explicit selection, where marked-known suppression matters most. Instead the evaluation awaits the fetch with a hard budget (`timeoutMs`, default 400ms): on timeout the pass scores with the ephemeral context while the fetch keeps running and settles into the cache for the next pass. Localhost queries answer in single-digit milliseconds; the budget only matters when the gateway is wedged.

### Cache shape

Per-concept entry `{ packet, fetchedAt, promise }` in a Map bounded by `maxEntries` (evict oldest `fetchedAt`). TTL (`ttlMs`, default 60s) trades staleness for load: at most one query per concept per minute regardless of evaluate frequency. In-flight requests are deduplicated through the stored promise. A single global failure timestamp (`failureCooldownMs`, default 30s) suppresses all queries after an unavailable/error result so an unpaired or stopped gateway costs one failed roundtrip per cooldown window, not one per concept per pass.

### Degradation contract

`null` packet (disabled, no `queryMemory` channel, cooldown, timeout, unavailable, thrown error) always falls back to `createEphemeralLearningContext` — the exact pre-change behavior. Existing tests that stub clients without `queryMemory` therefore stay green by construction.

### Cooldown merge

Gateway cooldowns (`recentDismissal`, `recentlyExplained`, `paragraph` from `deriveCooldowns`) and the local in-page dismissal tracker merge as a logical union. The local tracker reacts instantly (the gateway only learns about a dismissal after the event batch flushes); the gateway remembers across pages and reloads. Neither may overwrite the other's `true`.

### What this change does not do

No new background message types, no gateway changes, no streaming of memory state, no profile injection into the composer input (the gateway already injects memory into explain requests server-side and strips browser-provided memory fields — sending packet fields with the explain request would be dead weight). `relatedConcepts` from the packet flow only into the existing event-context field that previously carried an empty array.
