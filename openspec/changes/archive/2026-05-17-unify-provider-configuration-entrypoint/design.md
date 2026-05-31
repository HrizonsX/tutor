## Context

The extension already routes Agent explanation, rewrite, embedding, health, diagnostics, and memory requests through the Manifest V3 background service worker. Current provider configuration is split between `agent` and `embedding` config blocks, with local gateway endpoint and pairing token fields nested under the Agent config. That shape makes it harder for options, popup, background, and diagnostics to describe one provider state consistently.

This change introduces a canonical provider configuration entrypoint owned by background. The entrypoint groups role-specific provider settings under `explain` and `embedding`, and keeps local gateway connection and pairing settings under a separate top-level `localGateway` section.

## Goals / Non-Goals

**Goals:**

- Define one provider configuration schema for explain, embedding, and local gateway pairing.
- Allow explain and embedding to use independent provider modes, endpoints, tokens, model names, timeouts, and health settings.
- Keep local gateway endpoint and pairing token as a top-level section shared by local explain, embedding, memory, and health calls.
- Treat configured model names as opaque strings; background propagates them when dispatching requests but the browser extension does not maintain provider model allowlists.
- Keep background as the only boundary that reads provider tokens, selects endpoints, dispatches requests, checks health, and normalizes provider errors.
- Expose redacted diagnostics including configured model names and token presence.

**Non-Goals:**

- Legacy migration from existing `agent` and `embedding` config fields.
- Browser-side model allowlists or provider-specific model validation.
- Strict endpoint policy validation for local, custom, or cloud endpoints.
- A separate content-safe config projection.
- A full options or popup UI redesign beyond the runtime configuration and diagnostics contracts needed by those surfaces.

## Decisions

### Decision: Use role-specific provider config plus top-level local gateway config

The canonical entrypoint uses this logical shape:

```js
providerConfig: {
  explain: {
    enabled: false,
    provider: "off",
    endpoint: "",
    token: "",
    modelName: "",
    timeoutMs: 8000,
    health: { enabled: true, cacheTtlMs: 30000 }
  },
  embedding: {
    enabled: false,
    provider: "off",
    endpoint: "",
    token: "",
    modelName: "",
    timeoutMs: 8000,
    health: { enabled: true, cacheTtlMs: 30000 }
  },
  localGateway: {
    endpoint: "http://127.0.0.1:17321",
    pairingToken: "",
    timeoutMs: 8000,
    health: { enabled: true, cacheTtlMs: 30000 }
  }
}
```

Rationale: explain and embedding are separate provider roles, while local gateway pairing protects the shared localhost service rather than either model role individually. Keeping `localGateway` top-level avoids duplicating pairing state across explain and embedding.

Alternative considered: Nest local gateway settings under each provider role when `provider` is `local`. That duplicates endpoint and pairing token state and makes diagnostics harder to explain.

### Decision: Model names are opaque configuration values

The browser extension records the configured `modelName` for explain and embedding and includes it in outbound provider requests when configured. It does not maintain provider model allowlists and does not infer whether a model is supported before dispatch.

Rationale: the extension's responsibility is signal collection, background dispatch, and error normalization, not provider catalog management. Provider-specific model support can change outside the extension.

Alternative considered: Add provider-specific allowlists in the extension. That would create stale model data and make the extension responsible for provider knowledge it does not need.

### Decision: Tokens are role-separated but not migrated

Explain token, embedding token, and local pairing token are separate configuration fields. This change does not migrate old storage keys or compatibility fields.

Rationale: role separation prevents accidental reuse of explain credentials for embeddings or local pairing. Skipping migration keeps the change focused on the new entrypoint contract.

Alternative considered: Preserve existing `agent.apiKeyStorageKey`, `embedding.apiKeyStorageKey`, and `localGatewayToken` migration behavior. That adds compatibility work outside this change's agreed scope.

### Decision: Background owns canonical state and dispatch

Background owns canonical provider config, token reading, endpoint selection, timeout selection, model dispatch, health checks, and error normalization. Options, popup, diagnostics, and content callers use runtime messaging to read or request provider behavior.

Rationale: background is the extension component suited to hold provider boundaries and normalize behavior across browser surfaces.

Alternative considered: Let surfaces read config directly. That would spread provider state and make diagnostics, token handling, and error behavior inconsistent.

### Decision: Diagnostics expose redacted provider state

Diagnostics include provider mode, health, capabilities, active endpoint, configured model name, token presence, local pairing status, and latest provider error. Diagnostics must redact token values, pairing tokens, API keys, query tokens, and other secret values.

Rationale: model names and token presence are useful for troubleshooting, while secret values are not needed in diagnostics and must not be exposed there.

Alternative considered: Hide model names from diagnostics. That would make common provider misconfiguration harder to troubleshoot without materially improving secret handling.

## Risks / Trade-offs

- Existing tests or development config may still use old `agent` and `embedding` fields -> Update tests and fixtures to use the new `providerConfig` entrypoint in this change.
- Provider returns a model-unsupported error after dispatch -> Normalize it as a structured provider error without introducing browser-side model allowlists.
- Token values may be stored in direct config fields during MVP development -> Keep diagnostics redaction strict and keep token reading/dispatch behind background.
- Options and popup UI may lag behind the new config contract -> Expose stable runtime messaging and diagnostics first so UI can be added on top later.

## Migration Plan

1. Add the new provider configuration shape and merge behavior.
2. Update provider registry resolution for explain and embedding roles.
3. Update background explain, rewrite, embedding, health, and diagnostics paths to use the new role-specific config.
4. Add structured validation for required role fields and local pairing state.
5. Update diagnostics to expose redacted role state, model names, token presence, and latest provider error.
6. Update tests for config contracts, provider dispatch, model propagation, token separation, and diagnostics redaction.

Rollback: set both provider roles to `off` and keep local gateway unused; provider-backed explanation and embedding requests return structured unavailable results.

## Open Questions

None. Scope decisions are captured in this design: no legacy migration, no model allowlists, no strict endpoint validation, and no separate content-safe projection in this change.
