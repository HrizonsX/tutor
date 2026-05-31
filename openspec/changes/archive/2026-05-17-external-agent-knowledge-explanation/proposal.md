## Why

The current overlay can still generate knowledge explanations from a local hardcoded concept library or fallback text. This makes the product appear knowledgeable when no external knowledge provider is configured, and it blurs the boundary between local learning memory and world knowledge.

This change moves knowledge explanation ownership to an external Agent/LLM while keeping local code responsible for quiet intervention policy, privacy trimming, user learning memory, and the browser extension user experience.

## What Changes

- **BREAKING**: Local hardcoded concept definitions and fallback templates must no longer be used to generate production knowledge explanations.
- Add a background service worker mediation layer for all external Agent/LLM and embedding calls.
- Send selected text, minimal surrounding context, retrieval packet summaries, user memory hints, and the request goal to the external Agent through the background service worker.
- Require the external Agent to return structured results, including availability status, micro explanation, ambiguity, rewrite output, fact-sensitivity metadata, and explanation version metadata.
- Allow external providers to be unconfigured; in that state the system must stay quiet for proactive explanations and must not fabricate knowledge content.
- Keep local learning memory as the owner of user learning state: seen objects, feedback, explanation versions, preferences, mute settings, summaries, and optional embedding vectors.
- Store local memory and optional vectors in IndexedDB rather than treating page-local storage as the long-term memory layer.
- Support optional embedding providers for similar-memory retrieval; when unavailable, retrieval must fall back to exact object, alias, recency, feedback, cooldown, and explanation-history signals.
- Keep content scripts from calling LLM, embedding, or Agent APIs directly.

## Capabilities

### New Capabilities

- `background-service-mediation`: Mediates external Agent/LLM and embedding services from the background service worker, including provider configuration, API keys, permissions, privacy policy, timeout, cache, rate-limit, and error handling.

### Modified Capabilities

- `concept-understanding`: Local concept logic changes from owning explanations to selecting and packaging explanation targets for an external Agent.
- `short-explanation-composer`: Explanation and rewrite generation changes from local fallback-capable composition to structured external Agent results with no knowledge fallback when unavailable.
- `learning-memory`: Local memory changes to IndexedDB-backed learning state and retrieval packets, with optional embedding vectors and no use as a world-knowledge source.
- `cognitive-overlay`: Overlay display changes to render only available Agent-returned explanation versions and to fail quietly or non-blockingly when provider access is unavailable.

## Impact

- Affects browser extension architecture: `manifest.json`, content script messaging, new background service worker modules, provider configuration, and host permissions.
- Affects explanation generation modules, tests, and contracts that currently expect local fallback explanations.
- Affects memory persistence and retrieval by introducing IndexedDB stores for events, explanation versions, summaries, preferences, and optional vectors.
- Affects privacy controls because outbound Agent requests must be constructed centrally with minimal context and sanitized memory summaries.
- Affects tests for provider-unavailable behavior, content/background separation, structured Agent contracts, and embedding-disabled retrieval.
