import test from "node:test";
import assert from "node:assert/strict";
import {
  createAgentRequest,
  createBackgroundAgentClient,
  createBackgroundService,
  validateAgentExplanationResult
} from "../src/extension/agent-service.js";
import {
  AgentCapability,
  AgentResultStatus,
  BackgroundMessageType,
  FactSensitivity,
  ProviderKind,
  ProviderRole,
  StreamEventType,
  StreamLane
} from "../src/shared/contracts.js";
import { DEFAULT_CONFIG, mergeConfig } from "../src/shared/config.js";
import { createLocalGatewayHandler } from "../src/gateway/local-gateway.js";
import { createLocalGatewayClient } from "../src/extension/provider-registry.js";
import { createGatewayRuntimeConfigState } from "../src/gateway/runtime-config.js";

test("aborting a stream settles the client promise immediately (no SESSION_CANCELLED echo)", async () => {
  // Chrome does not fire onDisconnect for a self-initiated port.disconnect() and
  // the background sends no SESSION_CANCELLED back, so the abort handler must
  // settle the promise itself — otherwise the caller's evaluate() lock stays
  // held until the 30s idle watchdog. The fake port intentionally never echoes
  // any message, mirroring real Chrome behavior.
  const controller = new AbortController();
  const port = {
    postMessage() {},
    disconnect() {},
    onMessage: { addListener() {} },
    onDisconnect: { addListener() {} }
  };
  const runtime = { connect: () => port };
  const client = createBackgroundAgentClient(runtime, { streamIdleTimeoutMs: 60000 });
  const resultPromise = client.streamExplanation(
    { target: { canonicalName: "KL divergence", observedText: "KL divergence" } },
    { signal: controller.signal }
  );
  controller.abort();
  const result = await resultPromise; // would hang until the 60s watchdog without the fix
  assert.equal(result.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(result.reason, "runtime_stream_cancelled");
});

const input = {
  target: {
    canonicalName: "Lagrange point",
    observedText: "Lagrange point",
    knowledgeType: "astronomy",
    factSensitivity: FactSensitivity.STABLE
  },
  minimalContext: {
    fragmentId: "p1",
    fragmentType: "paragraph",
    text: `A telescope can sit near a Lagrange point. ${"private ".repeat(100)}`
  },
  memorySummary: {
    priorExplanationCount: 1,
    relatedObjects: [{ canonicalName: "orbit", evidenceEventIds: ["evt1"], uncertainty: "low" }],
    derivedSignals: { possibly_weak: true },
    uncertainty: { confidence: "low" }
  },
  profileHints: { preferredStyle: "concise" },
  requestedStyle: "concise",
  constraints: { maxChars: 80 }
};

function gatewayConfig(overrides = {}) {
  return mergeConfig(DEFAULT_CONFIG, {
    localGateway: {
      endpoint: "http://127.0.0.1:17321",
      pairingToken: "local-secret",
      timeoutMs: 50,
      ...overrides.localGateway
    },
    agent: {
      rateLimit: { maxRequests: 2, windowMs: 1000 },
      ...overrides.agent
    },
    ...overrides.config
  });
}

function createGatewayService({ handler, now = (() => {
  let current = 1000;
  return () => current++;
})(), requests = [], config = gatewayConfig() } = {}) {
  return createBackgroundService({
    config,
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      return handler({ url, method: options.method, headers: options.headers, body: options.body });
    },
    now
  });
}

function createNdjsonResponse(events = []) {
  const encoder = new TextEncoder();
  return {
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        for (const event of events) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        controller.close();
      }
    }),
    json: async () => ({})
  };
}

test("agent request is privacy trimmed and structured", () => {
  const request = createAgentRequest({
    input,
    selectedText: "Lagrange point",
    providerRole: ProviderRole.EXPLAIN,
    modelName: "explain-model",
    config: mergeConfig(DEFAULT_CONFIG, { privacy: { maxContextChars: 80 } }),
    timestamp: 1000
  });

  assert.equal(request.target.canonicalName, "Lagrange point");
  assert.equal(request.providerRole, ProviderRole.EXPLAIN);
  assert.equal(request.modelName, "explain-model");
  assert.ok(request.minimalContext.text.length <= 80);
  assert.equal(Object.hasOwn(request, "memoryPacket"), false);
  assert.equal(Object.hasOwn(request, "memorySummary"), false);
  assert.equal(Object.hasOwn(request, "profileHints"), false);
  assert.equal(request.constraints.memoryStatus, "runtime_owned");
});

