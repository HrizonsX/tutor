import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG, mergeConfig } from "../src/config.js";
import {
  AgentCapability,
  AgentProtocolVersion,
  AgentResultStatus,
  MemoryEventType,
  ProviderAdapter,
  ProviderKind,
  ProviderRole,
  StructuredOutputMode
} from "../src/contracts.js";
import {
  createLocalGatewayClient,
  createProviderRegistry,
  normalizeProviderMode,
  validateProviderRoleConfig
} from "../src/provider-registry.js";
import {
  createGatewayProviderRuntime,
  createGatewayRuntimeConfig,
  createLocalGatewayHandler,
  createLocalMemoryStore
} from "../src/local-gateway.js";
import { createGatewayRuntimeConfigState } from "../src/runtime-config.js";

test("provider registry normalizes runtime provider modes but browser resolves local gateway only", () => {
  assert.equal(normalizeProviderMode("none"), ProviderKind.OFF);
  assert.equal(normalizeProviderMode("custom_http"), ProviderKind.CUSTOM);
  assert.equal(normalizeProviderMode("test"), ProviderKind.CUSTOM);
  assert.equal(normalizeProviderMode("local"), ProviderKind.LOCAL);
  assert.equal(normalizeProviderMode("cloud"), ProviderKind.CLOUD);

  const registry = createProviderRegistry({
    config: mergeConfig(DEFAULT_CONFIG, {
      localGateway: {
        endpoint: "http://127.0.0.1:17321",
        pairingToken: "secret"
      }
    })
  });
  const explain = registry.resolveProvider(AgentCapability.EXPLAIN, { role: ProviderRole.EXPLAIN });
  const embedding = registry.resolveProvider(AgentCapability.EMBEDDING, { role: ProviderRole.EMBEDDING });

  assert.equal(explain.mode, ProviderKind.LOCAL);
  assert.equal(explain.adapter, ProviderAdapter.NONE);
  assert.equal(explain.endpoint, "http://127.0.0.1:17321");
  assert.equal(explain.token, "secret");
  assert.equal(embedding.mode, ProviderKind.LOCAL);
  assert.equal(embedding.endpoint, "http://127.0.0.1:17321");
});

test("provider registry reports local gateway health states", async () => {
  const handler = createLocalGatewayHandler({
    token: "secret",
    explainHandler: async (request) => ({
      status: AgentResultStatus.AVAILABLE,
      target: request.target,
      microExplanation: "Local gateway explanation.",
      versionMetadata: { id: "local_ver" }
    }),
    now: () => 2000
  });
  const registry = createProviderRegistry({
    config: mergeConfig(DEFAULT_CONFIG, {
      localGateway: {
        endpoint: "http://127.0.0.1:17321",
        pairingToken: "secret"
      }
    }),
    fetchImpl: (url, options) => handler({ url, method: options.method, headers: options.headers, body: options.body }),
    now: () => 2000
  });

  const health = await registry.refreshHealth({ force: true, role: ProviderRole.EXPLAIN });
  assert.equal(health.status, AgentResultStatus.AVAILABLE);
  assert.equal(health.mode, ProviderKind.LOCAL);
  assert.equal(health.role, ProviderRole.EXPLAIN);
  assert.equal(health.protocolVersion, AgentProtocolVersion);
  assert.equal(health.capabilities[AgentCapability.EXPLAIN], true);
  assert.equal(health.capabilities[AgentCapability.MEMORY_QUERY], true);
});

