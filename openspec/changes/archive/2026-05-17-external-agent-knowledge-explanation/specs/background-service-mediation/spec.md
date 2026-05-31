## ADDED Requirements

### Requirement: Background Mediates External Agent Requests
The background service worker SHALL be the only extension component that calls external Agent or LLM APIs for knowledge explanation, ambiguity judgment, or rewrite generation.

#### Scenario: Content script requests an explanation
- **GIVEN** a content script has selected text, minimal surrounding context, retrieval packet summary, user memory hints, and an explanation goal
- **WHEN** it needs an Agent explanation
- **THEN** it MUST send those inputs to the background service worker
- **AND** it MUST NOT call an external Agent or LLM API directly.

#### Scenario: Background constructs privacy-trimmed request
- **GIVEN** the background service worker receives an explanation request from a content script
- **WHEN** it prepares the outbound Agent request
- **THEN** it SHALL include only selected text, minimal surrounding context, sanitized user memory summary, request goal, and policy metadata needed for the explanation
- **AND** it SHALL NOT include full page text or unsanitized local memory.

### Requirement: Background Owns Provider Configuration
The background service worker SHALL own provider configuration, API keys, host permissions, and external endpoint selection for Agent, LLM, and embedding services.

#### Scenario: Provider key is needed
- **GIVEN** an external Agent request requires an API key
- **WHEN** the request is sent
- **THEN** the background service worker SHALL read and apply the provider credential
- **AND** the content script SHALL NOT receive or persist the credential.

#### Scenario: Provider is not configured
- **GIVEN** no external Agent provider is configured
- **WHEN** the background service worker receives a proactive explanation request
- **THEN** it SHALL return a structured unavailable result
- **AND** it SHALL NOT fabricate or request a local knowledge explanation.

### Requirement: Background Controls External Service Reliability
The background service worker SHALL enforce timeouts, cache policy, rate limits, structured error handling, and privacy policy for external service calls.

#### Scenario: Agent request times out
- **GIVEN** an external Agent request exceeds the configured timeout
- **WHEN** the background service worker handles the failure
- **THEN** it SHALL return a structured unavailable result with a non-knowledge error reason
- **AND** it SHALL NOT retry indefinitely.

#### Scenario: Repeated equivalent request
- **GIVEN** a recent equivalent Agent explanation request has a cacheable successful response
- **WHEN** the background service worker receives the same request within the cache policy
- **THEN** it MAY return the cached structured explanation version
- **AND** it SHALL preserve the original explanation version metadata.

### Requirement: Background Mediates Embedding Requests
The background service worker SHALL mediate all optional embedding service calls used for similar-memory retrieval.

#### Scenario: Embedding provider configured
- **GIVEN** an embedding provider is configured
- **WHEN** local memory asks for an embedding of a sanitized summary
- **THEN** the background service worker SHALL call the embedding provider
- **AND** the resulting vector SHALL be stored locally with the sanitized summary metadata.

#### Scenario: Embedding provider unavailable
- **GIVEN** no embedding provider is configured or the embedding service is unavailable
- **WHEN** memory retrieval needs similar context
- **THEN** the system SHALL fall back to exact object, alias, recency, feedback, cooldown, and explanation-history retrieval
- **AND** it SHALL NOT invent semantic similarity scores.
