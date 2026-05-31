## 1. Provider Configuration Schema

- [x] 1.1 Add the canonical `providerConfig` shape with `explain`, `embedding`, and top-level `localGateway` sections.
- [x] 1.2 Update runtime config merge behavior so role-specific health and timeout fields preserve defaults.
- [x] 1.3 Add structured provider configuration validation helpers for disabled roles, off mode, missing routing data, missing local pairing, and malformed role config.
- [x] 1.4 Update contract/privacy tests to cover the new provider config shape and the absence of legacy migration requirements.

## 2. Provider Registry And Dispatch

- [x] 2.1 Update provider registry resolution to accept a provider role and resolve explain and embedding independently.
- [x] 2.2 Route local explain, rewrite, embedding, memory, and health access through the top-level `localGateway` endpoint and pairing token.
- [x] 2.3 Include configured explain `modelName` in outbound explain and rewrite requests when present.
- [x] 2.4 Include configured embedding `modelName` in outbound embedding requests when present.
- [x] 2.5 Normalize provider model-related failures without adding browser-side model allowlists.

## 3. Background Messaging Boundary

- [x] 3.1 Update background explain and rewrite handling to use the explain provider role token, timeout, endpoint, and model name.
- [x] 3.2 Update background embedding handling to use the embedding provider role token, timeout, endpoint, and model name.
- [x] 3.3 Update provider health handling to report role-specific health and configured model names.
- [x] 3.4 Ensure content-side clients continue using the same runtime message shapes without provider details.

## 4. Diagnostics And Redaction

- [x] 4.1 Expand diagnostics state to include provider role modes, active endpoints, configured model names, token presence, pairing status, health, capabilities, and latest provider error.
- [x] 4.2 Redact provider tokens, local pairing token, API keys, and secret endpoint query parameters from diagnostics snapshots.
- [x] 4.3 Ensure diagnostics reads do not trigger explanation generation, embedding generation, memory writes, provider switching, or overlay display.
- [x] 4.4 Update diagnostics tests for configured model names, token presence, local pairing status, latest provider error, and endpoint query redaction.

## 5. Validation

- [x] 5.1 Add provider registry tests for independent explain and embedding role resolution.
- [x] 5.2 Add background service tests for model name propagation and role-specific token use.
- [x] 5.3 Add unavailable/error tests for disabled roles, off mode, missing routing data, missing local pairing, provider model failure, and unsupported capability.
- [x] 5.4 Run the full test suite.
- [x] 5.5 Run OpenSpec validation/status for `unify-provider-configuration-entrypoint`.