test("browser provider config validation only validates local gateway access", () => {
  const noPairingConfig = mergeConfig(DEFAULT_CONFIG, { localGateway: { pairingToken: "" } });
  const missingPairing = validateProviderRoleConfig(noPairingConfig, { role: ProviderRole.EXPLAIN, capability: AgentCapability.EXPLAIN });
  const healthWithoutPairing = validateProviderRoleConfig(noPairingConfig, { role: ProviderRole.EXPLAIN, capability: AgentCapability.HEALTH });
  const missingEndpoint = validateProviderRoleConfig(mergeConfig(DEFAULT_CONFIG, {
    localGateway: { endpoint: "", pairingToken: "secret" }
  }), { role: ProviderRole.EXPLAIN, capability: AgentCapability.EXPLAIN });
  const valid = validateProviderRoleConfig(mergeConfig(DEFAULT_CONFIG, {
    localGateway: { endpoint: "http://127.0.0.1:17321", pairingToken: "secret" }
  }), { role: ProviderRole.EMBEDDING, capability: AgentCapability.EMBEDDING });

  assert.equal(missingPairing.reason, "local_gateway_pairing_required");
  assert.equal(healthWithoutPairing.valid, true);
  assert.equal(missingEndpoint.reason, "local_gateway_endpoint_unconfigured");
  assert.equal(valid.valid, true);
  assert.equal(valid.mode, ProviderKind.LOCAL);
});

test("gateway runtime config loads provider roles from environment without source-default secrets", () => {
  const config = createGatewayRuntimeConfig({
    env: {
      BCO_GATEWAY_EXPLAIN_ENABLED: "true",
      BCO_GATEWAY_EXPLAIN_PROVIDER: "custom",
      BCO_GATEWAY_EXPLAIN_ADAPTER: "openai-compatible",
      BCO_GATEWAY_EXPLAIN_ENDPOINT: "https://api.example/v1",
      BCO_GATEWAY_EXPLAIN_TOKEN: "runtime-token",
      BCO_GATEWAY_EXPLAIN_MODEL: "runtime-model",
      BCO_GATEWAY_EXPLAIN_CHAT_PATH: "/chat/completions",
      BCO_GATEWAY_EXPLAIN_STRUCTURED_OUTPUT: "json_object",
      BCO_GATEWAY_EMBEDDING_ENABLED: "true",
      BCO_GATEWAY_EMBEDDING_PROVIDER: "cloud",
      BCO_GATEWAY_EMBEDDING_ADAPTER: "openai-compatible",
      BCO_GATEWAY_EMBEDDING_ENDPOINT: "https://embed.example/v1",
      BCO_GATEWAY_EMBEDDING_TOKEN: "embedding-token",
      BCO_GATEWAY_EMBEDDING_MODEL: "embedding-model",
      BCO_GATEWAY_EMBEDDING_PATH: "/embeddings"
    }
  });

  assert.equal(config.explain.enabled, true);
  assert.equal(config.explain.provider, ProviderKind.CUSTOM);
  assert.equal(config.explain.adapter, ProviderAdapter.OPENAI_COMPATIBLE);
  assert.equal(config.explain.endpoint, "https://api.example/v1");
  assert.equal(config.explain.token, "runtime-token");
  assert.equal(config.explain.modelName, "runtime-model");
  assert.equal(config.explain.structuredOutput.mode, StructuredOutputMode.JSON_OBJECT);
  assert.equal(config.embedding.provider, ProviderKind.CLOUD);
  assert.equal(config.embedding.token, "embedding-token");
  assert.equal(config.embedding.modelName, "embedding-model");

  const defaults = createGatewayRuntimeConfig({ env: {} });
  assert.equal(defaults.explain.token, "");
  assert.equal(defaults.embedding.token, "");
  assert.equal(defaults.explain.endpoint, "");
});

