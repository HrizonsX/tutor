## Context

The current extension has a strict local gateway direction for provider calls, but browser content/background code still carries memory responsibilities from earlier iterations. The content script can create browser storage, instantiate learning memory and profile objects, derive retrieval packets, write explanation versions, and fall back to browser-local memory when gateway memory is unavailable. Current specs also allow IndexedDB fallback and browser-local degraded memory packets.

The target boundary is stricter:

```text
Page/content script -> Background broker -> Gateway / Local Agent Runtime
       UI state              transport              memory + provider runtime
```

The browser extension senses page context, forwards requests, displays results, and reports interaction events. The Gateway / Local Agent Runtime owns durable and derived memory, user profile, concept familiarity, explanation preferences, summarizer work, and provider request preparation.

## Goals / Non-Goals

**Goals:**

- Remove browser-local memory cache, repository, profile storage, explanation-history storage, and vector storage from the extension runtime path.
- Make Gateway / Local Agent Runtime the only source of truth for memory query, memory write, profile derivation, summarization, concept familiarity, and memory injection.
- Keep browser explain/rewrite request payloads limited to immediate context and current interaction data.
- Return structured unavailable/degraded states when the gateway or runtime memory capability is unavailable.
- Preserve ephemeral UI/runtime state that is necessary for current-page interaction.

**Non-Goals:**

- Remove the Local Memory Store or Memory Summarizer from the gateway/runtime.
- Add cloud sync, account identity, or remote memory services.
- Automatically migrate old browser IndexedDB memory as part of normal extension startup.
- Remove short-lived provider health caching or request de-duplication that does not contain user memory.
- Redesign the overlay UI beyond unavailable/degraded behavior required by this boundary.

## Decisions

### Decision: Browser memory fallback is removed, not reclassified

The extension will not keep a browser-local memory repository as a degraded fallback. If gateway memory write/query fails, background returns a structured unavailable result and diagnostics identify the gateway/runtime memory issue.

Rationale: A degraded browser cache still becomes a competing memory authority after refresh or restart. The product boundary requires one source of truth.

Alternative considered: keep IndexedDB fallback but mark packets as degraded. This preserves continuity, but fails the requirement that refresh/restart must not retain memory-related data in the plugin.

### Decision: Content script records events by forwarding, not storing

Overlay dismissals, expansions, feedback, regeneration requests, explanation shown events, paragraph prompted events, and selection/encounter events are sent to background/gateway as structured events. The content script may keep the event object only long enough to update UI or link the current request.

Rationale: The browser still observes the interaction first, but it should not own the memory ledger or derived state.

Alternative considered: let content script update an in-memory `LearningMemory` instance and mirror to gateway. That reintroduces a page-lifetime memory cache and can diverge from runtime summaries.

### Decision: Explain and rewrite requests contain immediate context only

Browser-to-gateway explain requests include selected text, target identity, current fragment, URL/title metadata, language when available, DOM/page context needed for this request, and the current operation. Rewrite requests may include the current previous explanation version and current feedback event. They do not include browser-computed memory packets, profile hints, prior explanations, concept familiarity, or feedback history.

Rationale: Personalization must come from the runtime injecting memory after querying the authoritative store.

Alternative considered: keep browser-computed retrieval packets as hints. This creates ambiguity about whether the provider saw runtime memory or stale browser memory.

### Decision: Runtime-internal provider requests may remain memory-rich

The gateway may build an internal Agent request that includes sanitized memory packets, profile hints, prior version metadata, and explanation preferences. That memory-rich request is created only inside Gateway / Local Agent Runtime after authoritative memory query.

Rationale: The user-facing behavior still needs personalization and repetition control; only the ownership boundary changes.

Alternative considered: remove memory packets from the Agent protocol entirely. That would force providers to query memory ad hoc and would disrupt existing runtime adapter contracts.

### Decision: Ephemeral browser state is allowed only for current interaction

Browser state may include overlay visibility, currently selected text, current fragment, pending request state, abort controllers, debounce timers, loading/error state, temporary displayed result, and runtime diagnostics needed to show availability. This state must not be persisted or reused after page refresh/browser restart as memory.

Rationale: A stateless interaction layer still needs ordinary UI state to be usable.

Alternative considered: prohibit all browser-side objects that mention concepts or feedback. That is too strict for a UI because the current prompt needs target/version identifiers to report user actions.

### Decision: Existing browser memory migration is out of runtime scope

Old IndexedDB memory is not read during normal extension operation. If importing old browser memory becomes necessary, it should be an explicit migration utility or separate OpenSpec change, with clear user action and runtime ownership.

Rationale: Automatic migration requires reading old browser memory at startup, which makes the browser extension a memory source during the new runtime path.

Alternative considered: silently migrate old IndexedDB data to gateway on first run. This complicates privacy expectations and violates the "no browser memory fallback" acceptance criteria.

## Risks / Trade-offs

- Gateway unavailable means no memory-enhanced explanation -> proactive overlay stays silent and explicit actions return structured unavailable states.
- Removing browser fallback may lose continuity for users with existing IndexedDB memory -> document that old browser memory is not used; handle import as a separate explicit migration if needed.
- Runtime must now support all personalization paths -> keep gateway memory injection tests for explain/rewrite and health diagnostics that explain missing memory capability.
- Some inference currently depends on browser-derived cooldown/profile signals -> move durable cooldown/profile decisions behind gateway or limit browser policy to immediate page behavior.
- Test churn will be significant -> update tests around the new boundary rather than preserving old fallback assertions.

## Migration Plan

1. Remove browser memory configuration defaults and replace memory repository mode with gateway-only or unavailable state.
2. Refactor content script to stop importing browser storage, memory repository, learning memory, and profile modules.
3. Update content script and overlay flows to forward current interaction events to background/gateway without local persistence.
4. Refactor background memory write/query to call only the local gateway and return unavailable on failure.
5. Ensure explain/rewrite browser payloads exclude memory packets and profile hints, while gateway injects runtime memory before provider dispatch.
6. Remove or relocate browser IndexedDB/vector storage and browser memory repository tests.
7. Add regression tests for refresh/restart no-memory retention, gateway unavailable behavior, and browser request-shape constraints.

Rollback: restore the previous change set only as a development fallback if gateway-only memory blocks all testing. Do not ship a runtime that silently falls back to browser memory.

## Open Questions

- Should old browser IndexedDB memory be ignored permanently, or should a future explicit import tool be offered?
- Should proactive candidate ranking call a gateway policy endpoint before requesting explanation, or should browser ranking remain based only on immediate reading/behavior signals?
- What exact UI copy should explicit manual actions show when the Agent Runtime is unavailable?
