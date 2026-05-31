## 1. Contracts And Configuration

- [x] 1.1 Define structured Agent request and response contracts, including status, target identity, micro explanation, ambiguity metadata, rewrite metadata, fact-sensitivity metadata, and explanation version metadata.
- [x] 1.2 Add provider configuration contracts for Agent/LLM and optional embedding services, including unavailable-provider states.
- [x] 1.3 Update runtime configuration defaults so provider-backed explanation is opt-in and unconfigured providers produce structured unavailable results.

## 2. Background Service Mediation

- [x] 2.1 Add a Manifest V3 background service worker entry and route content-script messages through it for explanation and embedding requests.
- [x] 2.2 Implement background Agent request construction with selected text, minimal surrounding context, sanitized retrieval packet summary, user memory hints, request goal, and privacy limits.
- [x] 2.3 Implement provider credential access in background only, with no credential exposure to content scripts.
- [x] 2.4 Add timeout, rate-limit, cache, and structured error handling for Agent requests.
- [x] 2.5 Add optional embedding request mediation through background with structured unavailable results when embeddings are not configured.

## 3. IndexedDB Learning Memory

- [x] 3.1 Implement an IndexedDB storage adapter for learning events, explanation versions, profile preferences, mute settings, agent summaries, and optional vectors.
- [x] 3.2 Migrate existing local storage memory/profile data into the IndexedDB adapter without losing event history.
- [x] 3.3 Update retrieval packet construction so it uses local learning state only and does not assert fresh world-knowledge definitions.
- [x] 3.4 Add embedding-enabled similar-memory retrieval that stores sanitized summary vectors locally when available.
- [x] 3.5 Add embedding-disabled retrieval fallback using exact object, alias, recency, feedback, cooldown, and explanation-history signals.

## 4. Explanation Flow Refactor

- [x] 4.1 Remove production use of hardcoded concept definitions and local fallback templates for micro, expanded, and regenerated knowledge explanations.
- [x] 4.2 Keep local candidate selection and policy ranking, but package selected targets for background Agent explanation instead of local answer generation.
- [x] 4.3 Validate Agent responses before creating explanation versions or displaying overlay content.
- [x] 4.4 Preserve local fixture definitions only for tests or development-only demos outside production explanation paths.

## 5. Overlay Behavior

- [x] 5.1 Render overlay knowledge cards only when a valid Agent-returned explanation version is available.
- [x] 5.2 Record displayed Agent explanation versions and link feedback events to those versions.
- [x] 5.3 Keep proactive provider-unavailable results silent.
- [x] 5.4 Show compact non-blocking unavailable state for explicit regenerate or manual explain actions while preserving the existing explanation.

## 6. Tests And Verification

- [x] 6.1 Add contract tests for structured Agent success, ambiguity, invalid response, timeout, and provider-unavailable results.
- [x] 6.2 Add tests proving content scripts do not call Agent/LLM or embedding APIs directly.
- [x] 6.3 Add tests proving unconfigured providers do not produce local knowledge fallback text.
- [x] 6.4 Add IndexedDB memory tests for events, versions, preferences, summaries, mute settings, agent summaries, and optional vectors.
- [x] 6.5 Add retrieval tests for embedding-enabled similarity and embedding-disabled exact/alias/recency fallback.
- [x] 6.6 Add overlay tests for valid Agent explanations, proactive silence when unavailable, and non-blocking explicit unavailable states.
- [x] 6.7 Run the full test suite and OpenSpec validation for `external-agent-knowledge-explanation`.
