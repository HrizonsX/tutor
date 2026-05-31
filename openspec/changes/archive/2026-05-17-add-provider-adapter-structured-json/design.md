## Context

The current provider architecture already separates `off`, `local`, `custom`, and `cloud` modes and routes explain and embedding requests through the background service worker. The `local` path talks to the localhost gateway, while `custom` and `cloud` currently post the internal Agent request shape directly to the configured endpoint.

That direct-post behavior works for bespoke Agent services, but it does not match raw model-provider APIs such as OpenAI-compatible chat completions and embeddings. Those providers expect provider-specific URLs, headers, request bodies, structured output settings, and response parsing. The browser extension should keep those compatibility details behind one adapter boundary rather than spreading vendor logic through background, composer, diagnostics, or content code.

The user clarified that role-specific `token` values may be configured directly in `providerConfig`. The security boundary is therefore redaction and containment, not forcing tokens to be empty or storage-only.

## Goals / Non-Goals

**Goals:**
- Add a Provider Adapter layer for `custom` and `cloud` provider modes.
- Support at least one OpenAI-compatible adapter for chat completions and embeddings.
- Treat `endpoint` as a provider base URL and join it with `chatPath` or `embeddingPath` inside the adapter.
- Let provider role config directly specify `token`, `modelName`, `adapter`, and structured-output settings.
- Prefer structured JSON explain responses and validate them before creating explanation versions.
- Normalize provider, HTTP, JSON parsing, schema, auth, rate limit, and model unsupported failures to stable internal reasons.
- Keep `local` provider mode on the existing localhost gateway path.

**Non-Goals:**
- Add a local concept library or local semantic generation.
- Build a provider options UI.
- Maintain browser-side provider model allowlists.
- Implement provider-specific SDK dependencies.
- Change content script message shapes.

## Decisions

### Use an adapter interface between provider registry and network calls

The background service should continue to resolve a provider role through the registry, then hand external `custom` and `cloud` calls to an adapter selected by `provider.adapter`.

Alternative considered: keep posting internal Agent requests to `endpoint` and ask users to point endpoint at an Agent proxy. That keeps implementation smaller, but it fails the direct-provider requirement and leaves OpenAI-compatible behavior outside the extension contract.

### Preserve local gateway routing as a separate client

`provider: "local"` should continue to use the top-level `localGateway` endpoint and pairing token. It should not pass through the OpenAI-compatible adapter, even if `adapter` is configured on the role.

Alternative considered: make local gateway another adapter. That could unify dispatch code, but it risks changing local pairing, memory, health, and capability behavior that already has tests.

### Add a minimal adapter contract

Adapter modules should expose capability methods such as:

- `explain(request, providerContext)`
- `rewrite(request, providerContext)`
- `createEmbedding(payload, providerContext)`
- optional `health(providerContext)`

`providerContext` should include role, mode, base endpoint, token, model name, timeout, adapter config, path config, and a fetch implementation. Adapter results should already be normalized to the internal Agent protocol before returning to the background service.

### Support OpenAI-compatible structured-output modes by configuration

`structuredOutput` should be role-specific. For explain, it should support:

- `json_schema`: include provider-native JSON schema response format.
- `json_object`: request JSON object mode and include schema instructions in the prompt.
- `prompt_json`: omit provider-native response format and rely on prompt-only JSON instructions.

The adapter should not silently downgrade modes unless the configuration explicitly allows fallback. Unsupported provider responses should produce `provider_model_unsupported` or `provider_schema_invalid`, depending on whether the failure comes from provider rejection or returned content.

### Define a stable explain JSON schema at the adapter boundary

The OpenAI-compatible chat adapter should request and validate JSON with these normalized fields:

- `explanation`: user-facing short explanation.
- `summary`: optional concise summary for memory and diagnostics.
- `confidence`: numeric or enum confidence value that can be normalized.
- `terms`: array of relevant term metadata.
- `actions`: array of suggested UI or learning actions.
- `versionMetadata`: provider, model, schema, and generation metadata.

The adapter should map `explanation` into existing `text` and `microExplanation` fields so current overlay behavior remains compatible.

### Keep direct token configuration, but redact all observability surfaces

When `providerConfig.<role>.token` is present, it should be used for the Authorization header. Diagnostics should expose only token presence and redacted endpoints. Error details, health snapshots, content-script-visible state, and logs should not include token values.

## Risks / Trade-offs

- Provider-compatible APIs are similar but not identical -> keep the first adapter explicitly named OpenAI-compatible and centralize any deviations in adapter code.
- Structured output support varies by model -> make `structuredOutput.mode` explicit and map provider rejections to stable reasons.
- Prompt-only JSON can still return invalid JSON -> parse and schema failures must return unavailable or invalid results without creating explanation versions.
- Direct token configuration increases leakage risk -> keep token use background-only and expand redaction tests.
- Error mapping can hide provider-specific detail -> preserve safe diagnostic metadata such as provider, model, status code, and reason while redacting secrets.

## Migration Plan

1. Extend provider configuration and diagnostics shape without changing current content script messages.
2. Add adapter modules and route only `custom` and `cloud` providers through them when `adapter` is configured.
3. Preserve legacy custom Agent endpoint behavior only if the adapter is unset or explicitly set to an internal-agent adapter.
4. Add OpenAI-compatible chat and embedding mappings with tests.
5. Add structured JSON parsing and schema validation before result normalization.
6. Keep rollback simple: set provider mode to `local` or use an internal Agent adapter path; local gateway behavior remains untouched.

## Open Questions

- Should `custom` without an explicit `adapter` preserve the current internal Agent POST behavior, or should it be invalid once this change lands?
- Should `structuredOutput` allow automatic fallback from `json_schema` to `json_object`, or should fallback require explicit configuration?
- Should `confidence` be normalized to a number, a label, or both in the stable Explanation Result?