test("structured Agent success validates into explanation version", () => {
  const result = validateAgentExplanationResult({
    status: AgentResultStatus.AVAILABLE,
    target: input.target,
    microExplanation: "A Lagrange point is a stable orbital place.",
    factSensitivity: { level: FactSensitivity.STABLE, requiresSource: false },
    versionMetadata: { id: "ver1", provider: "test", model: "unit" }
  }, { input, now: () => 1000 });

  assert.equal(result.status, AgentResultStatus.AVAILABLE);
  assert.equal(result.explanationVersion.id, "ver1");
  assert.equal(result.explanationVersion.source, "external_agent");
});

test("local gateway client reads streaming explanation events", async () => {
  const requests = [];
  const streamEvents = [
    { type: StreamEventType.SESSION_START, sessionId: "s1", sequence: 0 },
    { type: StreamEventType.LANE_DELTA, sessionId: "s1", sequence: 1, lane: StreamLane.DIRECT, text: "Direct" },
    { type: StreamEventType.SESSION_DONE, sessionId: "s1", sequence: 2 }
  ];
  const client = createLocalGatewayClient({
    endpoint: "http://127.0.0.1:17321",
    pairingToken: "local-secret",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return createNdjsonResponse(streamEvents);
    },
    timeoutMs: 50
  });
  const seen = [];

  const result = await client.streamExplanation({ target: input.target }, {
    onEvent: (event) => seen.push(event)
  });

  assert.equal(result.status, AgentResultStatus.AVAILABLE);
  assert.equal(requests[0].url, "http://127.0.0.1:17321/explain/stream-session");
  assert.equal(requests[0].options.headers["x-bco-pairing-token"], "local-secret");
  assert.deepEqual(seen.map((event) => event.type), [
    StreamEventType.SESSION_START,
    StreamEventType.LANE_DELTA,
    StreamEventType.SESSION_DONE
  ]);
});

