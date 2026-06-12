import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConfigFormModel,
  buildOptionsViewModel,
  createConfigUpdatePayload,
  formatBytes,
  mergeBrowserConfigForStorage,
  formatStorageEstimate,
  resolveConfigSaveStatus,
  runConfigSaveOnce,
  saveConfigUpdate
} from "../src/options.js";
import { AgentCapability, AgentResultStatus, ProviderKind, ProviderRole } from "../src/contracts.js";

test("options view model renders an explicit empty state before diagnostics arrive", () => {
  const model = buildOptionsViewModel();

  assert.equal(model.provider.text, "未配置");
  assert.equal(model.connection.text, "未连接");
  assert.equal(model.capabilities.map((row) => row.label).join(","), "DOM 读取,DOM 修改,网络拦截,IndexedDB 访问");
  assert.equal(model.memory.storage.text, "—");
  assert.deepEqual(model.decisions, []);
  assert.equal(model.snapshot.status, "no_diagnostics_yet");
  // No fabricated telemetry anywhere in the empty-state model.
  assert.doesNotMatch(JSON.stringify(model), /llama-3-8b|12ms|12\.4 MB|#DEC-09/);
});

test("options view model maps live diagnostics and gateway health", () => {
  const model = buildOptionsViewModel({
    diagnostics: {
      providerMode: ProviderKind.LOCAL,
      providerRoles: {
        [ProviderRole.EXPLAIN]: {
          mode: ProviderKind.LOCAL,
          modelName: "explain-model"
        }
      },
      lastAgentResult: {
        status: AgentResultStatus.UNAVAILABLE,
        reason: "provider_capability_unsupported",
        target: "KL divergence",
        timestamp: 2000
      }
    },
    health: {
      status: AgentResultStatus.AVAILABLE,
      mode: ProviderKind.LOCAL,
      capabilities: { [AgentCapability.EXPLAIN]: true },
      memoryRepository: {
        status: "available",
        summarizer: { status: "available", backlogSize: 2 },
        cognitiveMemory: { conceptProjectionCount: 7 }
      }
    },
    storageEstimate: { usage: 25 * 1024 * 1024, quota: 100 * 1024 * 1024 },
    latencyMs: 18,
    now: () => 2000
  });

  assert.equal(model.provider.text, "本地 (explain-model)");
  assert.equal(model.connection.text, "稳定 (18ms 延迟)");
  assert.equal(model.memory.storage.text, "25.0 MB / 100.0 MB");
  assert.equal(model.memory.storage.ratio, 25);
  assert.equal(model.memory.vectorCount.text, "7");
  assert.equal(model.memory.summarizer.text, "排队");
  assert.equal(model.decisions[0].action, "终止 (无动作)");
});

test("options view model shows explicit unpaired guidance when pairing token is missing or rejected", () => {
  const required = buildOptionsViewModel({
    health: {
      status: AgentResultStatus.UNAVAILABLE,
      reason: "local_gateway_pairing_required"
    }
  });
  const rejected = buildOptionsViewModel({
    health: {
      status: AgentResultStatus.UNAVAILABLE,
      reason: "local_gateway_pairing_rejected"
    }
  });

  assert.equal(required.connection.text, "未配对 (请在下方填写配对 token)");
  assert.equal(required.connection.tone, "danger");
  assert.equal(rejected.connection.text, "未配对 (配对 token 被网关拒绝)");
  assert.equal(rejected.connection.tone, "danger");
});

test("options view model exposes layered memory component status", () => {
  const model = buildOptionsViewModel({
    health: {
      status: AgentResultStatus.AVAILABLE,
      memoryRepository: {
        status: AgentResultStatus.AVAILABLE,
        storeMode: "layered",
        layered: {
          postgres: { status: AgentResultStatus.AVAILABLE },
          redis: { status: AgentResultStatus.UNAVAILABLE, reason: "redis_session_write_failed" },
          vectorRecall: { status: "disabled", mode: "disabled" },
          outbox: { status: AgentResultStatus.AVAILABLE, pendingCount: 2 }
        }
      }
    }
  });

  assert.equal(model.memory.backend.text, "layered");
  assert.equal(model.memory.layered.postgres.status, AgentResultStatus.AVAILABLE);
  assert.equal(model.memory.layered.redis.reason, "redis_session_write_failed");
  assert.equal(model.memory.layered.vectorRecall.mode, "disabled");
  assert.equal(model.memory.layered.outbox.pendingCount, 2);
});

test("options storage formatting is bounded and readable", () => {
  assert.equal(formatBytes(1024 * 1024), "1.0 MB");
  // Degraded input (zero quota) renders an explicit em dash, never an
  // invented usage figure.
  assert.deepEqual(formatStorageEstimate({ usage: 5, quota: 0 }), { text: "—", ratio: 0 });
  assert.equal(formatStorageEstimate({ usage: 150, quota: 100 }).ratio, 100);
});

test("options config form model separates browser-local and gateway-owned settings", () => {
  const model = buildConfigFormModel({
    browserConfig: {
      featureEnabled: true,
      inference: { showThreshold: 0.62 },
      composer: { maxMicroChars: 200 },
      localGateway: { endpoint: "http://127.0.0.1:17321", pairingToken: "local-secret" }
    },
    gatewayConfig: {
      config: {
        explain: {
          enabled: true,
          provider: ProviderKind.CUSTOM,
          modelName: "explain-model",
          tokenPresent: true
        },
        relationProposer: {
          enabled: true,
          reuseExplainProvider: true,
          modelName: ""
        },
        memory: {
          cognitive: { selectedDayLimit: 4, microBridgeLimit: 1 }
        }
      },
      hotUpdateFields: ["explain.modelName", "relationProposer.enabled"],
      restartRequiredFields: ["localGateway.port", "memory.schemaVersion"]
    }
  });

  assert.equal(model.browser.featureEnabled, true);
  assert.equal(model.browser.localGateway.pairingTokenPresent, true);
  assert.equal(model.gateway.provider.modelName, "explain-model");
  assert.equal(model.gateway.provider.tokenPresent, true);
  assert.equal(model.gateway.relationProposer.enabled, true);
  assert.equal(model.gateway.memory.selectedDayLimit, 4);
  assert.ok(model.gateway.restartRequiredFields.includes("memory.schemaVersion"));
});

test("options config update payload keeps provider secrets gateway-owned", () => {
  const payload = createConfigUpdatePayload({
    browser: {
      featureEnabled: false,
      inference: { showThreshold: 0.7 },
      localGateway: { endpoint: "http://127.0.0.1:17321", pairingToken: "local-secret" }
    },
    gateway: {
      explain: {
        modelName: "next-model",
        token: "provider-secret"
      },
      relationProposer: {
        enabled: true,
        reuseExplainProvider: false,
        modelName: "relation-model"
      }
    }
  });

  assert.equal(payload.browser.featureEnabled, false);
  assert.equal(payload.browser.localGateway.pairingToken, "local-secret");
  assert.equal(payload.gateway.explain.token, "provider-secret");
  assert.equal(payload.gateway.relationProposer.modelName, "relation-model");
  assert.doesNotMatch(JSON.stringify(payload.browser), /provider-secret|relation-model/);
});

test("options browser config storage merge preserves blank secret fields", () => {
  const merged = mergeBrowserConfigForStorage(
    {
      featureEnabled: true,
      inference: { showThreshold: 0.61 },
      localGateway: {
        endpoint: "http://127.0.0.1:17321",
        pairingToken: "custom-secret",
        timeoutMs: 8000
      }
    },
    {
      inference: { showThreshold: 0.72 },
      localGateway: {
        endpoint: "http://127.0.0.1:17321",
        timeoutMs: 9000
      }
    }
  );

  assert.equal(merged.inference.showThreshold, 0.72);
  assert.equal(merged.localGateway.timeoutMs, 9000);
  assert.equal(merged.localGateway.pairingToken, "custom-secret");

  const replaced = mergeBrowserConfigForStorage(merged, {
    localGateway: { pairingToken: "next-secret" }
  });

  assert.equal(replaced.localGateway.pairingToken, "next-secret");
});

test("options preserves transient save status across config panel refresh", () => {
  assert.equal(resolveConfigSaveStatus({ transientStatus: "saved", gatewayStatus: "" }), "saved");
  assert.equal(resolveConfigSaveStatus({ transientStatus: "", gatewayStatus: "saved" }), "saved");
});

test("options ignores duplicate save attempts while a save is in flight", async () => {
  const state = { inFlight: false };
  let saveCount = 0;
  let finishFirstSave;
  const firstSave = new Promise((resolve) => {
    finishFirstSave = resolve;
  });

  const first = runConfigSaveOnce(state, async () => {
    saveCount += 1;
    await firstSave;
    return "first";
  });
  const second = await runConfigSaveOnce(state, async () => {
    saveCount += 1;
    return "second";
  });

  assert.equal(second.skipped, true);
  assert.equal(saveCount, 1);

  finishFirstSave();
  assert.deepEqual(await first, { skipped: false, value: "first" });

  const third = await runConfigSaveOnce(state, async () => {
    saveCount += 1;
    return "third";
  });

  assert.deepEqual(third, { skipped: false, value: "third" });
  assert.equal(saveCount, 2);
});

test("options applies browser runtime config before gateway config save", async () => {
  const calls = [];
  const payload = {
    browser: {
      localGateway: {
        endpoint: "http://127.0.0.1:18001",
        pairingToken: "dev-secret"
      }
    },
    gateway: {
      memory: {
        cognitive: { selectedDayLimit: 9 }
      }
    }
  };

  const result = await saveConfigUpdate({
    payload,
    writeBrowserConfig: async (config) => {
      calls.push(["writeBrowserConfig", config.localGateway.endpoint]);
      return { status: AgentResultStatus.AVAILABLE };
    },
    updateBrowserRuntimeConfig: async (config) => {
      calls.push(["updateBrowserRuntimeConfig", config.localGateway.endpoint]);
      return { status: AgentResultStatus.AVAILABLE };
    },
    updateRuntimeConfig: async (config) => {
      calls.push(["updateRuntimeConfig", config.memory.cognitive.selectedDayLimit]);
      return { status: AgentResultStatus.AVAILABLE };
    }
  });

  assert.deepEqual(calls, [
    ["writeBrowserConfig", "http://127.0.0.1:18001"],
    ["updateBrowserRuntimeConfig", "http://127.0.0.1:18001"],
    ["updateRuntimeConfig", 9]
  ]);
  assert.equal(result.browserResult.status, AgentResultStatus.AVAILABLE);
  assert.equal(result.gatewayResult.status, AgentResultStatus.AVAILABLE);
});
