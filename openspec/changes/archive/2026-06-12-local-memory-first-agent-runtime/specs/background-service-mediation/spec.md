## ADDED Requirements

### Requirement: Background Sends Stateless Runtime Requests
The background service worker SHALL mediate browser-to-runtime transport without owning durable memory, retrieval assembly, or provider-context construction.

#### Scenario: Explain request is forwarded
- **GIVEN** a content script sends selected text, current fragment, URL/title metadata, language, target identity, and request goal
- **WHEN** background forwards the explain request to the gateway
- **THEN** it SHALL send only stateless current-interaction fields and browser-safe constraints
- **AND** it SHALL NOT attach browser-cached profile, memory packet, concept familiarity, prior explanation history, feedback history, or preference summaries.

#### Scenario: Background cache is not memory
- **GIVEN** background keeps request timeout state, abort controllers, diagnostics, or transient in-flight request metadata
- **WHEN** the browser refreshes, navigates, or restarts
- **THEN** that state SHALL NOT be used as learning memory
- **AND** future personalization SHALL require Local Agent Runtime memory.

### Requirement: Background Does Not Interpret Runtime Decisions
The background service worker SHALL preserve structured runtime decision results without translating them into browser-owned memory or provider policy.

#### Scenario: Runtime skips provider
- **GIVEN** the gateway returns a decision result such as existing explanation reuse, muted rejection, duplicate suppression, invalid input, or degraded memory
- **WHEN** background receives the response
- **THEN** it SHALL forward the structured status and reason to browser UI or diagnostics as needed
- **AND** it SHALL NOT call another provider, synthesize explanation text, or cache the result as durable memory.

#### Scenario: Feedback is forwarded as evidence
- **GIVEN** the user marks known, confusing, inaccurate, mute, simpler, more background, or regenerate in the overlay
- **WHEN** background receives the feedback event
- **THEN** it SHALL forward the structured event to the gateway memory API
- **AND** it SHALL NOT update browser-owned concept state, profile summary, or explanation preference summaries.
