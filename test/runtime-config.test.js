import test from "node:test";
import assert from "node:assert/strict";
import {
  AgentResultStatus,
  ProviderAdapter,
  ProviderKind,
  StructuredOutputMode
} from "../src/shared/contracts.js";
import {
  createGatewayRuntimeConfig,
  createGatewayRuntimeConfigState,
  redactRuntimeConfig
} from "../src/gateway/runtime-config.js";

test("gateway runtime config includes relation proposer role defaults", () => {
  const config = createGatewayRuntimeConfig({ env: {} });

  assert.equal(config.explain.token, "");
  assert.equal(config.embedding.token, "");
  assert.equal(config.relationProposer.enabled, false);
  assert.equal(config.relationProposer.reuseExplainProvider, true);
  assert.equal(config.relationProposer.provider, ProviderKind.OFF);
  assert.equal(config.relationProposer.adapter, ProviderAdapter.NONE);
  assert.equal(config.relationProposer.chatPath, "/chat/completions");
  assert.equal(config.relationProposer.structuredOutput.mode, StructuredOutputMode.JSON_SCHEMA);
  assert.equal(config.relationProposer.structuredOutput.schemaName, "bco_relation_proposal_result");
  assert.equal(config.memory.repository, "sqlite");
  assert.equal(config.memory.postgres.connectionString, "");
  assert.equal(config.memory.redis.url, "");
  assert.equal(config.memory.vectorRecall.mode, "disabled");
  assert.equal(config.memory.outbox.enabled, true);
});

test("gateway runtime config enables relation proposer when explain provider is enabled", () => {
  const config = createGatewayRuntimeConfig({
    providerConfig: {
      explain: {
        enabled: true,
        provider: ProviderKind.CUSTOM,
        adapter: ProviderAdapter.OPENAI_COMPATIBLE,
        endpoint: "https://api.example/v1",
        token: "secret-token",
        modelName: "explain-model"
      }
    }
  });

  assert.equal(config.relationProposer.enabled, true);
  assert.equal(config.relationProposer.reuseExplainProvider, true);
});

test("runtime config redaction reports secret presence without exposing values", () => {
  const redacted = redactRuntimeConfig(createGatewayRuntimeConfig({
    providerConfig: {
      explain: {
        enabled: true,
        provider: ProviderKind.CUSTOM,
        adapter: ProviderAdapter.OPENAI_COMPATIBLE,
        endpoint: "https://api.example/v1?api_key=hidden",
        token: "secret-token",
        modelName: "explain-model"
      },
      relationProposer: {
        enabled: true,
        reuseExplainProvider: false,
        provider: ProviderKind.CUSTOM,
        adapter: ProviderAdapter.OPENAI_COMPATIBLE,
        endpoint: "https://rel.example/v1?token=hidden",
        token: "relation-token",
        modelName: "relation-model"
      }
    }
  }));

  assert.equal(redacted.explain.token, "");
  assert.equal(redacted.explain.tokenPresent, true);
  assert.equal(redacted.relationProposer.token, "");
  assert.equal(redacted.relationProposer.tokenPresent, true);
  assert.match(redacted.explain.endpoint, /api_key=<redacted>/);
  assert.match(redacted.relationProposer.endpoint, /token=<redacted>/);
  assert.doesNotMatch(JSON.stringify(redacted), /secret-token|relation-token|hidden/);
});

test("runtime config reads layered memory environment and redacts connection secrets", () => {
  const config = createGatewayRuntimeConfig({
    env: {
      BCO_GATEWAY_MEMORY_REPOSITORY: "layered",
      BCO_GATEWAY_POSTGRES_URL: "postgres://user:secret@localhost:5432/bco?sslmode=disable",
      BCO_GATEWAY_REDIS_URL: "redis://:secret@localhost:6379/0",
      BCO_GATEWAY_VECTOR_RECALL_MODE: "test",
      BCO_GATEWAY_OUTBOX_POLL_INTERVAL_MS: "2500",
      BCO_GATEWAY_OUTBOX_BATCH_SIZE: "12"
    }
  });
  const redacted = redactRuntimeConfig(config);

  assert.equal(config.memory.repository, "layered");
  assert.equal(config.memory.postgres.connectionString, "postgres://user:secret@localhost:5432/bco?sslmode=disable");
  assert.equal(config.memory.redis.url, "redis://:secret@localhost:6379/0");
  assert.equal(config.memory.vectorRecall.mode, "test");
  assert.equal(config.memory.outbox.pollIntervalMs, 2500);
  assert.equal(config.memory.outbox.batchSize, 12);
  assert.match(redacted.memory.postgres.connectionString, /<redacted>/);
  assert.match(redacted.memory.redis.url, /<redacted>/);
  assert.doesNotMatch(JSON.stringify(redacted), /user:secret|:secret@/);
});