test("local gateway client enforces pairing and memory capabilities", async () => {
  const store = createLocalMemoryStore({ now: () => 1000 });
  const handler = createLocalGatewayHandler({ token: "secret", store, now: () => 1000 });
  const fetchImpl = (url, options) => handler({ url, method: options.method, headers: options.headers, body: options.body });

  const unpaired = createLocalGatewayClient({
    endpoint: "http://127.0.0.1:17321",
    fetchImpl
  });
  const missing = await unpaired.writeMemoryEvent({ event: { type: "dismissed", canonicalName: "KL divergence" } });
  assert.equal(missing.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(missing.reason, "local_gateway_pairing_required");

  const paired = createLocalGatewayClient({
    endpoint: "http://127.0.0.1:17321",
    pairingToken: "secret",
    fetchImpl
  });
  const write = await paired.writeMemoryEvent({
    event: { type: "knowledge_encountered", canonicalName: "KL divergence", timestamp: 1000 },
    repository: "learning"
  });
  const query = await paired.queryMemory({ canonicalName: "KL divergence", timestamp: 1000 });
  const unsupported = await paired.explain({ target: { canonicalName: "KL divergence" } });

  assert.equal(write.status, AgentResultStatus.AVAILABLE);
  assert.equal(query.status, AgentResultStatus.AVAILABLE);
  assert.equal(query.memoryPacket.target.canonicalName, "KL divergence");
  assert.equal(query.shared, true);
  assert.equal(unsupported.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(unsupported.reason, "provider_capability_unsupported");
});

test("local gateway injects summarized memory into explain and rewrite requests", async () => {
  const store = createLocalMemoryStore({ now: () => 2000, autoProcessBacklog: false });
  const seenRequests = [];
  const handler = createLocalGatewayHandler({
    token: "secret",
    store,
    explainHandler: async (request) => {
      seenRequests.push({ kind: "explain", request });
      return {
        status: AgentResultStatus.AVAILABLE,
        capabilityKind: request.capabilityKind,
        target: request.target,
        microExplanation: "Injected memory explanation.",
        versionMetadata: { id: "ver_explain" }
      };
    },
    rewriteHandler: async (request) => {
      seenRequests.push({ kind: "rewrite", request });
      return {
        status: AgentResultStatus.AVAILABLE,
        capabilityKind: request.capabilityKind,
        target: request.target,
        microExplanation: "Injected memory rewrite.",
        versionMetadata: { id: "ver_rewrite" }
      };
    }
  });
  const client = createLocalGatewayClient({
    endpoint: "http://127.0.0.1:17321",
    pairingToken: "secret",
    fetchImpl: (url, options) => handler({ url, method: options.method, headers: options.headers, body: options.body })
  });

  await client.writeMemoryEvent({
    event: { id: "evt_simple_1", type: MemoryEventType.REQUESTED_SIMPLER, canonicalName: "KL divergence", timestamp: 1000 },
    repository: "learning"
  });
  await client.writeMemoryEvent({
    event: { id: "evt_simple_2", type: MemoryEventType.REQUESTED_SIMPLER, canonicalName: "KL divergence", timestamp: 1100 },
    repository: "learning"
  });
  store.processBacklog();
  const explain = await client.explain({
    target: { canonicalName: "KL divergence", observedText: "KL divergence" },
    memoryPacket: { repositoryStatus: "stale_browser_packet" },
    memorySummary: { stale: true },
    profileHints: { preferredStyle: "stale_browser_style" },
    priorExplanations: [{ id: "stale_version" }],
    feedbackEvents: [{ id: "stale_feedback" }],
    conceptFamiliarity: "stale_familiarity"
  });
  const rewrite = await client.rewrite({
    target: { canonicalName: "KL divergence", observedText: "KL divergence" },
    previousVersion: { id: "ver_old", text: "Old explanation." },
    feedbackEvent: { id: "evt_feedback", type: MemoryEventType.REQUESTED_SIMPLER }
  });
  const explainRequest = seenRequests.find((entry) => entry.kind === "explain").request;
  const rewriteRequest = seenRequests.find((entry) => entry.kind === "rewrite").request;

  assert.equal(explain.status, AgentResultStatus.AVAILABLE);
  assert.equal(rewrite.status, AgentResultStatus.AVAILABLE);
  assert.equal(explain.runtimeDecision.kind, "call_provider");
  assert.equal(explain.runtimeDecision.providerCallStatus, "succeeded");
  assert.equal(explainRequest.memoryPacket.repositoryStatus, "local_gateway");
  assert.equal(explainRequest.memoryPacket.localMemoryRole, "learning_state");
  assert.ok(explainRequest.memoryPacket.summaryEvidenceEventIds.includes("evt_simple_1"));
  assert.equal(rewriteRequest.memoryPacket.explanationPreferences.preferredStyle, "simpler");
  assert.equal(rewriteRequest.profileHints.preferredStyle, "simpler");
  assert.doesNotMatch(JSON.stringify(explainRequest), /stale_browser_packet|stale_browser_style|stale_version|stale_feedback|stale_familiarity|fullText/);
});

test("local gateway config API reads redacted config and hot-updates provider runtime", async () => {
  const providerRequests = [];
  const configState = createGatewayRuntimeConfigState({
    now: () => 5000,
    providerConfig: {
      explain: {
        enabled: true,
        provider: ProviderKind.CUSTOM,
        adapter: ProviderAdapter.OPENAI_COMPATIBLE,
        endpoint: "https://first.example/v1?api_key=hidden",
        chatPath: "/chat/completions",
        token: "first-token",
        modelName: "first-model",
        structuredOutput: { mode: StructuredOutputMode.JSON_SCHEMA }
      }
    }
  });
  const providerRuntime = createGatewayProviderRuntime({
    configState,
    fetchImpl: async (url, options) => {
      providerRequests.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          model: JSON.parse(options.body).model,
          choices: [{
            message: {
              content: JSON.stringify({
                explanation: "Hot updated explanation.",
                versionMetadata: { id: "ver_hot_update" }
              })
            }
          }]
        })
      };
    },
    now: () => 5000
  });
  const handler = createLocalGatewayHandler({
    token: "secret",
    providerRuntime,
    runtimeConfigState: configState,
    now: () => 5000
  });

  const unauthorized = await handler({
    method: "GET",
    url: "http://127.0.0.1:17321/config",
    headers: {}
  }).then((response) => response.json());
  const read = await handler({
    method: "GET",
    url: "http://127.0.0.1:17321/config",
    headers: { "x-bco-pairing-token": "secret" }
  }).then((response) => response.json());
  const update = await handler({
    method: "POST",
    url: "http://127.0.0.1:17321/config",
    headers: { "content-type": "application/json", "x-bco-pairing-token": "secret" },
    body: JSON.stringify({
      config: {
        explain: {
          endpoint: "https://second.example/v2",
          token: "second-token",
          modelName: "second-model"
        },
        localGateway: { port: 18000 }
      }
    })
  }).then((response) => response.json());
  const explain = await handler({
    method: "POST",
    url: "http://127.0.0.1:17321/explain",
    headers: { "content-type": "application/json", "x-bco-pairing-token": "secret" },
    body: JSON.stringify({
      target: { canonicalName: "Hot update target", observedText: "Hot update target" },
      minimalContext: { text: "A target that forces a provider call." }
    })
  }).then((response) => response.json());
  const providerBody = JSON.parse(providerRequests[0].options.body);

  assert.equal(unauthorized.reason, "local_gateway_pairing_rejected");
  assert.equal(Object.hasOwn(unauthorized, "config"), false);
  assert.equal(read.status, AgentResultStatus.AVAILABLE);
  assert.equal(read.config.explain.token, "");
  assert.equal(read.config.explain.tokenPresent, true);
  assert.match(read.config.explain.endpoint, /api_key=<redacted>/);
  assert.equal(update.status, AgentResultStatus.AVAILABLE);
  assert.deepEqual(update.restartRequiredPaths, ["localGateway.port"]);
  assert.equal(explain.status, AgentResultStatus.AVAILABLE);
  assert.equal(providerRequests[0].url, "https://second.example/v2/chat/completions");
  assert.equal(providerRequests[0].options.headers.authorization, "Bearer second-token");
  assert.equal(providerBody.model, "second-model");
});

