## Why

The browser extension can already route Agent requests through unified provider modes, but `custom` and `cloud` providers are still treated like bespoke Agent endpoints. To call OpenAI, DeepSeek, or other OpenAI-compatible model services directly, the system needs an adapter boundary that converts internal Agent requests into provider-specific API calls and converts provider responses back into the stable internal result contract.

Structured JSON responses are also becoming part of the reliability contract for explain generation. The system should prefer provider-enforced JSON schema when available, gracefully support weaker JSON modes, and return stable error reasons when providers fail, return invalid JSON, or do not support the requested response format.

## What Changes

- Add a Provider Adapter architecture layer for `cloud` and `custom` provider modes.
- Add an OpenAI-compatible adapter for chat completions and embeddings.
- Extend `providerConfig.explain` and `providerConfig.embedding` with adapter routing and structured-output fields, including `adapter`, `chatPath`, `embeddingPath`, and `structuredOutput`.
- Allow role-specific `token` values to be configured directly and used for outbound provider requests, while keeping diagnostics and cross-boundary state redacted.
- Treat `endpoint` as a provider base URL for adapter-backed providers, with adapter-owned path joining and request body conversion.
- Prefer structured JSON explain responses using `json_schema`, then support `json_object` or `prompt_json` modes according to configuration.
- Parse provider JSON responses, validate them against the explain schema, and normalize them to the current explanation result structure.
- Normalize provider failures into stable reasons including `provider_json_parse_failed`, `provider_schema_invalid`, `provider_auth_failed`, `provider_rate_limited`, `provider_model_unsupported`, and `provider_unavailable`.
- Preserve the existing `local` provider path through the localhost gateway.

## Capabilities

### New Capabilities
- `provider-adapter-structured-json`: Defines the adapter layer, OpenAI-compatible request/response mapping, structured JSON explain schema handling, and provider error normalization.

### Modified Capabilities
- `provider-configuration`: Extend unified provider role configuration with adapter routing and structured-output settings while allowing direct role-specific tokens.
- `agent-provider-architecture`: Route `cloud` and `custom` provider modes through adapters without changing content script behavior or local gateway behavior.
- `background-service-mediation`: Ensure background owns adapter dispatch, token application, provider error handling, and redacted diagnostics.
- `short-explanation-composer`: Require adapter-backed explain results to parse and validate structured JSON before becoming explanation versions.

## Impact

- Affected code: `src/config.js`, `src/provider-registry.js`, `src/agent-service.js`, `src/diagnostics.js`, and new adapter modules.
- Affected tests: provider configuration validation, adapter request construction, model-name passthrough, structured response parsing, provider error mapping, local gateway routing, and diagnostics redaction.
- Provider integrations: OpenAI-compatible chat completions and embeddings via configured base URL, paths, token, and model name.
- Security posture: tokens may be configured directly, but logs, diagnostics, health snapshots, content-script messages, and error details must not expose token values.
