## Context

The current explanation path is request/response oriented. Content selects a concept, sends a background message, background posts to the paired localhost gateway, Gateway / Local Agent Runtime performs memory recall and provider generation, and the overlay renders only after a complete Agent result is returned.

The requested experience is different: the browser should show a fast direct explanation while the runtime independently looks for related learned concepts and streams a second association-focused explanation. This crosses content, background, gateway, runtime memory, provider adapter, and overlay boundaries, so it needs an explicit streaming protocol rather than a small change to the existing JSON response.

Existing constraints still apply:
- Content scripts and background MUST NOT call external model providers directly.
- Browser code MUST NOT own durable memory, graph recall, provider tokens, or provider routing.
- Existing `/explain` and `/rewrite` JSON contracts must remain compatible.
- Overlay behavior must remain low-interruption and browser-visible diagnostics must stay testable.

## Goals / Non-Goals

**Goals:**

- Provide a dual-lane streaming session with `direct` and `association` lanes.
- Stream direct explanation text without waiting for runtime memory recall.
- Run association recall in parallel and stream relationship-focused text when reliable memory bridges exist.
- Keep an association output area visible even when no reliable bridge exists.
- Support multiple recalled concepts with a predictable product format: top bridges expanded, overflow mentioned, one-sentence summary.
- Preserve final stable Agent result metadata per lane for diagnostics, memory events, feedback, and logs.
- Keep existing non-stream endpoints and tests working.

**Non-Goals:**

- No browser-side memory graph, browser-side recall cache, or browser-side provider adapter.
- No automatic external search or source browsing.
- No new storage service, queue, database, or standalone process.
- No replacement of relation proposal or active bridge gating.
- No removal of the existing synchronous `/explain` and `/rewrite` paths.

## Decisions

### 1. Add an opt-in streaming session instead of changing `/explain`

The gateway should expose a new streaming endpoint or equivalent action such as `/explain/stream-session`. It emits lane-scoped events and leaves `/explain` unchanged.

Alternative considered: make `/explain` stream by default. That would risk breaking the existing background client, tests, diagnostics, and any callers expecting one JSON response.

### 2. Use two runtime lanes with different prompt contracts

The `direct` lane bypasses runtime memory recall and asks the provider for plain-text explanation of the current target. It is optimized for first text on screen.

The `association` lane uses runtime-owned recall. It starts from the same target, selects bounded `memoryBridges`, and asks the provider to explain how the recalled concepts relate to the current target. It must not repeat the direct definition as its main content.

Alternative considered: run the existing memory-enhanced explain as the second lane without changing prompt semantics. That would often produce a second basic definition with a small memory mention, which does not match the desired learning-continuity experience.

### 3. Stream plain text, then wrap final lane results

For streaming lanes, provider adapter calls should support a plain-text streaming mode. Deltas are displayed immediately. At lane completion, Gateway / Local Agent Runtime wraps the accumulated text in a stable Agent result shape with lane metadata.

Alternative considered: stream partial structured JSON and extract the `explanation` field incrementally. That keeps one prompt style, but it is fragile because JSON fragments are not stable display units and schema validation only happens at the end.

### 4. Mediate browser streaming with a long-lived background channel

Content should open a long-lived background connection for a stream session. Background owns pairing token lookup, local gateway fetch, timeout/cancellation, and conversion from gateway stream events to content events.

Alternative considered: use `chrome.runtime.sendMessage` for streaming. It naturally returns one response and would require awkward request-id polling or many independent messages.

### 5. Use lane-scoped events with final result events

The stream should include these event kinds:

- `session_start`
- `lane_start`
- `recall_status`
- `lane_delta`
- `lane_final`
- `lane_error`
- `session_done`

Every event should include `sessionId`, `sequence`, and where relevant `lane`. `lane_final` carries the final Agent result for that lane. `lane_error` carries a structured unavailable or invalid result.

### 6. Keep association lane visible for no association

If recall finds no reliable bridges, the association lane should not call the provider. It should emit a final no-association result with reason `no_memory_bridge` or `weak_candidates_only`. The overlay displays a stable message such as "No reliable association found in local learning memory."

Alternative considered: hide the association lane when recall finds nothing. That makes the UI feel inconsistent and makes it harder to distinguish "still loading" from "nothing found".

### 7. Bound multi-bridge association output

The runtime should choose a small display set:

- `expandedBridges`: at most 3 bridges for detailed relationship explanation.
- `mentionedBridges`: additional bridge names, bounded and shown briefly.
- `rejectedBridges` or rejection summaries remain diagnostics-oriented and do not become user-facing explanation content.

The association prompt should require:
- announce how many related learned concepts were found;
- explain each expanded bridge as a relationship to the current target;
- avoid re-defining the target as the main content;
- mention overflow concepts briefly;
- end with one sentence summarizing the association.

### 8. Preserve cancellation and stale-result safety

If the overlay is dismissed, feature config changes, or a newer request supersedes the stream, content should tell background to cancel the session. Background should abort the gateway fetch, and gateway/provider code should stop work when possible. Late stream events must not update a stale prompt.

## Risks / Trade-offs

- [Risk] Two provider calls can cost more and increase provider load. -> Mitigation: make streaming opt-in, skip association provider calls when no reliable bridge exists, and cap bridge count.
- [Risk] Direct and association lanes can finish out of order. -> Mitigation: lane events are independent and the overlay renders each lane separately.
- [Risk] Association text may overstate user memory as factual truth. -> Mitigation: prompts and final metadata must label bridges as local learning context, not fact sources.
- [Risk] Plain-text streaming loses structured `terms` and `actions`. -> Mitigation: final wrapped results may include minimal metadata; existing non-stream structured path remains available.
- [Risk] Browser Port or stream cancellation can be flaky across extension contexts. -> Mitigation: tests should cover stale request ids, cancellation, and late-event suppression; browser-visible diagnostics should expose last stream state.
- [Risk] A large overlay could become intrusive. -> Mitigation: keep two compact lanes, show only bounded bridge chips, and allow the current close/dismiss behavior to stop both lanes.

## Migration Plan

1. Add the new streaming contracts and tests without changing existing `/explain` behavior.
2. Implement provider adapter plain-text stream support behind explicit streaming methods.
3. Implement gateway stream-session orchestration with direct lane first and association lane in parallel.
4. Implement background Port mediation and cancellation.
5. Add overlay two-lane rendering and diagnostics.
6. Wire content to use streaming only when the gateway reports the streaming capability; otherwise keep the current one-shot explain path.

Rollback is straightforward: disable the streaming capability flag or stop advertising streaming support, and content falls back to the existing non-stream explanation path.

## Open Questions

- Should the first implementation stream both proactive explanations and explicit regeneration, or only initial explain requests?
- Should lane-specific feedback controls exist immediately, or should existing prompt-level feedback apply to the direct lane while association feedback is added later?
- Should no-association copy be localized by the provider language, or fixed browser UI copy translated by the extension?
