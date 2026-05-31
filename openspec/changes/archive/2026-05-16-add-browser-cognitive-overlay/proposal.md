## Why

Learners reading technical web content often lose flow when they must copy text, switch to a chat app, ask for help, and return to the page. Browser Cognitive Overlay reduces that switching cost by attaching a quiet, proactive explanation layer to the user's normal reading flow.

The product should not become a chat sidebar, page summarizer, or autonomous browser agent. Its core value is timely, low-interruption micro-explanations that use reading context, behavior signals, and learning memory to decide when to help and when to stay silent.

## What Changes

- Add browser reading context detection that identifies the content fragment the user is most likely reading as the viewport, selection, scroll position, and page content change.
- Add reading behavior observation for dwell, revisits, selections, repeated pauses near concepts, inactivity, large selections, and code-focused interactions.
- Add confusion inference that combines content, behavior, and learning memory instead of relying on any single signal.
- Add false-positive prevention rules so long dwell, large text/code selection, inactive pages, and recent dismissals do not trigger explanations by themselves.
- Add precise contextual concept extraction that favors concrete phrase-level domain terms over generic words, with alias normalization for common variants.
- Add learning memory as an event-first model that records explanations, dismissals, expansions, revisits, repeated confusion, recent exposure, and concept associations.
- Add learning context retrieval before explanation generation to avoid repetition, adapt explanation depth, and connect current concepts to recent learning history.
- Add proactive micro-explanations and expandable explanations in a low-interruption overlay that can be closed without blocking reading.
- Add repeated interruption controls, including concept-level cooldowns, paragraph-level cooldowns, dismissal cooldowns, and reduced priority for recently explained concepts.
- Add privacy constraints that store and process the minimum necessary content, preferring concepts, events, and state over full page text.
- Explicitly prohibit chat-sidebar-first interaction and autonomous browser actions such as clicking links, browsing, searching, or operating pages for the user.

## Capabilities

### New Capabilities
- `reading-context`: Detect the current reading fragment and observe related reading behavior signals.
- `confusion-inference`: Infer possible confusion from combined content, behavior, and memory signals while preventing false-positive interventions.
- `concept-understanding`: Extract precise contextual concepts, normalize aliases, retrieve related learning context, and generate micro or expanded explanations.
- `learning-memory`: Maintain event-first learning memory and derive uncertain learning signals without polluting memory with overconfident labels.
- `cognitive-overlay`: Present low-interruption proactive explanations, support expansion and dismissal, and avoid repeated interruptions.

### Modified Capabilities
- None.

## Impact

- Browser extension or browser-injected content layer for DOM observation, viewport tracking, selection tracking, scroll tracking, and overlay rendering.
- Local or backend service components for concept extraction, confusion scoring, learning memory retrieval, explanation generation, and event recording.
- Learning memory storage for concept events, aliases, derived signals, cooldown state, and concept associations.
- Privacy-sensitive data handling rules for minimizing stored text and limiting content sent for analysis.
- Product behavior contracts that prevent chat-sidebar-first UX and autonomous browser-agent behavior.