test("runtime config preserves legacy memory storeMode as repository selection", () => {
  const config = createGatewayRuntimeConfig({
    providerConfig: {
      memory: { storeMode: "memory" }
    }
  });

  assert.equal(config.memory.repository, "memory");
  assert.equal(config.memory.storeMode, "memory");
});

test("runtime config state hot-applies provider and memory policy fields", () => {
  const persisted = [];
  const state = createGatewayRuntimeConfigState({
    now: () => 5000,
    providerConfig: {
      explain: {
        enabled: true,
        provider: ProviderKind.CUSTOM,
        adapter: ProviderAdapter.OPENAI_COMPATIBLE,
        endpoint: "https://api.example/v1",
        token: "first-token",
        modelName: "first-model"
      }
    },
    storage: {
      read: () => ({ explain: { modelName: "stored-model" } }),
      write: (config) => persisted.push(config)
    }
  });

  assert.equal(state.getEffectiveConfig().explain.modelName, "stored-model");

  const update = state.update({
    explain: { modelName: "next-model", token: "next-token", timeoutMs: 9000 },
    relationProposer: { enabled: true, reuseExplainProvider: true },
    memory: { schemaVersion: 99, repository: "layered", cognitive: { selectedDayLimit: 4 } },
    localGateway: { port: 18000 }
  });
  const read = state.read();

  assert.equal(update.status, AgentResultStatus.AVAILABLE);
  assert.deepEqual(update.appliedPaths.sort(), [
    "explain.modelName",
    "explain.timeoutMs",
    "explain.token",
    "memory.cognitive.selectedDayLimit",
    "relationProposer.enabled",
    "relationProposer.reuseExplainProvider"
  ]);
  assert.deepEqual(update.restartRequiredPaths.sort(), ["localGateway.port", "memory.repository", "memory.schemaVersion"]);
  assert.equal(state.getEffectiveConfig().explain.token, "next-token");
  assert.equal(state.getEffectiveConfig().memory.cognitive.selectedDayLimit, 4);
  assert.equal(read.config.explain.tokenPresent, true);
  assert.equal(read.version, 2);
  assert.equal(read.lastUpdatedAt, 5000);
  assert.equal(persisted.length, 1);
});

test("runtime config state rejects invalid hot update values without mutation", () => {
  const state = createGatewayRuntimeConfigState({
    providerConfig: {
      explain: { timeoutMs: 8000 }
    }
  });

  const update = state.update({
    explain: { timeoutMs: -1 }
  });

  assert.equal(update.status, AgentResultStatus.INVALID);
  assert.equal(update.validationFailures[0].path, "explain.timeoutMs");
  assert.equal(state.getEffectiveConfig().explain.timeoutMs, 8000);
});

test("runtime config rejects provider endpoints that are not http or https URLs", () => {
  const state = createGatewayRuntimeConfigState({
    providerConfig: {
      explain: { endpoint: "https://api.example/v1" }
    }
  });

  const ftpUpdate = state.update({ explain: { endpoint: "ftp://attacker.example" } });
  const garbageUpdate = state.update({ explain: { endpoint: "not a url" } });
  const fileUpdate = state.update({ embedding: { endpoint: "file:///etc/passwd" } });

  assert.equal(ftpUpdate.status, AgentResultStatus.INVALID);
  assert.equal(ftpUpdate.validationFailures[0].path, "explain.endpoint");
  assert.equal(ftpUpdate.validationFailures[0].reason, "runtime_config_endpoint_invalid");
  assert.equal(garbageUpdate.status, AgentResultStatus.INVALID);
  assert.equal(fileUpdate.status, AgentResultStatus.INVALID);
  assert.equal(fileUpdate.validationFailures[0].path, "embedding.endpoint");
  assert.equal(state.getEffectiveConfig().explain.endpoint, "https://api.example/v1");
});

