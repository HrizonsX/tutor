## Context

Browser Cognitive Overlay is a browser learning companion that sits on top of normal reading. It observes the page fragment the user is likely reading, combines reading behavior with concept difficulty and learning memory, and only intervenes when a low-interruption explanation is likely to help.

The product has three hard boundaries:

- It is not a chat-sidebar-first assistant.
- It is not a page summarizer.
- It is not an autonomous browser agent that clicks, browses, searches, or operates pages for the user.

The core architectural challenge is not only explanation generation. The system must decide when to stay silent, what exact concept to explain, and how to record feedback without overconfidently labeling the user.

## Goals / Non-Goals

**Goals:**

- Detect the current reading fragment across scrolling, viewport changes, text selection, and dynamic page updates.
- Observe behavior signals around the current fragment without treating any single signal as definitive confusion.
- Extract precise, context-bound concepts rather than generic keywords.
- Retrieve learning memory before explanation so prompts can avoid repetition and connect to recent concepts.
- Show short proactive explanations in a low-interruption overlay with optional expansion.
- Maintain event-first learning memory and derive uncertain learning signals from repeated patterns.
- Respect privacy by minimizing text processing and storage.

**Non-Goals:**

- Building a general chat sidebar as the primary interaction model.
- Automatically summarizing every page or every section.
- Automatically clicking links, searching the web, scrolling, filling forms, or operating pages.
- Declaring stable mastery or non-mastery from a single user action.
- Explaining every detected concept.

## Decisions

### Decision: Model the system as five cooperating capabilities

Use five capability boundaries: `reading-context`, `confusion-inference`, `concept-understanding`, `learning-memory`, and `cognitive-overlay`.

Rationale: The product needs separate contracts for observation, inference, explanation, memory, and UI. This keeps "when to intervene" independent from "how to explain" and prevents the overlay from becoming a thin wrapper around a chat completion.

Alternative considered: A single monolithic "assistant" capability. This was rejected because it hides the quietness, privacy, and memory-pollution constraints that make the product distinct.

### Decision: Current reading context is scored, not selected by one DOM rule

The reading context engine should score visible text blocks using viewport position, scroll direction, recency, selection proximity, readable text density, and dynamic content changes. It should attach lightweight metadata such as block type, approximate location, and stable fragment identity when possible.

Rationale: Pages differ widely, and one DOM rule will fail on articles, documentation, tutorials, papers, and dynamic apps.

Alternative considered: Use the largest visible paragraph. This fails for code-heavy tutorials, multi-column pages, and pages with sticky headers or sidebars.

### Decision: Confusion inference uses priority scoring with suppression signals

The inference layer should produce an intervention priority rather than a binary confused/not-confused label. It must combine content signals, behavior signals, and memory signals. Long dwell is only a weak signal and must not trigger by itself.

The policy should include positive signals such as concept density, repeated revisits, precise term selection, repeated pauses near the same concept, and weak-concept history. It should include suppression signals such as recent dismissal, recent explanation, inactivity, large selection, code selection, and paragraph cooldown.

Rationale: Mis-timed proactive help feels like interruption. A priority model makes it possible to tune for "quiet by default".

Alternative considered: Threshold on dwell time. This was rejected because long dwell can mean thinking, copying code, taking notes, being away, or slow reading.

### Decision: Concept extraction prefers phrase-level contextual concepts

The concept layer should extract candidate terms from the current context window, then rank and normalize them. It should prefer specific phrases and domain terms such as "policy gradient", "reward model", "KV cache", or "Mixture-of-Experts routing" over generic words such as "policy", "model", "cache", or "routing".

Rationale: Explaining the wrong granularity is worse than staying silent because it makes the assistant feel noisy and shallow.

Alternative considered: Keyword extraction over individual tokens. This was rejected because generic tokens are common in technical writing and do not reliably represent the user's actual obstacle.

### Decision: Learning memory is an event ledger with derived uncertain state

The memory layer should store objective events first: `explanation_shown`, `dismissed`, `expanded`, `concept_revisited`, `user_selected_term`, `repeated_confusion`, `recently_seen`, and `user_ignored_overlay`. Derived state such as `possibly_weak`, `possibly_familiar`, `needs_review`, `recently_explained`, and `low_intervention_preferred` should be computed from event patterns.

Rationale: User feedback is ambiguous. A dismissal does not mean mastery, and an expansion does not prove lack of understanding.

Alternative considered: Store direct labels like `mastered` or `does_not_understand` after individual interactions. This was rejected because it pollutes memory and causes future explanations to become confidently wrong.

### Decision: Explanations are generated after memory retrieval

Before generating a micro or expanded explanation, the system should retrieve the canonical concept, aliases, recent related topics, prior explanation events, weak/familiar signals, and cooldown state.

Rationale: The product's differentiation is continuity across reading sessions. Without retrieval, the overlay becomes a stateless web explainer.

Alternative considered: Generate from the current paragraph only. This was rejected because it cannot avoid repetition or provide useful concept bridges.

### Decision: Overlay UI is proactive but non-blocking

The overlay should show a short micro-explanation near the reading flow without covering the main text, allow close, and allow expansion into a richer explanation. It should not require opening a chat panel or switching focus away from the page.

Rationale: The primary experience is uninterrupted reading. The overlay is a small assistive layer, not the destination.

Alternative considered: Sidebar Q&A. This was rejected because it recreates the context-switching behavior the product is meant to remove.

## Risks / Trade-offs

- False positive interventions -> Require multi-signal inference, suppression signals, and cooldowns; tune toward fewer prompts.
- Over-generic concept extraction -> Prefer phrase-level domain terms, context windows, selected-term boosting, and alias normalization.
- Memory pollution -> Store event streams first and derive uncertain states; forbid single-action mastery labels.
- Privacy exposure -> Store concepts, events, fragment IDs, and derived state instead of full page text where possible; send only minimal context needed for analysis.
- Dynamic page fragility -> Use viewport rescoring and DOM mutation handling rather than static page parsing.
- Explanation repetition -> Retrieve recent memory and maintain concept and paragraph cooldowns before showing overlays.
- Latency -> Keep first intervention lightweight; cache concept candidates and memory lookups when possible.

## Migration Plan

This is a new capability set with no existing production data to migrate. Implementation should start behind an opt-in feature flag or development-only browser extension mode. Rollback can disable the overlay policy and stop event recording while preserving any local memory data for inspection.

## Open Questions

- Should learning memory be stored fully local in the browser for the MVP, or split between local event storage and backend model services?
- What exact thresholds define "short time" for dismissal cooldowns and "recently explained" cooldowns?
- Which page types are supported first: documentation, blogs, papers, tutorials, or all readable pages?
- Should users have explicit controls for sensitivity levels, or should the first version tune globally toward quietness?