test("invalid and unavailable Agent results do not become explanation text", () => {
  const invalid = validateAgentExplanationResult({ status: AgentResultStatus.AVAILABLE }, { input });
  const unavailable = validateAgentExplanationResult({ status: AgentResultStatus.UNAVAILABLE, reason: "off" }, { input });

  assert.equal(invalid.status, AgentResultStatus.INVALID);
  assert.equal(invalid.text, "");
  assert.equal(unavailable.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(unavailable.text, "");
});

test("background service mediates gateway success, rate limit, and embeddings", async () => {
  let calls = 0;
  const embeddingCalls = [];
  const requests = [];
  const handler = createLocalGatewayHandler({
    token: "local-secret",
    explainHandler: async (request) => {
      calls += 1;
      assert.equal(request.providerMode, ProviderKind.LOCAL);
      assert.equal(request.providerRole, ProviderRole.EXPLAIN);
      return {
        status: AgentResultStatus.AVAILABLE,
        target: request.target,
        microExplanation: "Gateway-owned explanation.",
        versionMetadata: { id: `ver${calls}`, model: request.modelName ?? null }
      };
    },
    embeddingHandler: async (payload) => {
      embeddingCalls.push(payload);
      return { status: AgentResultStatus.AVAILABLE, vector: [1, 0, 0], model: "gateway-embedding" };
    }
  });
  const service = createGatewayService({ handler, requests });

  const first = await service.handleMessage({
    type: BackgroundMessageType.EXPLAIN_KNOWLEDGE,
    payload: { input }
  });
  const second = await service.handleMessage({
    type: BackgroundMessageType.EXPLAIN_KNOWLEDGE,
    payload: { input: { ...input, requestedStyle: "simpler" } }
  });
  const limited = await service.handleMessage({
    type: BackgroundMessageType.EXPLAIN_KNOWLEDGE,
    payload: { input: { ...input, requestedStyle: "background" } }
  });
  const embedding = await service.handleMessage({
    type: BackgroundMessageType.CREATE_EMBEDDING,
    payload: { text: "summary", metadata: { canonicalName: "Lagrange point" } }
  });

  assert.equal(first.status, AgentResultStatus.AVAILABLE);
  assert.equal(first.runtimeDecision.kind, "call_provider");
  assert.equal(first.runtimeDecision.providerCallStatus, "succeeded");
  assert.equal(second.status, AgentResultStatus.AVAILABLE);
  assert.equal(limited.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(limited.reason, "agent_rate_limited");
  assert.equal(embedding.status, AgentResultStatus.AVAILABLE);
  assert.deepEqual(embedding.vector, [1, 0, 0]);
  assert.equal(embedding.model, "gateway-embedding");
  assert.equal(embeddingCalls[0].text, "summary");
  assert.equal(requests.every((request) => String(request.url).startsWith("http://127.0.0.1:17321/")), true);
  assert.equal(requests.some((request) => /agent\.example|embed\.example|api\.example/.test(request.url)), false);
});

test("background service forwards dual-lane stream events without browser-local memory", async () => {
  const requests = [];
  const handler = createLocalGatewayHandler({
    token: "local-secret",
    store: {
      queryMemory: () => ({
        status: AgentResultStatus.AVAILABLE,
        repositoryStatus: "local_gateway",
        memoryFreshness: { status: "fresh" },
        agentSummary: {},
        profileHints: {},
        memoryBridges: []
      }),
      writeEvent: () => null,
      getHealth: () => ({ mode: "local_gateway", status: "available", shared: true })
    },
    providerRuntime: {
      capabilities: {
        [AgentCapability.EXPLAIN]: true,
        [AgentCapability.STREAMING_EXPLANATION]: true
      },
      providerRoles: {},
      streamExplanation: async (request, { lane, onDelta }) => {
        onDelta({ text: lane === StreamLane.DIRECT ? "Direct stream." : "Association stream." });
        return {
          status: AgentResultStatus.AVAILABLE,
          capabilityKind: AgentCapability.EXPLAIN,
          target: request.target,
          text: lane === StreamLane.DIRECT ? "Direct stream." : "Association stream.",
          microExplanation: lane === StreamLane.DIRECT ? "Direct stream." : "Association stream.",
          versionMetadata: { id: `ver_${lane}` }
        };
      }
    },
    now: () => 6000
  });
  const service = createGatewayService({
    handler,
    requests,
    config: gatewayConfig({ agent: { rateLimit: { maxRequests: 20, windowMs: 1000 } } })
  });
  const events = [];

  const result = await service.explainKnowledgeStream({
    input: {
      ...input,
      memoryPacket: { forged: true },
      memoryBridges: [{ relatedConcept: "Browser Forged" }]
    },
    onEvent: (event) => events.push(event)
  });
  const streamRequest = JSON.parse(requests.find((entry) => entry.url.endsWith("/explain/stream-session")).options.body);

  assert.equal(result.status, AgentResultStatus.AVAILABLE);
  assert.equal(events.some((event) => event.type === StreamEventType.LANE_DELTA && event.lane === StreamLane.DIRECT), true);
  assert.equal(events.some((event) => event.type === StreamEventType.LANE_FINAL && event.lane === StreamLane.ASSOCIATION), true);
  assert.equal(streamRequest.memoryPacket, undefined);
  assert.equal(streamRequest.memoryBridges, undefined);
  assert.doesNotMatch(JSON.stringify(events), /local-secret|Browser Forged/);
});

test("background service falls back to non-stream explain when streaming capability is unavailable", async () => {
  const handler = createLocalGatewayHandler({
    token: "local-secret",
    explainHandler: async (request) => ({
      status: AgentResultStatus.AVAILABLE,
      capabilityKind: AgentCapability.EXPLAIN,
      target: request.target,
      microExplanation: "Fallback explanation.",
      text: "Fallback explanation.",
      versionMetadata: { id: "ver_fallback" }
    })
  });
  const service = createGatewayService({
    handler,
    config: gatewayConfig({ agent: { rateLimit: { maxRequests: 20, windowMs: 1000 } } })
  });
  const events = [];

  const result = await service.explainKnowledgeStream({
    input,
    onEvent: (event) => events.push(event)
  });

  assert.equal(result.status, AgentResultStatus.AVAILABLE);
  assert.equal(events.some((event) =>
    event.type === StreamEventType.LANE_FINAL &&
    event.lane === StreamLane.DIRECT &&
    event.result.text === "Fallback explanation."
  ), true);
  assert.equal(events.some((event) =>
    event.type === StreamEventType.LANE_FINAL &&
    event.lane === StreamLane.ASSOCIATION &&
    event.result.reason === "streaming_capability_unavailable"
  ), true);
});

test("background stream port forwards events and supports cancellation", async () => {
  let disconnectListener = null;
  let messageListener = null;
  let aborted = false;
  const posted = [];
  const service = createBackgroundService({
    config: gatewayConfig({ agent: { rateLimit: { maxRequests: 20, windowMs: 1000 } } }),
    providerRegistry: {
      mode: ProviderKind.LOCAL,
      usesLocalGateway: () => true,
      getMode: () => ProviderKind.LOCAL,
      getDiagnosticsState: () => ({}),
      resolveProvider: () => ({
        role: ProviderRole.EXPLAIN,
        mode: ProviderKind.LOCAL,
        capability: AgentCapability.EXPLAIN,
        endpoint: "http://127.0.0.1:17321",
        timeoutMs: 50,
        client: {}
      }),
      refreshHealth: async () => ({
        status: AgentResultStatus.AVAILABLE,
        capabilities: {
          [AgentCapability.EXPLAIN]: true,
          [AgentCapability.STREAMING_EXPLANATION]: true
        }
      }),
      invalidateHealthCache: () => {},
      getLocalGatewayClient: () => ({
        streamExplanation: async (request, { onEvent, signal }) => {
          onEvent({ type: StreamEventType.SESSION_START, sessionId: "port", sequence: 0 });
          await new Promise((resolve) => setTimeout(resolve, 0));
          aborted = Boolean(signal?.aborted);
          onEvent({ type: StreamEventType.SESSION_DONE, sessionId: "port", sequence: 1 });
          return { status: AgentResultStatus.AVAILABLE };
        },
        explain: async () => ({ status: AgentResultStatus.UNAVAILABLE, reason: "should_not_fallback" })
      })
    }
  });
  const port = {
    name: BackgroundMessageType.EXPLAIN_KNOWLEDGE_STREAM,
    postMessage: (event) => posted.push(event),
    onMessage: { addListener: (listener) => { messageListener = listener; } },
    onDisconnect: { addListener: (listener) => { disconnectListener = listener; } }
  };

  service.handleStreamPort(port);
  const done = messageListener({ input });
  disconnectListener();
  await done;

  assert.equal(posted.some((event) => event.type === StreamEventType.SESSION_START), true);
  assert.equal(aborted, true);
});

test("background service returns unavailable when local gateway pairing is not configured", async () => {
  const service = createBackgroundService({ config: mergeConfig(DEFAULT_CONFIG, { localGateway: { pairingToken: "" } }) });
  const explanation = await service.handleMessage({
    type: BackgroundMessageType.EXPLAIN_KNOWLEDGE,
    payload: { input }
  });
  const embedding = await service.handleMessage({
    type: BackgroundMessageType.CREATE_EMBEDDING,
    payload: { text: "summary" }
  });

  assert.equal(explanation.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(explanation.reason, "local_gateway_pairing_required");
  assert.equal(embedding.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(embedding.reason, "local_gateway_pairing_required");
});

test("background memory calls do not fall back to browser repository", async () => {
  const service = createBackgroundService({ config: mergeConfig(DEFAULT_CONFIG, { localGateway: { pairingToken: "" } }) });
  const write = await service.handleMessage({
    type: BackgroundMessageType.WRITE_MEMORY_EVENT,
    payload: { event: { type: "dismissed", canonicalName: "KL divergence" } }
  });
  const query = await service.handleMessage({
    type: BackgroundMessageType.QUERY_MEMORY,
    payload: { canonicalName: "KL divergence" }
  });
  const diagnostics = await service.handleMessage({
    type: BackgroundMessageType.GET_DIAGNOSTICS,
    payload: {}
  });

  assert.equal(write.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(write.reason, "local_gateway_pairing_required");
  assert.equal(query.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(query.reason, "local_gateway_pairing_required");
  assert.equal(diagnostics.memoryRepositoryStatus.mode, "local_gateway");
  assert.equal(diagnostics.memoryRepositoryStatus.shared, true);
  assert.doesNotMatch(JSON.stringify(diagnostics), /browser_fallback|browser_local_degraded/);
});

test("background batches burst memory event writes into one gateway request", async () => {
  const requests = [];
  const service = createBackgroundService({
    config: gatewayConfig(),
    memoryEventBatchDelayMs: 0,
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      const body = JSON.parse(options.body ?? "{}");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: AgentResultStatus.AVAILABLE,
          repositoryStatus: "local_gateway",
          memoryRepository: { persistent: true },
          eventCount: body.events?.length ?? 1,
          events: body.events ?? [body]
        })
      };
    }
  });

  const first = service.handleMessage({
    type: BackgroundMessageType.WRITE_MEMORY_EVENT,
    payload: { event: { type: "knowledge_encountered", canonicalName: "百色", timestamp: 1000 } }
  });
  const second = service.handleMessage({
    type: BackgroundMessageType.WRITE_MEMORY_EVENT,
    payload: { event: { type: "user_selected_term", canonicalName: "广西", timestamp: 1001 } }
  });

  const results = await Promise.all([first, second]);
  const memoryRequests = requests.filter((request) => String(request.url).endsWith("/memory/events"));
  const batchBody = JSON.parse(memoryRequests[0].options.body);

  assert.equal(memoryRequests.length, 1);
  assert.equal(batchBody.events.length, 2);
  assert.deepEqual(batchBody.events.map((entry) => entry.event.canonicalName), ["百色", "广西"]);
  assert.equal(results[0].status, AgentResultStatus.AVAILABLE);
  assert.equal(results[1].status, AgentResultStatus.AVAILABLE);
});

test("background service turns gateway timeout into structured unavailable result", async () => {
  const service = createBackgroundService({
    config: gatewayConfig({ localGateway: { timeoutMs: 1 } }),
    fetchImpl: async () => new Promise((resolve) => setTimeout(() => resolve({
      ok: true,
      status: 200,
      json: async () => ({ status: AgentResultStatus.AVAILABLE })
    }), 20))
  });

  const result = await service.handleMessage({
    type: BackgroundMessageType.EXPLAIN_KNOWLEDGE,
    payload: { input }
  });

  assert.equal(result.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(result.reason, "agent_timeout");
});

test("background uses only gateway pairing token and never provider credentials", async () => {
  const requests = [];
  const handler = createLocalGatewayHandler({
    token: "local-secret",
    explainHandler: async (request) => ({
      status: AgentResultStatus.UNAVAILABLE,
      reason: "provider_model_unsupported",
      capabilityKind: request.capabilityKind,
      providerRole: request.providerRole,
      providerMode: request.providerMode,
      target: request.target
    }),
    embeddingHandler: async () => ({
      status: AgentResultStatus.AVAILABLE,
      vector: [0.1, 0.2],
      model: "runtime-embedding"
    })
  });
  const service = createGatewayService({ handler, requests });

  const explanation = await service.handleMessage({
    type: BackgroundMessageType.EXPLAIN_KNOWLEDGE,
    payload: { input }
  });
  const embedding = await service.handleMessage({
    type: BackgroundMessageType.CREATE_EMBEDDING,
    payload: { text: "summary" }
  });

  assert.equal(explanation.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(explanation.reason, "provider_model_unsupported");
  assert.equal(embedding.status, AgentResultStatus.AVAILABLE);
  assert.deepEqual(embedding.vector, [0.1, 0.2]);
  assert.equal(requests.every((request) => request.options.headers["x-bco-pairing-token"] === "local-secret"), true);
  assert.equal(requests.some((request) => request.options.headers.authorization), false);
  assert.doesNotMatch(JSON.stringify(requests), /explain-token|embedding-token|agent\.example|embed\.example/);
});

test("content-side agent client uses runtime messaging only", async () => {
  const messages = [];
  const client = createBackgroundAgentClient({
    sendMessage: (message, callback) => {
      messages.push(message);
      callback({ status: AgentResultStatus.UNAVAILABLE, reason: "test" });
    }
  });

  const result = await client.composeShortExplanation(input);
  assert.equal(result.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(messages[0].type, BackgroundMessageType.EXPLAIN_KNOWLEDGE);
  assert.equal(messages[1], undefined);
});

test("content-side streaming client returns unavailable when runtime connect throws", async () => {
  const client = createBackgroundAgentClient({
    connect: () => {
      throw new Error("Extension context invalidated.");
    }
  });
  const events = [];

  const result = await client.streamExplanation(input, {
    onEvent: (event) => events.push(event)
  });

  assert.equal(result.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(result.reason, "runtime_stream_connect_failed");
  assert.match(result.details.message, /Extension context invalidated/);
  assert.deepEqual(events, []);
});

test("background config messages forward to paired local gateway", async () => {
  const configState = createGatewayRuntimeConfigState({
    now: () => 6000,
    providerConfig: {
      relationProposer: {
        enabled: false,
        reuseExplainProvider: true
      }
    }
  });
  const handler = createLocalGatewayHandler({
    token: "local-secret",
    runtimeConfigState: configState,
    now: () => 6000
  });
  const service = createGatewayService({ handler });

  const read = await service.handleMessage({
    type: BackgroundMessageType.GET_RUNTIME_CONFIG,
    payload: {}
  });
  const update = await service.handleMessage({
    type: BackgroundMessageType.UPDATE_RUNTIME_CONFIG,
    payload: {
      config: {
        relationProposer: {
          enabled: true,
          reuseExplainProvider: true
        }
      }
    }
  });
  const reread = await service.handleMessage({
    type: BackgroundMessageType.GET_RUNTIME_CONFIG,
    payload: {}
  });
  const diagnostics = await service.handleMessage({
    type: BackgroundMessageType.GET_DIAGNOSTICS,
    payload: {}
  });

  assert.equal(read.status, AgentResultStatus.AVAILABLE);
  assert.equal(read.config.relationProposer.enabled, false);
  assert.equal(update.status, AgentResultStatus.AVAILABLE);
  assert.deepEqual(update.appliedPaths, [
    "relationProposer.enabled",
    "relationProposer.reuseExplainProvider"
  ]);
  assert.equal(reread.config.relationProposer.enabled, true);
  assert.equal(diagnostics.runtimeConfig.version, 2);
  assert.equal(diagnostics.providerRoles.relationProposer.enabled, true);
});

test("background agent client exposes runtime config messages", async () => {
  const messages = [];
  const client = createBackgroundAgentClient({
    sendMessage: (message, callback) => {
      messages.push(message);
      callback({ status: AgentResultStatus.AVAILABLE });
    }
  });

  await client.getRuntimeConfig();
  await client.updateRuntimeConfig({ explain: { modelName: "next-model" } });

  assert.equal(messages[0].type, BackgroundMessageType.GET_RUNTIME_CONFIG);
  assert.equal(messages[1].type, BackgroundMessageType.UPDATE_RUNTIME_CONFIG);
  assert.equal(messages[1].payload.config.explain.modelName, "next-model");
});

test("background browser config update changes local gateway pairing without reload", async () => {
  const handler = createLocalGatewayHandler({
    token: "new-secret",
    explainHandler: async (request) => ({
      status: AgentResultStatus.AVAILABLE,
      target: request.target,
      microExplanation: "Updated pairing works.",
      versionMetadata: { id: "ver_browser_config" }
    })
  });
  const service = createGatewayService({
    handler,
    config: gatewayConfig({ localGateway: { pairingToken: "old-secret" } })
  });

  const before = await service.handleMessage({
    type: BackgroundMessageType.GET_PROVIDER_HEALTH,
    payload: { force: true }
  });
  const update = await service.handleMessage({
    type: BackgroundMessageType.UPDATE_BROWSER_CONFIG,
    payload: {
      config: {
        localGateway: { pairingToken: "new-secret" }
      }
    }
  });
  const after = await service.handleMessage({
    type: BackgroundMessageType.EXPLAIN_KNOWLEDGE,
    payload: { input: { ...input, requestedStyle: "after-browser-config-update" } }
  });

  assert.equal(before.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(before.reason, "local_gateway_pairing_rejected");
  assert.equal(update.status, AgentResultStatus.AVAILABLE);
  assert.equal(update.config.localGateway.pairingTokenPresent, true);
  assert.equal(after.status, AgentResultStatus.AVAILABLE);
  assert.equal(after.text, "Updated pairing works.");
});
