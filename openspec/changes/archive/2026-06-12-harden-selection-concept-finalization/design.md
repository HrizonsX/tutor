## Context

The browser plugin currently reacts to `selectionchange` as the main signal for user-selected concepts. That event fires while a drag selection is still changing, after accidental punctuation selections, and during partial word selections. The current pipeline can therefore record a weak `selectedPreciseTerm`, write `USER_SELECTED_TERM`, and schedule explanation evaluation before the user has completed an intentional concept selection.

The change stays in the content-side selection and behavior path. It does not change the local gateway, provider adapters, model prompts, or memory storage schema. The existing context tracker and diagnostics remain the main surfaces; this design adds a small finalization and validation layer before existing selection effects are allowed to fire.

## Goals / Non-Goals

**Goals:**

- Treat `selectionchange` as candidate state, not as proof that a concept has been selected.
- Finalize pointer selections after primary-button release, with stable fallback for keyboard and double-click selections.
- Validate selected text before it can become an explicit concept signal, memory event, or explanation trigger.
- Produce concise diagnostics for rejected selections so tests and page-side debugging can explain silence.
- Keep the change surgical and compatible with the current content script architecture.

**Non-Goals:**

- No new tokenizer, NLP service, relation proposer, provider schema, or backend API.
- No change to model-side explanation quality or memory relation discovery.
- No attempt to solve every natural-language boundary ambiguity; the first implementation should be conservative and observable.
- No migration of existing stored noisy memory events.

## Decisions

1. Add a content-side selection finalization gate before existing behavior updates.

   `selectionchange` should update a pending candidate only. A primary pointer gesture starts on `pointerdown` or `mousedown`, cancels any pending explanation evaluation, and finalizes shortly after `pointerup` or `mouseup` once the browser selection has settled. If no pointer gesture is active, a keyboard/double-click fallback finalizes after a short stability debounce and requires the selected text to remain unchanged.

   Alternative considered: keep the current debounce-only `selectionchange` flow and only strengthen text validation. That would still treat drag intermediate states as meaningful and would not distinguish a completed selection from a transient browser event.

2. Centralize selected concept validation near concept normalization.

   Add a validator that returns an explicit result such as `{ status, reason, normalizedText, canonicalName, completedBy }`. The validator should reuse existing normalization and size/code heuristics where possible, then add checks for punctuation-only text, symbol-only text, partial Latin word boundaries, oversized selections, code-looking selections, and under-supported short CJK fragments.

   Alternative considered: scatter checks across `content.js`, `behavior.js`, and `concepts.js`. That makes it harder to keep memory writes and explanation triggers consistent.

3. Use surrounding selection context for boundary checks, with conservative fallback.

   When a `Range` and fragment context are available, the validator should inspect adjacent characters to reject partial Latin words such as selecting `ear` inside `linear`. CJK token boundaries are harder without a tokenizer, so the first version should allow multi-character CJK phrases and known aliases, but reject isolated one-character selections unless the existing alias/candidate path can justify them.

   Alternative considered: introduce a tokenizer or provider call for every selection. That would add latency, dependencies, and failure modes to a hot browser event path.

4. Gate all explicit-selection side effects through the same accepted result.

   Only accepted selections may update `selectedPreciseTerm`, call `scheduleSelectedTermEvent`, or force explanation evaluation. Rejected selections should update diagnostics and then remain silent. Large/code selections can still be recorded as ambiguous reading behavior if the existing behavior model needs it, but they must not be treated as selected concepts.

   Alternative considered: allow memory writes but suppress explanations. That would still pollute later memory recall and relation building with punctuation or half-words.

5. Keep diagnostics product-oriented and concise.

   Rejection reasons should be stable strings such as `punctuation_only`, `partial_word`, `too_short_cjk`, `large_selection`, and `code_like_selection`. Existing page diagnostics can expose the latest accepted or rejected selection decision without logging full page text.

   Alternative considered: verbose console logging for every selection candidate. That would create noisy logs and make the useful product signal harder to read.

## Risks / Trade-offs

- False negatives for short legitimate concepts -> Mitigation: allow known aliases/candidates to override generic short-text rejection, and keep rejection reasons visible for tuning.
- Browser event ordering differences -> Mitigation: support both pointer and mouse events, finalize after a small settle delay, and keep keyboard fallback.
- CJK boundary ambiguity without segmentation -> Mitigation: use conservative length/context rules first, then add curated alias overrides where product usage proves a need.
- Regression in explicit selection workflows -> Mitigation: cover drag, double-click, and keyboard selection paths in unit tests and browser smoke.
- Stale pending evaluations after rejected selections -> Mitigation: pointer start and rejected finalization both cancel or avoid pending explanation work for the rejected candidate.

## Migration Plan

Implementation can be rolled out as a content-side change with no data migration. Existing noisy memory entries remain as historical data, while new explicit-selection writes use the stricter gate. Rollback is limited to reverting the content-side finalization and validator integration.

## Open Questions

- Should one-character CJK selections ever be accepted outside an existing alias/candidate match?
- Which diagnostics field should be the canonical product surface for rejected-selection reasons if multiple existing fields can carry it?