test("gateway explain schedules relation proposer and later explain receives memory bridges", async () => {
  const providerRequests = [];
  let current = Date.parse("2026-05-19T10:00:00.000Z");
  const store = createLocalMemoryStore({ now: () => current, autoProcessBacklog: false });
  store.writeDailySummary({
    date: "2026-05-18",
    summaryVersion: "daily-memory-summary.v1",
    summaryHash: "hash_minnan_fujian",
    topics: ["geography"],
    conceptRefs: [
      { canonicalName: "Minnan", aliases: [], eventCounts: { seen: 1 } },
      { canonicalName: "Fujian Province", aliases: [], eventCounts: { seen: 1 } }
    ],
    relationRefs: [],
    eventCount: 2,
    sourceEventIds: ["evt_minnan", "evt_fujian"],
    createdAt: current,
    timestamp: current
  });
  const configState = createGatewayRuntimeConfigState({
    providerConfig: {
      explain: {
        enabled: true,
        provider: ProviderKind.CUSTOM,
        adapter: ProviderAdapter.OPENAI_COMPATIBLE,
        endpoint: "https://api.example/v1",
        chatPath: "/chat/completions",
        token: "explain-token",
        modelName: "explain-model",
        structuredOutput: { mode: StructuredOutputMode.JSON_SCHEMA }
      },
      relationProposer: {
        enabled: true,
        reuseExplainProvider: true,
        structuredOutput: {
          mode: StructuredOutputMode.JSON_SCHEMA,
          schemaName: "bco_relation_proposal_result"
        }
      }
    }
  });
  const runtime = createGatewayProviderRuntime({
    configState,
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      providerRequests.push({ url, body });
      const schemaName = body.response_format?.json_schema?.name;
      if (schemaName === "bco_relation_proposal_result") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            model: "explain-model",
            choices: [{
              message: {
                content: JSON.stringify({
                  relationCandidates: [{
                    sourceCanonicalName: "Minnan",
                    relationType: "located_in",
                    targetCanonicalName: "Fujian Province",
                    sourceDate: "2026-05-18",
                    confidence: "high",
                    basis: "provider_structured_relation",
                    usableForOverlay: true,
                    sourceEventIds: ["evt_fujian"]
                  }],
                  rejectedCandidates: []
                })
              }
            }]
          })
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          model: "explain-model",
          choices: [{
            message: {
              content: JSON.stringify({
                explanation: "Minnan is a cultural region.",
                versionMetadata: { id: `ver_${providerRequests.length}` }
              })
            }
          }]
        })
      };
    },
    now: () => current
  });
  const handler = createLocalGatewayHandler({
    token: "secret",
    store,
    providerRuntime: runtime,
    runtimeConfigState: configState,
    now: () => current
  });
  const fetchGateway = (body) => handler({
    method: "POST",
    url: "http://127.0.0.1:17321/explain",
    headers: { "content-type": "application/json", "x-bco-pairing-token": "secret" },
    body: JSON.stringify(body)
  }).then((response) => response.json());

  const first = await fetchGateway({
    target: { canonicalName: "Minnan", observedText: "Minnan" },
    minimalContext: { fragmentId: "p1", text: "Minnan appears in an article." }
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  current += 31 * 1000;
  const second = await fetchGateway({
    target: { canonicalName: "Minnan", observedText: "Minnan" },
    minimalContext: { fragmentId: "p2", text: "Minnan appears again." },
    constraints: { forceRefresh: true }
  });
  const secondExplainBody = providerRequests
    .filter((entry) => entry.body.response_format?.json_schema?.name !== "bco_relation_proposal_result")
    .at(-1).body;
  const secondPrompt = JSON.parse(secondExplainBody.messages[1].content);

  assert.equal(first.status, AgentResultStatus.AVAILABLE);
  assert.equal(second.status, AgentResultStatus.AVAILABLE);
  assert.equal(providerRequests.some((entry) => entry.body.response_format?.json_schema?.name === "bco_relation_proposal_result"), true);
  assert.equal(store.queryMemory({ canonicalName: "Minnan", timestamp: current }).memoryBridges[0].relatedConcept, "Fujian Province");
  assert.equal(secondPrompt.memoryBridges[0].relatedConcept, "Fujian Province");
  assert.equal(secondPrompt.memoryBridges[0].sourceRole, "local_learning_context");
});

