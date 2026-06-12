## 1. Selection Validation Contract

- [x] 1.1 Review existing selection, concept normalization, behavior, and reading-context tests to identify the smallest files to extend.
- [x] 1.2 Add focused failing tests for punctuation-only, symbol-only, partial Latin word, large/code-like, under-supported one-character CJK, and valid short concept selections.
- [x] 1.3 Implement a centralized selected-concept validator that returns accepted/rejected status, normalized text, canonical name when available, completion source, and stable rejection reason.
- [x] 1.4 Reuse existing normalization, alias, large-selection, and code-like heuristics where possible so validation does not fork concept identity rules.

## 2. Selection Finalization Lifecycle

- [x] 2.1 Change content-side `selectionchange` handling to update pending candidate state instead of immediately recording explicit selected concepts.
- [x] 2.2 Add primary pointer and mouse down/up handling to finalize the settled browser selection after release.
- [x] 2.3 Add keyboard/double-click fallback finalization when no pointer gesture is active and selection text remains stable.
- [x] 2.4 Cancel pending selection/evaluation work on pointer cancel, blur, visibility loss, empty selection, or superseding gesture.

## 3. Gate Memory And Explanation Side Effects

- [x] 3.1 Update behavior tracking so only accepted finalized selections set precise selected-term signals.
- [x] 3.2 Gate `USER_SELECTED_TERM` writes behind the accepted validation result.
- [x] 3.3 Gate forced explanation evaluation behind the accepted validation result while preserving existing non-selection inference behavior.
- [x] 3.4 Ensure large/code-like selections may remain ambiguous reading behavior but cannot become explicit concept explanation requests.

## 4. Diagnostics And Product Logging

- [x] 4.1 Surface accepted/rejected selection validation decisions through the existing page diagnostics fields without storing full page text.
- [x] 4.2 Use concise stable rejection reasons such as `punctuation_only`, `partial_word`, `too_short_cjk`, `large_selection`, and `code_like_selection`.
- [x] 4.3 Keep console logging quiet for rejected selections unless existing product diagnostics are explicitly inspected.

## 5. Verification

- [x] 5.1 Run the unit test suite and confirm existing behavior remains green.
- [x] 5.2 Add or update content-side tests for drag finalization, keyboard fallback, valid concept acceptance, and invalid selection suppression.
- [x] 5.3 Run a browser smoke check that verifies selecting a valid concept can trigger the overlay path while selecting a comma or half-word stays silent with a diagnostic reason.
- [x] 5.4 Run `openspec validate harden-selection-concept-finalization --strict` and resolve any spec or task formatting issues.
