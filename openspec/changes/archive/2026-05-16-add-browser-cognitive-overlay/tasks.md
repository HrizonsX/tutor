## 1. Foundation

- [x] 1.1 Define the browser extension or injected overlay module structure for reading context, behavior observation, inference, concept understanding, memory, and overlay UI.
- [x] 1.2 Add feature-flag or development-mode wiring so the overlay can be enabled and disabled without affecting normal browsing.
- [x] 1.3 Define shared data contracts for reading fragments, behavior signals, canonical concepts, memory events, intervention scores, and overlay prompts.
- [x] 1.4 Add privacy guardrails for context window limits, event storage, and any model request payloads.

## 2. Reading Context And Behavior

- [x] 2.1 Implement visible text fragment discovery with viewport scoring and stable fragment identifiers where possible.
- [x] 2.2 Update current reading context on scroll, pause, viewport changes, selection changes, and DOM mutations.
- [x] 2.3 Classify fragment metadata such as paragraph, heading, list item, code block, or other readable content.
- [x] 2.4 Record dwell, revisit, selection, repeated pause, and reading rhythm signals for the active fragment.
- [x] 2.5 Detect suppressing behavior signals including inactivity, large text selection, large code selection, and possible copy or note-taking behavior.
- [x] 2.6 Add tests or fixtures for long articles, documentation pages, dynamic content updates, and code-heavy tutorials.

## 3. Concept Understanding

- [x] 3.1 Implement concept candidate extraction from the current fragment and its bounded context window.
- [x] 3.2 Rank candidates so phrase-level, domain-specific, selected, and context-bound concepts outrank generic words.
- [x] 3.3 Add concept boundary tests for examples such as policy gradient, reward model, KV cache, PPO clipping, KL divergence, and Mixture-of-Experts routing.
- [x] 3.4 Implement alias normalization for common variants such as KL div, Kullback-Leibler divergence, and KL divergence.
- [x] 3.5 Implement learning context retrieval for prior explanations, weak signals, recent topics, aliases, cooldowns, and related concepts.
- [x] 3.6 Implement micro-explanation generation that uses retrieved memory and stays short, intuitive, and context-specific.
- [x] 3.7 Implement expanded explanation generation covering meaning, role in the current paragraph, prerequisites, and related prior concepts.

## 4. Learning Memory

- [x] 4.1 Implement event-first memory storage for explanation_shown, dismissed, expanded, concept_revisited, user_selected_term, repeated_confusion, recently_seen, and user_ignored_overlay.
- [x] 4.2 Store canonical concept names, observed aliases, minimal context metadata, and concept associations for each relevant event.
- [x] 4.3 Derive uncertain memory signals such as possibly_weak, possibly_familiar, needs_review, recently_explained, and low_intervention_preferred from event patterns.
- [x] 4.4 Prevent single-action writes of mastered or does_not_understand states from dismissals, expansions, recent exposure, or ignored overlays.
- [x] 4.5 Add tests for memory pollution cases, including dismissal does not mean mastered and expansion does not prove lack of understanding.

## 5. Confusion Inference And Interruption Policy

- [x] 5.1 Implement intervention priority scoring from content signals, behavior signals, memory signals, and suppressing signals.
- [x] 5.2 Enforce the rule that long dwell alone cannot trigger an explanation.
- [x] 5.3 Enforce the rule that intervention priority requires at least one valid content signal and at least one valid behavior or memory signal.
- [x] 5.4 Apply cooldowns for recent dismissals, recently explained concepts, recently prompted paragraphs, and low-intervention preferences.
- [x] 5.5 Add tests for false-positive prevention cases including idle pages, large selections, code selection, recent dismissal, and ambiguous dwell.

## 6. Cognitive Overlay

- [x] 6.1 Implement a low-interruption overlay that avoids covering the main reading content and does not block scrolling or reading.
- [x] 6.2 Show proactive micro-explanations only when intervention policy selects a prompt.
- [x] 6.3 Allow users to close prompts and record dismissal events.
- [x] 6.4 Allow users to expand prompts into fuller explanations without opening a chat sidebar.
- [x] 6.5 Record expansion, dismissal, and ignored-overlay feedback for learning memory.
- [x] 6.6 Ensure the overlay never clicks, searches, scrolls, navigates, fills forms, or otherwise operates the page for the user.

## 7. Validation

- [x] 7.1 Add end-to-end scenarios for a user reading a technical article with a complex concept and receiving one appropriate micro-explanation.
- [x] 7.2 Add end-to-end scenarios confirming no prompt appears for long dwell alone, idle page state, large code selection, or recent dismissal cooldown.
- [x] 7.3 Add end-to-end scenarios confirming repeated concepts use memory to avoid duplicate basic explanations.
- [x] 7.4 Add end-to-end scenarios confirming related concepts can be bridged in a micro or expanded explanation.
- [x] 7.5 Review stored events and model payloads to confirm the implementation follows minimum necessary privacy constraints.
