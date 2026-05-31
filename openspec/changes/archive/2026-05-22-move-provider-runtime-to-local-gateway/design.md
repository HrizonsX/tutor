## Context

The extension currently has three architectural layers: content script sensing and overlay UI, background service worker mediation, and a localhost gateway that provides health, memory, and optional development stub endpoints. Earlier changes moved direct external-service calls out of content scripts, but the background worker still owns provider configuration and can directly call OpenAI-compatible or custom provider endpoints.

The new product boundary is stricter. The browser extension is the sensing and UX layer; the Local Agent Runtime is the model and memory boundary; the localhost gateway is the runtime HTTP surface between them. Provider endpoint, token, model name, adapter, structured-output, embedding, memory repository, and future local/private model choices belong behind that local runtime boundary.

## Goals / Non-Goals

**Goals:**

- Make the extension call only the local gateway for explain, rewrite, embedding, memory, health, and capabilities.
- Remove model-provider endpoint, token, adapter, model name, path, and structured-output configuration from extension defaults and extension runtime dispatch.
- Keep content script message shapes stable by letting background remain the browser-side broker.
- Upgrade the gateway from a development stub to the Local Agent Runtime HTTP boundary.
- Reuse the existing internal Agent request/response contract and openai-compatible adapter behavior behind the gateway.
- Keep development stub explain/rewrite available when no provider is configured.
- Redact provider tokens and endpoint query secrets from all diagnostics and logs.

**Non-Goals:**

- Build an options UI or pairing UI.
- Add a cloud sync account system.
- Add provider SDK dependencies.
- Require embeddings for memory retrieval.
- Remove browser-local fallback storage in cases where gateway memory is unavailable.
- Guarantee support for every OpenAI-compatible provider quirk beyond the existing adapter contract.

## Decisions

### Decision: Background remains the browser-side broker, not a provider runtime

Content scripts continue sending standard runtime messages to background. Background constructs or forwards privacy-trimmed internal Agent requests, enforces browser-side timeout/cache/rate-limit behavior where applicable, and calls the configured localhost gateway endpoint with the pairing token. Background does not select external provider endpoints, read model-provider tokens, instantiate provider adapters, or request vendor host permissions.

Rationale: Keeping background as the broker avoids exposing gateway endpoint and pairing details to content scripts, while moving model-provider risk out of the browser extension.

Alternative considered: let content scripts call the gateway directly. That would reduce one hop, but it would expose gateway configuration to page-adjacent code and bypass existing runtime message contracts.

### Decision: Extension config is a content-safe local gateway projection

The extension runtime configuration keeps `localGateway.endpoint`, `localGateway.pairingToken`, `timeoutMs`, `health`, feature flags, privacy limits, inference policy, and UI behavior. It removes provider role configuration for external model providers, including endpoint, token, model name, adapter, chat path, embedding path, and structured-output mode.

Rationale: The extension only needs to know where its paired local runtime lives. Model routing changes should not require extension manifest or call-chain changes.

Alternative considered: keep provider config in extension but force all values to local mode. That preserves too much authority in the browser and leaves future external provider support coupled to extension releases.

### Decision: Gateway owns provider runtime configuration

The Local Agent Runtime loads provider configuration from local runtime config and/or environment variables. It may configure explain and embedding roles with enabled state, provider mode, adapter, endpoint, token, model name, chat path, embedding path, structured-output settings, timeout, and health. Tokens must not be hardcoded in source defaults.

Rationale: Local runtime config is the correct place for user-specific model provider credentials and future local/private model replacement.

Alternative considered: use the browser extension storage as the canonical config store. That would keep credentials in the extension and fail the boundary goal.

### Decision: Gateway executes provider adapters and validates structured JSON

For `/explain` and `/rewrite`, the gateway receives an internal Agent request, selects the configured provider adapter, maps the request to the provider API, parses structured JSON, validates schema, normalizes errors, and returns an AgentExplanationResult-compatible response. The existing openai-compatible adapter behavior should be reused or moved so it runs in the gateway/runtime process.

Rationale: Provider-specific protocol mapping and schema validation are model-runtime responsibilities. The extension should consume only stable internal Agent results.

Alternative considered: gateway as a pass-through proxy while background still adapts provider calls. That would still require browser provider host permissions and token handling.

### Decision: Gateway health exposes runtime capabilities without secrets

`/health` reports gateway status, protocol version, supported capabilities, memory repository availability, provider role availability, adapter names, model names when configured, and checked timestamp. It reports token presence only as booleans and never returns token values.

Rationale: The extension and developer tooling need enough observability to explain why overlay behavior is quiet without leaking secrets.

Alternative considered: keep health as a simple alive check. That would make provider/gateway misconfiguration hard to debug once the browser can no longer inspect provider config directly.

### Decision: Development stub remains a gateway mode

`npm run gateway:stub` continues to serve deterministic explain/rewrite responses through the same gateway handler and HTTP endpoints. The stub is explicit development behavior and does not reintroduce browser-local knowledge fallback.

Rationale: Local development and smoke testing need a visible overlay path without requiring a real provider token.

Alternative considered: keep browser-side fixture generation for smoke tests. That would violate the new production call-chain boundary and confuse test coverage.

## Risks / Trade-offs

- Provider configuration migration may break existing local demos -> Default extension config should point at localhost gateway, and gateway stub mode should remain easy to start.
- Gateway unavailable means no model-backed explanation -> Background should return structured unavailable results and proactive UI should remain quiet.
- Moving adapter execution may duplicate code initially -> Reuse existing adapter modules where possible and add tests around the runtime boundary rather than rewriting provider logic.
- Gateway logs can accidentally reveal secrets -> Log only redacted URLs, token presence, provider role, adapter, model name, status, reason, and duration.
- Browser diagnostics lose direct provider config visibility -> Gateway health/capabilities should expose redacted provider runtime state.
- Provider tokens in environment variables can still be misconfigured -> Normalize auth, rate limit, timeout, model unsupported, JSON parse, and schema failures to stable reasons.

## Migration Plan

1. Change extension defaults so explain and embedding provider roles are no longer browser configuration; keep only local gateway settings.
2. Remove vendor host permissions from the manifest and update tests to assert no external model-provider hosts are present.
3. Refactor background provider resolution so all Agent, rewrite, embedding, memory query, memory event, health, and capabilities calls use the local gateway client.
4. Add gateway runtime provider config loading from environment/config files with no source-default secrets.
5. Move or reuse the openai-compatible adapter behind gateway `/explain`, `/rewrite`, and `/embedding`.
6. Extend gateway health/capabilities and diagnostics with redacted runtime provider state.
7. Keep and test gateway stub mode for development.

Rollback: restore extension config to local gateway only and run `npm run gateway:stub`; provider-backed features become unavailable or stubbed through the gateway while content script and overlay behavior remain stable.

## Open Questions

- Should the first gateway provider config source be environment-only, a checked-in example config file, or both?
- Should gateway `/capabilities` be a separate endpoint, or should `/health` carry all capability information for MVP?
- Should `custom` without an adapter remain an internal Agent endpoint mode inside the gateway, or should all non-local providers require an explicit adapter?
