## 1. Browser Extension Boundary

- [x] 1.1 Replace extension default provider config with a browser-safe `localGateway` projection containing endpoint, pairing token, timeout, and health settings only.
- [x] 1.2 Remove default model-provider endpoint, modelName, adapter, chat path, embedding path, structured-output, and token fields from browser runtime config.
- [x] 1.3 Remove external model-provider host permissions from `manifest.json`, keeping only localhost gateway origins needed by the extension.
- [x] 1.4 Update config and manifest contract tests to assert no default provider token, vendor endpoint, model provider config, or vendor host permission is present in the extension.

## 2. Background Gateway-Only Dispatch

- [x] 2.1 Refactor provider registry/background resolution so explain, rewrite, embedding, health, memory event write, and memory query use the local gateway client.
- [x] 2.2 Remove browser background direct adapter execution and direct provider fetch fallback paths for custom/cloud provider modes.
- [x] 2.3 Preserve existing content script runtime message shapes for explanation, regeneration, embedding, diagnostics, memory writes, and memory queries.
- [x] 2.4 Update background diagnostics to report browser gateway state and redacted runtime provider state from gateway health/capabilities rather than browser provider config.
- [x] 2.5 Add tests proving background does not instantiate provider adapters or fetch external provider endpoints.

## 3. Gateway Runtime Provider Configuration

- [x] 3.1 Add gateway runtime provider config loading from environment variables and/or a local runtime config object with no source-default secrets.
- [x] 3.2 Support runtime explain and embedding role settings for enabled state, provider, adapter, endpoint, token, modelName, chatPath, embeddingPath, structuredOutput, timeout, and health.
- [x] 3.3 Ensure provider token values are used only inside gateway/runtime provider dispatch and are redacted from health, diagnostics, responses, and logs.
- [x] 3.4 Add tests for runtime provider config loading, missing config, token presence reporting, and secret redaction.

## 4. Gateway Explain, Rewrite, And Embedding Dispatch

- [x] 4.1 Wire `/explain` to choose the configured runtime provider adapter or return structured unavailable when no provider/stub is available.
- [x] 4.2 Wire `/rewrite` through the same runtime provider adapter boundary while preserving the internal Agent request and result shape.
- [x] 4.3 Wire `/embedding` through the runtime embedding provider adapter when enabled, with structured unavailable fallback when disabled or unsupported.
- [x] 4.4 Reuse or move the OpenAI-compatible adapter so chat completions and embeddings execute from the gateway/runtime process.
- [x] 4.5 Preserve structured JSON parsing, schema validation, version metadata, provider error normalization, and embedding vector validation behind the gateway.
- [x] 4.6 Keep `npm run gateway:stub` development explain/rewrite behavior available through the same gateway endpoints.

## 5. Gateway Health, Capabilities, And Logging

- [x] 5.1 Extend gateway `/health` response with protocol version, capabilities, memory repository status, runtime provider role availability, adapter names, configured model names, and token presence booleans.
- [x] 5.2 Add or confirm a capabilities surface through `/health` or an equivalent endpoint for explain, rewrite, embedding, memory event write, memory query, and source-aware explanation.
- [x] 5.3 Log inbound `/explain`, `/rewrite`, `/embedding`, `/memory/events`, `/memory/query`, and `/health` request start/finish events with redacted paths and duration.
- [x] 5.4 Log outbound provider adapter request start/success/failure from the gateway with capability, role, adapter, model, status or reason, and duration.
- [x] 5.5 Add tests that gateway logs include required events and never include pairing tokens, provider tokens, or secret query parameter values.

## 6. Memory And Fallback Behavior

- [x] 6.1 Ensure browser memory event writes and memory queries prefer the local gateway repository when available.
- [x] 6.2 Preserve browser-local fallback storage only when gateway memory capability is unavailable, marking fallback state as browser-local rather than shared.
- [x] 6.3 Ensure proactive UI remains silent when gateway/provider/stub explanation is unavailable.
- [x] 6.4 Ensure explicit regenerate/manual explain flows receive compact structured unavailable results instead of locally fabricated knowledge text.

## 7. Verification

- [x] 7.1 Update provider adapter tests so OpenAI-compatible request mapping, structured JSON parsing, schema failures, HTTP failures, and embeddings execute through the gateway/runtime boundary.
- [x] 7.2 Add integration tests proving extension explain requests only hit the local gateway and gateway dispatches to mocked OpenAI-compatible providers.
- [x] 7.3 Add tests for `/explain`, `/rewrite`, and `/memory/query` request logging from `npm run gateway:dev` or equivalent server handler coverage.
- [x] 7.4 Run the full test suite with `npm test`.
- [x] 7.5 Manually smoke test `npm run gateway:stub` and confirm the overlay can render a stub explanation through the gateway-only path.
