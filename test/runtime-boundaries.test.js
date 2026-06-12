// Unit tests for the runtime modules extracted by the gateway boundary split:
// Provider Runtime dispatch, the Memory Runtime facade, and the Local Agent
// Runtime composition.
import test from "node:test";
import assert from "node:assert/strict";
import {
  AgentCapability,
  AgentResultStatus,
  ProviderRole
} from "../src/contracts.js";
import { createGatewayProviderRuntime } from "../src/provider-runtime.js";
import { createMemoryRuntime } from "../src/memory-runtime.js";
import { createLocalAgentRuntime } from "../src/local-agent-runtime.js";
import { createLocalMemoryStore } from "../src/local-memory-store.js";
import { createGatewayRuntimeConfigState } from "../src/runtime-config.js";

function enabledExplainConfig(overrides = {}) {
  return {
    explain: {
      enabled: true,
      provider: "custom",
      adapter: "openai-compatible",
      endpoint: "https://api.example/v1",
      token: "provider-secret",
      modelName: "test-model",
      chatPath: "/chat/completions",
      timeoutMs: 2000,
      ...overrides
    }
  };
}

test("provider runtime reports role-specific unavailable reasons without dispatching", async () => {
  const runtime = createGatewayProviderRuntime({
    providerConfig: {},
    fetchImpl: () => {
      throw new Error("fetch must not be called for disabled providers");
    }
  });

  const explain = await runtime.explain({ target: { canonicalName: "KL divergence" } });
  const rewrite = await runtime.rewrite({ target: { canonicalName: "KL divergence" } });
  const embedding = await runtime.createEmbedding({ text: "KL divergence" });
  const relations = await runtime.proposeRelations({ target: { canonicalName: "KL divergence" } });

  assert.equal(explain.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(explain.reason, "explain_provider_off");
  assert.equal(rewrite.reason, "explain_provider_off");
  assert.equal(rewrite.capabilityKind, AgentCapability.REWRITE);
  assert.equal(embedding.reason, "embedding_provider_disabled");
  assert.equal(embedding.providerRole, ProviderRole.EMBEDDING);
  assert.equal(embedding.vector, null);
  assert.equal(relations.reason, "relation_proposer_disabled");
  assert.equal(relations.providerRole, ProviderRole.RELATION_PROPOSER);
});

test("provider runtime dispatches explain and rewrite through the shared adapter path", async () => {
  const fetchCalls = [];
  const runtime = createGatewayProviderRuntime({
    providerConfig: enabledExplainConfig(),
    fetchImpl: async (url, options) => {
      fetchCalls.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({ explanation: "KL divergence measures distribution drift." })
            }
          }]
        })
      };
    }
  });

  const explain = await runtime.explain({
    target: { canonicalName: "KL divergence", observedText: "KL divergence" },
    capabilityKind: AgentCapability.EXPLAIN
  });

  assert.equal(explain.status, AgentResultStatus.AVAILABLE);
  assert.equal(fetchCalls.length, 1);
  assert.match(String(fetchCalls[0].url), /api\.example\/v1\/chat\/completions/);
  assert.ok(fetchCalls[0].options.signal, "dispatch must pass an abort signal to the adapter fetch");
});

