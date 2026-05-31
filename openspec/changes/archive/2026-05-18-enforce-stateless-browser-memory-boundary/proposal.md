## Why

The browser extension currently still contains browser-local learning memory, profile storage, IndexedDB fallback, and degraded memory cache behavior. This conflicts with the target architecture where the browser is a stateless interaction layer and the Gateway / Local Agent Runtime is the single source of truth for memory, personalization, summarization, profile, and concept familiarity.

## What Changes

- **BREAKING**: Browser extension code must not use IndexedDB, localStorage, sessionStorage, chrome storage, or in-memory objects as a memory cache for learning history, profile, explanation history, feedback history, concept familiarity, preference summaries, or derived memory views.
- **BREAKING**: Browser-local memory repository, browser memory fallback, browser learning-memory migration, and browser vector/similarity storage are removed from the extension runtime path.
- Explain and rewrite requests from the extension include only immediate request context, such as selected text, target identity, page fragment, URL/title metadata, language, current DOM context, previous explanation for the current rewrite, and the current user action.
- Gateway / Local Agent Runtime owns all memory reads, writes, merges, summarization, profile derivation, concept familiarity, explanation preference updates, and memory injection into provider requests.
- Browser feedback and interaction events are forwarded to the gateway memory/event API; the browser does not persist or summarize them locally.
- If Gateway / Local Agent Runtime is unavailable or lacks memory capability, the extension returns a structured degraded or unavailable state and must not fall back to old local memory.
- Browser state remains limited to ephemeral UI/runtime state for the current page interaction, such as overlay visibility, selected text, pending request state, abort controllers, loading/error state, and temporary displayed results.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `learning-memory`: Remove browser-local repository fallback, IndexedDB/vector storage, browser-side retrieval packet construction, and browser-managed memory migration from the runtime memory contract.
- `local-agent-memory-gateway`: Clarify that Gateway / Local Agent Runtime is the only memory source of truth and that gateway unavailability must not trigger browser-local memory fallback.
- `background-service-mediation`: Require background to forward only immediate context and memory events to the gateway, without local memory query/write fallback or browser-side summary/profile assembly.
- `agent-provider-architecture`: Separate browser-to-gateway request context from runtime-internal memory-injected provider requests.
- `cognitive-overlay`: Limit overlay state to ephemeral UI state and require unavailable/degraded handling when memory-enhanced runtime explanation is unavailable.
- `user-reading-profile`: Clarify that profile derivation, storage, clearing, and policy application are maintained by Gateway / Local Agent Runtime, not by browser-local profile storage.

## Impact

- Affected browser code: `src/content.js`, `src/agent-service.js`, `src/config.js`, `src/memory-repository.js`, `src/indexeddb-storage.js`, browser diagnostics, and content/background tests.
- Affected runtime code: gateway memory event/query handling, explain/rewrite request preparation, Local Memory Store, Memory Summarizer, runtime profile derivation, and health/diagnostics status.
- Affected tests: browser memory repository tests, IndexedDB storage tests, content-script memory tests, background fallback tests, gateway unavailable tests, explain/rewrite request-shape tests, and runtime memory injection tests.
- Migration impact: any existing browser IndexedDB memory is no longer used as runtime fallback. If migration is desired, it must be handled by an explicit non-runtime migration tool or separate change rather than automatic extension fallback.
