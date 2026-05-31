## Context

Browser Cognitive Overlay currently has local modules that identify knowledge objects, retrieve learning memory, and compose explanations. The existing contract already separates intervention policy from explanation text, but production code can still fall back to local hardcoded definitions and template explanations when no model client is configured.

The new boundary is stricter: local browser code may observe reading behavior, select candidate targets, retrieve user learning state, and display returned explanation versions, but it must not act as the source of world knowledge. External Agent/LLM providers own knowledge explanation, ambiguity handling, and rewrite generation. Because this is a browser extension, all external service calls must be mediated by the Manifest V3 background service worker rather than content scripts.

## Goals / Non-Goals

**Goals:**

- Move production knowledge explanation, ambiguity judgment, and rewrite generation to an external Agent/LLM.
- Keep proactive intervention quiet and locally testable: local policy still decides whether a candidate is worth asking about.
- Build privacy-trimmed Agent requests from selected text, minimal context, request goal, and local learning-state summaries.
- Support unconfigured providers without fabricating knowledge explanations.
- Store learning events, explanation versions, preferences, summaries, and optional embedding vectors locally in IndexedDB.
- Ensure content scripts never call external Agent/LLM or embedding APIs directly.

**Non-Goals:**

- Building a chat sidebar, general page summarizer, or autonomous browser agent.
- Implementing full web search or source-verification browsing in this change.
- Treating local memory summaries, prior explanations, or embeddings as authoritative world knowledge.
- Requiring an embedding provider for the memory system to work.
- Removing all test fixtures; fixtures may remain for contract tests and development-only demos.

## Decisions

### Decision: Background service worker is the only external-service gateway

Content scripts send local observation and policy inputs to the background service worker. The background worker owns provider configuration, API keys, host permissions, request construction, privacy trimming, timeout, cache, rate-limit, and error handling for Agent/LLM and embedding calls.

Rationale: Content scripts run in page contexts and have a larger exposure surface. Centralizing external calls makes it possible to audit outbound data, protect secrets, and test failure behavior consistently.

Alternative considered: Let content scripts call provider endpoints directly. This is simpler but exposes API details to page-adjacent code and makes privacy policy harder to enforce.

### Decision: Agent responses are structured, not free-form text

The background worker accepts only structured Agent responses with status, target identity, micro explanation, ambiguity details, rewrite output, fact-sensitivity metadata, and explanation version metadata. The overlay renders explanation text only when the response status is available and contains a valid explanation version.

Rationale: The product needs to distinguish unavailable provider, ambiguous target, unsafe fact-sensitive output, and successful explanation without guessing from prose.

Alternative considered: Ask the model for a plain string. This keeps the first request simple but makes error handling, version tracking, and ambiguity behavior fragile.

### Decision: Provider unavailability never creates knowledge fallback text

When the external Agent provider is unconfigured, disabled, timed out, rate-limited, or returns an unusable response, proactive explanations remain silent. Explicit user actions such as regenerate or manual explain may show a compact non-blocking unavailable state, but the system must not synthesize a knowledge explanation locally.

Rationale: A quiet failure is less harmful than pretending the local extension has knowledge it does not have.

Alternative considered: Keep local hardcoded fallback definitions for common concepts. This undermines the external-Agent boundary and creates inconsistent accuracy expectations.

### Decision: Local memory is learning state, not a knowledge base

Local IndexedDB stores events, explanation versions, feedback, preferences, mute settings, summaries, and optional vectors. Retrieval packets describe what the user has encountered and how they responded; they do not assert the meaning of the selected term except as prior explanation history.

Rationale: This preserves continuity and personalization while avoiding memory pollution and false authority.

Alternative considered: Store curated definitions locally as memory summaries. This would conflate user history with world knowledge and could later surface stale or incorrect explanations.

### Decision: Embeddings are optional enhancement

If an embedding provider is configured, the background worker may request embeddings for sanitized memory summaries and store vectors locally in IndexedDB. If embedding is unavailable, retrieval uses exact object identity, observed aliases, recent events, feedback, cooldowns, and explanation history.

Rationale: Similar-memory retrieval can improve continuity, but the core product should still work offline or without an embedding key.

Alternative considered: Require embeddings for all retrieval. This would make a local-first learning memory dependent on an external provider and increase latency.

### Decision: Fixtures may remain outside production explanation paths

Small local fixture datasets may remain for tests, deterministic development cases, and contract validation. Runtime production explanation paths must not read fixtures to generate knowledge explanations.

Rationale: Tests need deterministic examples, but production behavior must match the external-Agent contract.

Alternative considered: Delete all local concept fixtures immediately. This increases churn and removes useful contract-test scaffolding without improving the production boundary by itself.

## Risks / Trade-offs

- Provider latency may make overlays feel slow -> Keep local policy and memory retrieval fast, use request timeouts, cache successful version metadata, and fail quietly.
- Provider outages may reduce visible help -> Proactive paths stay silent, while explicit actions can show a compact unavailable state.
- Agent output may be malformed -> Validate structured responses before display and record only valid explanation versions.
- Privacy exposure through outbound context -> Construct all Agent requests in background with strict context limits, sanitized memory summaries, and no full-page text.
- IndexedDB migration complexity -> Introduce a storage adapter with localStorage compatibility tests during transition, then migrate persisted data once the adapter is stable.
- Similarity retrieval may feel worse without embeddings -> Keep exact/alias/recency retrieval strong and treat embeddings only as an additive ranking signal.

## Migration Plan

1. Add background service worker scaffolding, message contracts, provider configuration, and unavailable-provider responses behind existing feature flags.
2. Introduce an IndexedDB-backed memory adapter and migrate learning events, explanation versions, profile preferences, summaries, and mute settings from current storage.
3. Replace production local explanation calls with background Agent requests and structured response validation.
4. Remove production use of hardcoded definition fallback text while preserving fixtures for tests and development-only paths.
5. Add optional embedding request mediation and vector storage, with exact/alias/recency retrieval as the default fallback.
6. Update overlay behavior to render Agent explanation versions only and to show non-blocking unavailable states for explicit actions.
7. Roll back by disabling provider-backed explanation requests and keeping local memory data intact; the overlay should remain quiet rather than falling back to local explanations.

## Open Questions

- Which provider configuration surface should be used first: extension options page, development config object, or browser storage settings?
- Should ambiguous Agent responses display a clarification state in explicit user flows, or remain silent until a clearer candidate is selected?
- What exact cache key should be used for Agent responses: target identity plus fragment hash, or target identity plus request goal and memory summary hash?
