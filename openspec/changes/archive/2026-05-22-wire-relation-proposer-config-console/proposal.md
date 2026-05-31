## Why

The cognitive memory layer has storage, daily summaries, relation gating, and bridge recall, but the real `/explain` path schedules relation discovery without a relation proposer, so no active relations are automatically created for future `memoryBridges`. Provider and memory runtime settings are also mostly process-start configuration, while the browser options page already presents a configuration-console shape but cannot update runtime-owned settings.

## What Changes

- Wire a runtime-owned LLM relation proposer into asynchronous relation discovery after successful explain/rewrite persistence.
- Add a relation proposer provider role that can be disabled, reuse the explain provider, or use independent OpenAI-compatible routing.
- Add browser options/background configuration flows for reading, validating, saving, and redacting runtime configuration.
- Add gateway configuration APIs that persist mutable runtime settings and apply supported hot updates without restarting the gateway process.
- Define which configuration classes are hot-updatable: provider routing, relation proposer settings, recall limits, explanation/intervention thresholds, and browser-to-gateway connection settings.
- Keep process-bound settings such as gateway host/port, memory store mode/path, schema version, and destructive memory maintenance outside normal hot-update behavior.
- Extend diagnostics and health snapshots with redacted config version, relation proposer status, last update metadata, and hot-update limitations.
- Preserve the browser stateless memory boundary: the browser may edit runtime configuration, but it does not own the memory graph or relation proposal persistence.

## Capabilities

### New Capabilities
- `runtime-config-console`: Browser options and background/gateway configuration control plane for safe runtime configuration reads, writes, validation, redaction, and supported hot updates.
- `runtime-relation-proposer`: Runtime-owned LLM relation proposal dispatch, gating, persistence, scheduling, and diagnostic behavior.

### Modified Capabilities
- `provider-configuration`: Add relation proposer role configuration and distinguish hot-updatable runtime settings from restart-required settings.
- `local-agent-memory-gateway`: Add gateway config APIs and require relation proposer dispatch to be owned by Gateway / Local Agent Runtime.
- `local-memory-store`: Require scheduled relation discovery to use configured proposer output when available and expose relation discovery state without storing evidence snippets.
- `provider-adapter-structured-json`: Require adapter-backed structured relation proposal calls to use the constrained relation proposal schema.
- `runtime-observability`: Expose redacted runtime config version, relation proposer status, and config update diagnostics.

## Impact

- Affected code: `src/options.html`, `src/options.js`, `src/background.js`, `src/agent-service.js`, `src/contracts.js`, `src/provider-registry.js`, `src/local-gateway.js`, `src/local-memory-store.js`, `src/provider-adapters.js`, `src/diagnostics.js`, and gateway startup scripts.
- Affected APIs: new background runtime messages for config get/update and new gateway endpoints for runtime config get/update; `/health` and diagnostics gain redacted config metadata.
- Affected storage: gateway persists mutable runtime configuration separately from raw memory data; secrets are stored only in runtime-owned configuration storage and are redacted from diagnostics.
- Affected tests: options UI/view model tests, background config message tests, gateway config API tests, runtime provider hot-update tests, relation proposer dispatch tests, and end-to-end smoke coverage for automatic `memoryBridges` after relation discovery.