test("gateway config update applies memory recall policy to next memory query", async () => {
  const store = createLocalMemoryStore({ now: () => 7000, autoProcessBacklog: false });
  store.writeDailySummary({
    date: "2026-05-18",
    summaryVersion: "daily-memory-summary.v1",
    summaryHash: "hash_policy",
    topics: ["systems"],
    conceptRefs: [
      { canonicalName: "Attention", aliases: [], eventCounts: { seen: 1 } },
      { canonicalName: "Transformer", aliases: [], eventCounts: { seen: 1 } },
      { canonicalName: "KV cache", aliases: [], eventCounts: { seen: 1 } }
    ],
    relationRefs: [],
    eventCount: 3,
    sourceEventIds: [],
    createdAt: 7000,
    timestamp: 7000
  });
  const blocks = store.loadDayConceptBlocks({ dates: ["2026-05-18"] });
  store.gateRelationProposal({
    sourceCanonicalName: "Attention",
    relationType: "part_of",
    targetCanonicalName: "Transformer",
    sourceDate: "2026-05-18",
    confidence: "high",
    basis: "provider_structured_relation",
    usableForOverlay: true
  }, { dayBlocks: blocks });
  store.gateRelationProposal({
    sourceCanonicalName: "Attention",
    relationType: "used_for",
    targetCanonicalName: "KV cache",
    sourceDate: "2026-05-18",
    confidence: "high",
    basis: "provider_structured_relation",
    usableForOverlay: true
  }, { dayBlocks: blocks });
  const configState = createGatewayRuntimeConfigState();
  const handler = createLocalGatewayHandler({
    token: "secret",
    store,
    runtimeConfigState: configState,
    now: () => 7000
  });
  const query = () => handler({
    method: "POST",
    url: "http://127.0.0.1:17321/memory/query",
    headers: { "content-type": "application/json", "x-bco-pairing-token": "secret" },
    body: JSON.stringify({ canonicalName: "Attention", timestamp: 7000 })
  }).then((response) => response.json());

  const before = await query();
  await handler({
    method: "POST",
    url: "http://127.0.0.1:17321/config",
    headers: { "content-type": "application/json", "x-bco-pairing-token": "secret" },
    body: JSON.stringify({ config: { memory: { cognitive: { microBridgeLimit: 2 } } } })
  });
  const after = await query();

  assert.equal(before.memoryPacket.memoryBridges.length, 1);
  assert.equal(after.memoryPacket.memoryBridges.length, 2);
});

