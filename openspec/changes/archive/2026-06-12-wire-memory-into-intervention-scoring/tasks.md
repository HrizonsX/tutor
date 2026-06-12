## 1. Config

- [x] 1.1 Add `inference.memoryContext` defaults (`enabled`, `ttlMs`, `timeoutMs`, `failureCooldownMs`, `maxEntries`) to `DEFAULT_CONFIG` and nested merge support in `mergeConfig`.

## 2. Content Runtime

- [x] 2.1 Add a bounded per-concept memory-context cache (TTL, in-flight dedup, max entries, global failure cooldown) that queries `memoryClient.queryMemory` with `allowSyncSummarize: false`.
- [x] 2.2 Await the fetch in `evaluate()` under the configured time budget before scoring, re-checking `featureEnabled` after the await.
- [x] 2.3 Feed `memoryPacket.feedbackEvents` into `classifyFactSensitivity` so prior inaccuracy feedback tightens fact-sensitivity.
- [x] 2.4 Build the learning context from the memory packet (derived signals, cooldowns union with the local dismissal tracker, profile hints, feedback events, prior explanations, related objects) and fall back to the ephemeral context when no packet is available.

## 3. Tests

- [x] 3.1 Marked-known memory suppresses a selection-triggered repeat prompt and no explanation request is dispatched.
- [x] 3.2 Weak-memory signal plus dwell triggers an explanation that dwell alone would not.
- [x] 3.3 Unavailable gateway degrades silently to current behavior and enters the failure cooldown (no repeated queries).
- [x] 3.4 Memory context is cached: repeated evaluates within the TTL issue a single query.
- [x] 3.5 Packet feedback events drive fact-sensitivity (marked-wrong to needs_source path).
- [x] 3.6 Existing suites stay green (clients without queryMemory keep pre-change behavior).

## 4. Verification

- [x] 4.1 Run the full suite and typecheck (`npm run check`).
- [x] 4.2 Update task status and archive the change with its delta spec.
