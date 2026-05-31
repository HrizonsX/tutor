## Why

The current extension still treats the Manifest V3 background worker as a model-provider boundary: it can hold provider endpoint, model name, and token configuration, request provider host permissions, and dispatch OpenAI-compatible calls itself. That makes the browser extension responsible for external-model routing even though the product direction is a local runtime boundary where the browser only senses reading context and talks to a paired localhost gateway.

This change moves provider ownership to the Local Agent Runtime / gateway so future external LLMs, fully local models, or private agents can replace each other without changing the browser extension call chain.

## What Changes

- **BREAKING**: Browser extension runtime configuration no longer includes model-provider endpoint, model name, adapter, structured-output, chat path, embedding path, or provider API token fields.
- **BREAKING**: Browser extension background no longer dispatches direct DeepSeek, OpenAI, OpenAI-compatible, custom, or cloud provider requests.
- The extension keeps only browser-runtime gateway settings: `localGateway.endpoint`, `localGateway.pairingToken`, timeout, health, and feature flags.
- Manifest host permissions are reduced to localhost gateway origins; vendor domains such as DeepSeek or OpenAI are not extension host permissions.
- The local gateway is upgraded from development stub plus memory endpoint to the HTTP boundary for Local Agent Runtime capabilities.
- The gateway owns memory repository access, reading and feedback event writes, memory query, explain, rewrite, embedding, health, capabilities, provider selection, provider adapter execution, structured JSON parsing, schema validation, error normalization, and server-side request logging.
- Explain and rewrite requests flow from the extension to `/explain` or `/rewrite` on the gateway as internal Agent requests; the gateway chooses the configured provider adapter such as `openai-compatible` and normalizes the provider response back to the existing Agent explanation result shape.
- Development stub explain/rewrite remains available when no external model provider is configured.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-provider-architecture`: Provider modes and adapter execution move behind the local gateway / Local Agent Runtime boundary instead of running in the browser background worker.
- `background-service-mediation`: Background becomes a browser-side gateway client only and must not call external model or embedding providers directly.
- `local-agent-memory-gateway`: The localhost gateway becomes the Local Agent Runtime HTTP boundary for memory, explain, rewrite, embedding, provider adapter dispatch, health, and capabilities.
- `provider-configuration`: Browser configuration is split from gateway runtime model-provider configuration; provider secrets and model routing move out of extension config.
- `provider-adapter-structured-json`: OpenAI-compatible adapter behavior remains required, but it is executed by the gateway/runtime and not by extension background.
- `runtime-observability`: Gateway-side request logs and redacted provider/runtime diagnostics become part of the observable contract.

## Impact

- Affected browser code: `src/config.js`, `src/provider-registry.js`, `src/agent-service.js`, `src/background.js`, diagnostics, tests, and `manifest.json`.
- Affected gateway/runtime code: `src/local-gateway.js`, `scripts/local-gateway-dev.js`, provider adapter wiring, provider configuration loading, request logging, and memory repository integration.
- Affected tests: manifest permission tests, config contract tests, provider dispatch tests, local gateway server tests, adapter tests, diagnostics tests, and end-to-end explain/rewrite/memory flows.
- Security impact: model-provider API tokens live only in gateway runtime configuration or environment variables; extension diagnostics and logs expose token presence only and redact secrets.
