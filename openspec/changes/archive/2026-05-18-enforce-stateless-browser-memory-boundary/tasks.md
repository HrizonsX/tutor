## 1. Browser Memory Removal

- [x] 1.1 Remove browser memory defaults from extension runtime config, including IndexedDB backend, browser repository mode, learning key, profile key, and browser memory database settings.
- [x] 1.2 Refactor content startup to stop importing and constructing browser storage, browser memory repository, `LearningMemory`, and `UserReadingProfile`.
- [x] 1.3 Remove browser-side explanation version persistence, learning context construction, profile hint derivation, concept familiarity derivation, and retrieval packet assembly from content flows.
- [x] 1.4 Remove or isolate browser memory repository and IndexedDB/vector storage modules so they are not part of the extension runtime path.

## 2. Stateless Browser Request Flow

- [x] 2.1 Define the browser-to-gateway explain request shape with only target identity, selected text, current fragment, URL/title metadata, language when available, DOM context, request goal, and constraints.
- [x] 2.2 Define the browser-to-gateway rewrite request shape with current previous-version metadata and current feedback event only.
- [x] 2.3 Update composer/content calls so browser requests do not include browser-computed retrieval packets, profile hints, prior explanations, feedback history, or concept familiarity.
- [x] 2.4 Preserve only ephemeral UI/runtime state such as overlay visibility, current prompt, pending request state, abort controllers, loading/error state, debounce timers, and temporary displayed results.

## 3. Gateway-Only Memory Mediation

- [x] 3.1 Refactor background memory event writes to call only the local gateway memory API.
- [x] 3.2 Refactor background memory queries to call only the local gateway memory API.
- [x] 3.3 Return structured unavailable or degraded-memory results when gateway memory write/query is unavailable, without browser-local fallback.
- [x] 3.4 Update diagnostics to report gateway/runtime memory availability without exposing or storing browser-local memory payloads.

## 4. Runtime Memory Injection

- [x] 4.1 Ensure gateway `/explain` queries runtime-owned memory and injects sanitized memory context before provider adapter dispatch.
- [x] 4.2 Ensure gateway `/rewrite` uses runtime-owned prior version metadata, explanation preference summaries, and current feedback evidence before provider adapter dispatch.
- [x] 4.3 Ensure gateway ignores any browser-provided memory packet, profile hint, prior-history, derived-summary, or concept-familiarity fields.
- [x] 4.4 Ensure Local Memory Store and Memory Summarizer remain the owners of durable events, derived profile hints, concept state, cooldowns, explanation preferences, vectors, and migration metadata.

## 5. Overlay And Feedback Behavior

- [x] 5.1 Update overlay feedback handlers to forward dismiss, expand, known, confusing, wrong, mute, clear, and regenerate events without local memory persistence.
- [x] 5.2 Update regenerate handling to send current previous-version and feedback metadata without browser retrieval packets.
- [x] 5.3 Keep proactive overlay silent when gateway/provider/runtime/memory capability is unavailable.
- [x] 5.4 Show a compact non-blocking unavailable state for explicit regeneration or manual explanation when runtime-enhanced explanation is unavailable.

## 6. Tests

- [x] 6.1 Remove or rewrite tests that assert browser memory repository, IndexedDB fallback, browser migration, browser profile persistence, or browser vector storage behavior.
- [x] 6.2 Add content/background tests proving no browser storage or memory repository is constructed for memory data.
- [x] 6.3 Add request-shape tests proving explain and rewrite payloads omit memory packets, profile hints, prior histories, feedback histories, and concept familiarity.
- [x] 6.4 Add gateway unavailable tests proving memory write/query/explain/rewrite do not fall back to browser-local memory.
- [x] 6.5 Add gateway runtime tests proving memory injection still occurs inside Gateway / Local Agent Runtime before provider adapter dispatch.
- [x] 6.6 Add refresh/restart simulation tests proving the extension does not retain memory-related data across page refresh or browser restart.

## 7. Verification

- [x] 7.1 Run the relevant unit tests for content, background, gateway, memory, overlay, and provider request flows.
- [x] 7.2 Run the full test suite with `npm test`.
- [x] 7.3 Search the browser extension runtime path for forbidden memory storage usage, including IndexedDB, localStorage, sessionStorage, chrome storage, browser memory repository, profile storage, and learning memory cache.
- [x] 7.4 Smoke test `npm run gateway:stub` and confirm unavailable/degraded states behave correctly when the gateway or memory capability is unavailable.
