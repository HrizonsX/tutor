## Why

Provider settings for Agent/LLM explanation, embedding, local gateway pairing, timeouts, model names, health behavior, and diagnostics are currently split across adjacent config blocks and runtime paths. This change introduces one canonical provider configuration entrypoint so browser surfaces can configure and inspect provider state consistently while background remains the dispatch and secret boundary.

## What Changes

- Add a unified provider configuration entrypoint with separate `explain`, `embedding`, and top-level `localGateway` sections.
- Allow explain and embedding providers to configure independent `enabled`, `provider`, `endpoint`, `token`, `modelName`, `timeoutMs`, and health settings.
- Keep local gateway pairing as a top-level configuration section with its own endpoint, pairing token, timeout, and health settings.
- Treat configured model names as opaque values owned by configuration; the browser extension SHALL NOT maintain provider model allowlists or infer provider support for model names.
- Route explain, rewrite, embedding, health, diagnostics, and provider error normalization through background runtime messaging.
- Expose diagnostics with provider mode, health, capabilities, active endpoint, configured model name, token presence, pairing status, and latest provider error.
- Redact token values, pairing tokens, query tokens, API keys, and other secret values in diagnostics.
- Do not include legacy provider config migration in this change.
- Do not introduce strict endpoint policy validation or content-safe config projection in this change.

## Capabilities

### New Capabilities

- `provider-configuration`: Defines the unified provider configuration schema, validation behavior, model-name handling, token separation, local gateway pairing config, and redacted provider configuration state.

### Modified Capabilities

- `agent-provider-architecture`: Update provider resolution so explain and embedding are independent provider roles using the unified configuration entrypoint, including outbound model name propagation when configured.
- `background-service-mediation`: Clarify that background owns provider configuration, token reading, endpoint selection, model dispatch, health checks, and error normalization for explain, rewrite, embedding, health, and diagnostics requests.
- `runtime-observability`: Expand diagnostics to expose redacted provider configuration state including configured model names, token presence, pairing status, active endpoint, capabilities, health, and latest provider error.

## Impact

- Affected code: `src/config.js`, `src/provider-registry.js`, `src/agent-service.js`, `src/background.js`, `src/diagnostics.js`, provider/gateway tests, diagnostics tests, and contract/privacy tests.
- Affected APIs: background runtime messages for explain, rewrite, embedding, health, and diagnostics; provider registry resolution; diagnostics snapshot shape.
- Affected specs: new `provider-configuration`; modified `agent-provider-architecture`, `background-service-mediation`, and `runtime-observability`.
- Out of scope: legacy config migration, model allowlists, strict endpoint validation, and a separate content-safe config projection.