test("local gateway config API hot-updates embedding provider routing", async () => {
  const providerRequests = [];
  const configState = createGatewayRuntimeConfigState({
    providerConfig: {
      embedding: {
        enabled: true,
        provider: ProviderKind.CLOUD,
        adapter: ProviderAdapter.OPENAI_COMPATIBLE,
        endpoint: "https://embed-first.example/v1",
        embeddingPath: "/embeddings",
        token: "first-embedding-token",
        modelName: "first-embedding-model"
      }
    }
  });
  const runtime = createGatewayProviderRuntime({
    configState,
    fetchImpl: async (url, options) => {
      providerRequests.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => ({ model: JSON.parse(options.body).model, data: [{ embedding: [1, 0] }] })
      };
    }
  });
  const handler = createLocalGatewayHandler({
    token: "secret",
    providerRuntime: runtime,
    runtimeConfigState: configState
  });

  await handler({
    method: "POST",
    url: "http://127.0.0.1:17321/config",
    headers: { "content-type": "application/json", "x-bco-pairing-token": "secret" },
    body: JSON.stringify({
      config: {
        embedding: {
          endpoint: "https://embed-second.example/v2",
          token: "second-embedding-token",
          modelName: "second-embedding-model"
        }
      }
    })
  });
  const embedding = await handler({
    method: "POST",
    url: "http://127.0.0.1:17321/embedding",
    headers: { "content-type": "application/json", "x-bco-pairing-token": "secret" },
    body: JSON.stringify({ text: "summary" })
  }).then((response) => response.json());
  const body = JSON.parse(providerRequests[0].options.body);

  assert.equal(embedding.status, AgentResultStatus.AVAILABLE);
  assert.equal(providerRequests[0].url, "https://embed-second.example/v2/embeddings");
  assert.equal(providerRequests[0].options.headers.authorization, "Bearer second-embedding-token");
  assert.equal(body.model, "second-embedding-model");
});