test("internal-agent adapter is rejected as unconfigured instead of advertising a dead capability", async () => {
  const runtime = createGatewayProviderRuntime({
    providerConfig: enabledExplainConfig({ adapter: "internal-agent" }),
    fetchImpl: () => {
      throw new Error("fetch must not be called for the internal-agent adapter");
    }
  });

  const result = await runtime.explain({ target: { canonicalName: "KL divergence" } });

  assert.equal(result.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(result.reason, "provider_adapter_unconfigured");
  assert.equal(runtime.capabilities[AgentCapability.EXPLAIN], false);
  assert.equal(runtime.providerRoles[ProviderRole.EXPLAIN].tokenPresent, true);
});

test("memory runtime facade delegates to the store and mirrors only available methods", async () => {
  const calls = [];
  const fakeStore = {
    writeEvent: async (payload) => {
      calls.push(["writeEvent", payload]);
      return { id: "evt_1", status: AgentResultStatus.AVAILABLE };
    },
    queryMemory: async (query) => {
      calls.push(["queryMemory", query]);
      return { status: AgentResultStatus.AVAILABLE, target: { canonicalName: query.canonicalName } };
    },
    getHealth: () => ({ mode: "local_gateway", status: "available" }),
    updateConfig: (update) => {
      calls.push(["updateConfig", update]);
      return { applied: true };
    },
    scheduleRelationDiscovery: async (request) => {
      calls.push(["scheduleRelationDiscovery", request]);
      return { scheduled: true };
    },
    close: () => {
      calls.push(["close"]);
    }
  };
  const memoryRuntime = createMemoryRuntime({ store: fakeStore });

  await memoryRuntime.writeEvent({ event: { canonicalName: "KL divergence" } });
  await memoryRuntime.queryMemory({ canonicalName: "KL divergence" });
  memoryRuntime.updateCognitiveConfig({ memory: { cognitive: {} } });
  await memoryRuntime.scheduleRelationDiscovery({ target: { canonicalName: "KL divergence" } });
  memoryRuntime.close();

  assert.deepEqual(calls.map(([name]) => name),
    ["writeEvent", "queryMemory", "updateConfig", "scheduleRelationDiscovery", "close"]);
  assert.deepEqual(memoryRuntime.getHealth(), { mode: "local_gateway", status: "available" });
  // Methods the underlying store does not provide must stay absent so the
  // pipeline's optional-chaining capability probes keep working.
  assert.equal(memoryRuntime.discoverPreRecallMemoryBridges, undefined);
  assert.equal(memoryRuntime.commitPreRecallRelations, undefined);
  assert.equal(memoryRuntime.readProfileSummary, undefined);
});

test("memory runtime writeEvents stops at the first unavailable write", async () => {
  let writes = 0;
  const memoryRuntime = createMemoryRuntime({
    store: {
      writeEvent: async () => {
        writes += 1;
        if (writes === 2) return { status: AgentResultStatus.UNAVAILABLE, reason: "layered_postgres_write_failed" };
        return { id: `evt_${writes}`, status: AgentResultStatus.AVAILABLE };
      }
    }
  });

  const results = await memoryRuntime.writeEvents([{ event: {} }, { event: {} }, { event: {} }]);

  assert.equal(writes, 2, "third write must not run after an unavailable result");
  assert.equal(results.length, 2);
  assert.equal(results[1].status, AgentResultStatus.UNAVAILABLE);
});

test("local agent runtime explains through memory, policy, and provider in order", async () => {
  const store = createLocalMemoryStore({ now: () => 1000, autoProcessBacklog: false });
  const providerRequests = [];
  const agentRuntime = createLocalAgentRuntime({
    store,
    explainHandler: async (request) => {
      providerRequests.push(request);
      return {
        status: AgentResultStatus.AVAILABLE,
        target: request.target,
        microExplanation: "KL divergence keeps policy updates close.",
        versionMetadata: { id: "ver_kl" }
      };
    },
    now: () => 1000
  });

  const result = await agentRuntime.explain({
    target: { canonicalName: "KL divergence", observedText: "KL divergence" }
  });

  assert.equal(result.status, AgentResultStatus.AVAILABLE);
  assert.equal(result.runtimeDecision.kind, "call_provider");
  assert.equal(providerRequests.length, 1);
  assert.equal(providerRequests[0].memoryPacket.localMemoryRole, "learning_state");

  // The provider result must be persisted through the memory runtime: a
  // repeated identical request hits the duplicate/persistence path instead of
  // calling the provider again.
  const repeat = await agentRuntime.explain({
    target: { canonicalName: "KL divergence", observedText: "KL divergence" }
  });
  assert.equal(providerRequests.length, 1, "duplicate request must not re-dispatch the provider");
  assert.notEqual(repeat.runtimeDecision.kind, "call_provider");
});

test("local agent runtime health recomputes capabilities after config hot updates", async () => {
  const configState = createGatewayRuntimeConfigState({ env: {}, now: () => 7000 });
  const providerRuntime = createGatewayProviderRuntime({
    configState,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) })
  });
  const agentRuntime = createLocalAgentRuntime({
    store: createLocalMemoryStore({ now: () => 7000, autoProcessBacklog: false }),
    providerRuntime,
    runtimeConfigState: configState,
    now: () => 7000
  });

  const before = agentRuntime.getHealth();
  assert.equal(before.capabilities[AgentCapability.EXPLAIN], false);

  const update = agentRuntime.updateConfig({
    config: enabledExplainConfig()
  });
  assert.equal(update.status, AgentResultStatus.AVAILABLE);

  const after = agentRuntime.getHealth();
  assert.equal(after.capabilities[AgentCapability.EXPLAIN], true);
  assert.equal(after.capabilities[AgentCapability.STREAMING_EXPLANATION], true);
  assert.equal(after.providerRoles[ProviderRole.EXPLAIN].tokenPresent, true);
});
