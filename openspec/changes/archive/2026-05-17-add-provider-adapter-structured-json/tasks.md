## 1. Configuration And Contracts

- [x] 1.1 Extend provider role configuration defaults and merge behavior with `adapter`, `chatPath`, `embeddingPath`, and `structuredOutput`.
- [x] 1.2 Preserve direct role-specific `token` configuration and ensure diagnostics expose token presence only.
- [x] 1.3 Add or update contract constants for adapter names, structured-output modes, and normalized provider error reasons.
- [x] 1.4 Update provider validation so adapter-backed roles require the routing fields needed by their capability.

## 2. Adapter Layer

- [x] 2.1 Add a Provider Adapter module boundary with explain, rewrite, embedding, and optional health capability methods.
- [x] 2.2 Implement OpenAI-compatible URL joining from base `endpoint` plus role-specific `chatPath` or `embeddingPath`.
- [x] 2.3 Implement OpenAI-compatible chat completions request construction with bearer token, configured model name, privacy-trimmed messages, and structured-output mode handling.
- [x] 2.4 Implement OpenAI-compatible embeddings request construction and vector response normalization.
- [x] 2.5 Implement provider HTTP, network, timeout, model unsupported, auth, and rate-limit error normalization.

## 3. Structured Explain Response Handling

- [x] 3.1 Define the explain JSON schema for `explanation`, `summary`, `confidence`, `terms`, `actions`, and `versionMetadata`.
- [x] 3.2 Parse chat completion responses and extract assistant JSON content for all supported structured-output modes.
- [x] 3.3 Validate parsed JSON against the explain schema and return `provider_json_parse_failed` or `provider_schema_invalid` when needed.
- [x] 3.4 Normalize valid structured JSON into the current Agent Explanation Result fields, including `text`, `microExplanation`, `explanationVersion`, and provider metadata.

## 4. Background And Routing Integration

- [x] 4.1 Route `custom` and `cloud` explain and rewrite calls through the selected adapter when configured.
- [x] 4.2 Route `custom` and `cloud` embedding calls through the selected adapter when configured.
- [x] 4.3 Preserve existing `local` provider behavior through the localhost gateway, including pairing, health, memory, and capability handling.
- [x] 4.4 Decide and implement compatibility behavior for `custom` providers without an explicit adapter.

## 5. Diagnostics And Privacy

- [x] 5.1 Add adapter name, provider mode, provider role, configured model, capability, and normalized reason to redacted diagnostics.
- [x] 5.2 Ensure endpoint and path query secrets are redacted in diagnostics and error details.
- [x] 5.3 Ensure provider tokens never appear in content-script messages, diagnostics snapshots, health snapshots, test output, or thrown error messages.

## 6. Tests

- [x] 6.1 Add configuration tests for adapter fields, direct token handling, model-name passthrough, and invalid structured-output config.
- [x] 6.2 Add OpenAI-compatible chat adapter tests for URL construction, headers, request body, model passthrough, and structured-output modes.
- [x] 6.3 Add structured response tests for valid JSON, invalid JSON, schema-invalid JSON, and normalized Explanation Result fields.
- [x] 6.4 Add provider error mapping tests for auth failure, rate limit, unsupported model or structured output, network failure, timeout, and unavailable provider envelopes.
- [x] 6.5 Add embedding adapter tests for request construction, model passthrough, vector parsing, and invalid vector handling.
- [x] 6.6 Add regression tests proving the local gateway path and content-script message shape are unchanged.