test("health capabilities reflect /config hot updates without restart", async () => {
  const configState = createGatewayRuntimeConfigState({});
  const runtime = createGatewayProviderRuntime({
    configState,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) })
  });
  const handler = createLocalGatewayHandler({
    token: "secret",
    providerRuntime: runtime,
    runtimeConfigState: configState
  });
  const readHealth = () => handler({
    method: "GET",
    url: "http://127.0.0.1:17321/health",
    headers: { "x-bco-pairing-token": "secret" }
  }).then((response) => response.json());

  const before = await readHealth();
  await handler({
    method: "POST",
    url: "http://127.0.0.1:17321/config",
    headers: { "content-type": "application/json", "x-bco-pairing-token": "secret" },
    body: JSON.stringify({
      config: {
        explain: {
          enabled: true,
          provider: ProviderKind.CUSTOM,
          adapter: ProviderAdapter.OPENAI_COMPATIBLE,
          endpoint: "https://api.example/v1",
          token: "explain-token",
          modelName: "explain-model"
        }
      }
    })
  });
  const after = await readHealth();

  assert.equal(before.capabilities.explain, false);
  assert.equal(after.capabilities.explain, true);
});

test("local gateway config API audits provider route changes without leaking secrets", async () => {
  const auditEvents = [];
  const configState = createGatewayRuntimeConfigState({
    providerConfig: {
      explain: { endpoint: "https://first.example/v1", token: "first-token" }
    }
  });
  const handler = createLocalGatewayHandler({
    token: "secret",
    runtimeConfigState: configState,
    onProviderRouteChange: (change) => auditEvents.push(change),
    now: () => 9000
  });

  await handler({
    method: "POST",
    url: "http://127.0.0.1:17321/config",
    headers: { "content-type": "application/json", "x-bco-pairing-token": "secret" },
    body: JSON.stringify({
      config: { explain: { endpoint: "https://second.example/v2", token: "second-token" } }
    })
  });
  await handler({
    method: "POST",
    url: "http://127.0.0.1:17321/config",
    headers: { "content-type": "application/json", "x-bco-pairing-token": "secret" },
    body: JSON.stringify({
      config: { explain: { modelName: "renamed-model" } }
    })
  });
  await handler({
    method: "POST",
    url: "http://127.0.0.1:17321/config",
    headers: { "content-type": "application/json", "x-bco-pairing-token": "secret" },
    body: JSON.stringify({
      config: { explain: { endpoint: "ftp://attacker.example" } }
    })
  });

  // One audit event for the route change; none for the unrelated model rename
  // and none for the rejected endpoint.
  assert.equal(auditEvents.length, 1);
  assert.equal(auditEvents[0].role, "explain");
  assert.equal(auditEvents[0].endpointHost, "second.example");
  assert.equal(auditEvents[0].tokenPresent, true);
  assert.doesNotMatch(JSON.stringify(auditEvents), /second-token|\/v2/);
});
