## Why

Current explanations are produced as one complete JSON response after runtime memory recall and provider generation finish. This delays first text on screen and makes memory-associated explanations compete with the basic concept definition in a single output.

This change introduces a dual-lane streaming explanation experience: the user sees a fast direct explanation immediately, while a separate association lane streams memory-based relationship context when runtime recall finds related learned concepts.

## What Changes

- Add a browser-to-gateway streaming explanation session that emits lane-scoped events for `direct` and `association` explanations.
- Add a direct explanation lane that bypasses runtime memory recall, requests plain text from the provider, and streams the basic concept explanation to the plugin as soon as tokens arrive.
- Add an association explanation lane that runs runtime-owned recall in parallel, sends the current target plus selected memory bridges to the provider, and streams relationship-focused text instead of repeating the direct definition.
- Keep the association lane visible even when no reliable bridge is found, showing a stable "no association" state rather than hiding the area.
- Define a product format for multiple recalled concepts: show recall chips/status immediately, expand at most the top three bridges, mention overflow concepts briefly, and end with a one-sentence association summary.
- Preserve existing non-stream `/explain` and `/rewrite` behavior for compatibility.
- Keep provider tokens, provider routing, memory recall, and relation graph ownership in Gateway / Local Agent Runtime rather than content scripts.
- Wrap final lane output in stable Agent result metadata so diagnostics, feedback, memory writes, and logs remain structured.

## Capabilities

### New Capabilities

- `streaming-agent-explanations`: Defines dual-lane streaming sessions, event types, lane lifecycle, final result contracts, cancellation, and no-association behavior.

### Modified Capabilities

- `local-agent-memory-gateway`: Add a runtime-owned dual-lane stream endpoint or equivalent action that runs direct explanation and association recall/explanation in parallel while preserving existing endpoint compatibility.
- `background-service-mediation`: Add long-lived streaming mediation from content to the paired localhost gateway without exposing provider secrets or browser-owned memory.
- `cognitive-overlay`: Add two independent low-interruption output areas for direct explanation and association explanation, including no-association and multi-bridge display states.
- `provider-adapter-structured-json`: Add provider adapter support for plain-text streaming chat calls used by direct and association lanes, while preserving structured JSON behavior for existing non-stream requests.

## Impact

- Affected code: `src/content.js`, `src/overlay.js`, `src/agent-service.js`, `src/provider-registry.js`, `src/local-gateway.js`, `src/runtime-explain-pipeline.js`, `src/provider-adapters.js`, diagnostics/logging helpers, and tests under `test/`.
- Affected APIs: add a streaming browser/background protocol and a local gateway streaming endpoint or equivalent protocol action; existing `/explain`, `/rewrite`, `/memory/events`, `/memory/query`, and `/health` remain compatible.
- Affected UX: overlay card gains direct and association lanes, association recall chips/status, streaming partial text, final states, and no-association copy.
- No new external database, queue, browser memory cache, external search, or provider token exposure is introduced.