test("runtime config accepts valid https endpoints and clearing an endpoint", () => {
  const state = createGatewayRuntimeConfigState({});

  const httpsUpdate = state.update({ explain: { endpoint: "https://api.deepseek.com" } });
  const clearedUpdate = state.update({ explain: { endpoint: "" } });

  assert.equal(httpsUpdate.status, AgentResultStatus.AVAILABLE);
  assert.deepEqual(httpsUpdate.appliedPaths, ["explain.endpoint"]);
  assert.equal(clearedUpdate.status, AgentResultStatus.AVAILABLE);
});

test("runtime config enforces the provider host allowlist when configured", () => {
  const previous = process.env.BCO_GATEWAY_ALLOWED_PROVIDER_HOSTS;
  process.env.BCO_GATEWAY_ALLOWED_PROVIDER_HOSTS = "api.deepseek.com, api.openai.com";
  try {
    const state = createGatewayRuntimeConfigState({});

    const allowed = state.update({ explain: { endpoint: "https://api.deepseek.com/v1" } });
    const blocked = state.update({ explain: { endpoint: "https://attacker.example/v1" } });

    assert.equal(allowed.status, AgentResultStatus.AVAILABLE);
    assert.equal(blocked.status, AgentResultStatus.INVALID);
    assert.equal(blocked.validationFailures[0].reason, "runtime_config_endpoint_host_not_allowed");
  } finally {
    if (previous === undefined) {
      delete process.env.BCO_GATEWAY_ALLOWED_PROVIDER_HOSTS;
    } else {
      process.env.BCO_GATEWAY_ALLOWED_PROVIDER_HOSTS = previous;
    }
  }
});

test("runtime config rejects unsupported provider adapters and modes", () => {
  const state = createGatewayRuntimeConfigState({});

  const badAdapter = state.update({ explain: { adapter: "bogus-adapter" } });
  const badProvider = state.update({ relationProposer: { provider: "bogus-provider" } });
  const goodAdapter = state.update({ explain: { adapter: "openai-compatible" } });
  const goodProvider = state.update({ explain: { provider: ProviderKind.CUSTOM } });

  assert.equal(badAdapter.status, AgentResultStatus.INVALID);
  assert.equal(badAdapter.validationFailures[0].reason, "runtime_config_adapter_unsupported");
  assert.equal(badProvider.status, AgentResultStatus.INVALID);
  assert.equal(badProvider.validationFailures[0].reason, "runtime_config_provider_unsupported");
  assert.equal(goodAdapter.status, AgentResultStatus.AVAILABLE);
  assert.equal(goodProvider.status, AgentResultStatus.AVAILABLE);
});

test("runtime config keeps relative chat paths valid and rejects non-rooted ones", () => {
  const state = createGatewayRuntimeConfigState({});

  const defaultPath = state.update({ explain: { chatPath: "/chat/completions" } });
  const relativePath = state.update({ explain: { chatPath: "chat/completions" } });
  const absoluteUrl = state.update({ embedding: { embeddingPath: "https://attacker.example/x" } });

  assert.equal(defaultPath.status, AgentResultStatus.AVAILABLE);
  assert.equal(relativePath.status, AgentResultStatus.INVALID);
  assert.equal(relativePath.validationFailures[0].reason, "runtime_config_path_invalid");
  assert.equal(absoluteUrl.status, AgentResultStatus.INVALID);
});

test("runtime config bounds provider token values", () => {
  const state = createGatewayRuntimeConfigState({});

  const maxLength = state.update({ explain: { token: "x".repeat(512) } });
  const tooLong = state.update({ explain: { token: "x".repeat(513) } });
  const nonString = state.update({ explain: { token: 12345 } });

  assert.equal(maxLength.status, AgentResultStatus.AVAILABLE);
  assert.equal(tooLong.status, AgentResultStatus.INVALID);
  assert.equal(tooLong.validationFailures[0].reason, "runtime_config_token_invalid");
  assert.equal(nonString.status, AgentResultStatus.INVALID);
});
