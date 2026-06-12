import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  AgentCapability,
  AgentResultStatus,
  MemoryEventType,
  ProviderAdapter,
  ProviderKind,
  StreamEventType,
  StreamLane,
  StructuredOutputMode
} from "../src/contracts.js";
import {
  forgedMemoryStreamRequest,
  noBridgeMemoryPacket
} from "./fixtures/streaming-explanations.js";
import {
  createGatewayProviderRuntime,
  createGatewayRuntimeConfig,
  createLocalGatewayHandler,
  createLocalMemoryStore,
  createPersistentLocalMemoryStore,
  startLocalGatewayServer
} from "../src/local-gateway.js";
import {
  createDisabledVectorRecallAdapter,
  createInMemoryPostgresMemoryClient,
  createInMemorySessionView,
  createLayeredMemoryRepository
} from "../src/layered-memory-repository.js";

const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;

function stripAnsi(value) {
  return String(value).replace(ANSI_PATTERN, "");
}

function parseJsonLines(value = "") {
  return String(value)
    .trim()
    .split(/\n+/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test("local gateway server logs incoming HTTP requests to the provided logger", async () => {
  const entries = [];
  const logger = {
    info: (message, details) => entries.push({ level: "info", message, details }),
    warn: (message, details) => entries.push({ level: "warn", message, details })
  };
  const server = await startLocalGatewayServer({
    port: 0,
    handler: createLocalGatewayHandler({ allowUnauthenticated: true }),
    logger
  });
  const address = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/health?client_secret=hidden`);
    const body = await response.json();

    assert.equal(body.status, AgentResultStatus.AVAILABLE);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].message, "[BCO][local-gateway-server] request_finish");
    assert.equal(entries[0].details.method, "GET");
    assert.equal(entries[0].details.path, "/health?client_secret=<redacted>");
    assert.equal(entries[0].details.status, 200);
    assert.match(entries[0].details.startedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(entries[0].details.finishedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.doesNotMatch(JSON.stringify(entries), /hidden/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("local gateway server logs explain rewrite and memory query requests with redaction", async () => {
  const entries = [];
  const logger = {
    info: (message, details) => entries.push({ level: "info", message, details }),
    warn: (message, details) => entries.push({ level: "warn", message, details })
  };
  const handler = createLocalGatewayHandler({
    token: "pairing-secret",
    explainHandler: async (request) => ({
      status: AgentResultStatus.AVAILABLE,
      capabilityKind: request.capabilityKind ?? AgentCapability.EXPLAIN,
      target: request.target,
      microExplanation: "Stub explanation.",
      versionMetadata: { id: "stub_ver" }
    }),
    rewriteHandler: async (request) => ({
      status: AgentResultStatus.AVAILABLE,
      capabilityKind: request.capabilityKind ?? AgentCapability.REWRITE,
      target: request.target,
      microExplanation: "Stub rewrite.",
      versionMetadata: { id: "stub_rewrite" }
    })
  });
  const server = await startLocalGatewayServer({ port: 0, handler, logger });
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  const headers = {
    "content-type": "application/json",
    "x-bco-pairing-token": "pairing-secret"
  };

  try {
    await fetch(`${base}/explain?pairing_token=hidden`, {
      method: "POST",
      headers,
      body: JSON.stringify({ target: { canonicalName: "KL divergence" } })
    });
    await fetch(`${base}/rewrite?client_secret=hidden`, {
      method: "POST",
      headers,
      body: JSON.stringify({ target: { canonicalName: "KL divergence" } })
    });
    await fetch(`${base}/memory/query?api_key=hidden`, {
      method: "POST",
      headers,
      body: JSON.stringify({ canonicalName: "KL divergence" })
    });

    const paths = entries.map((entry) => entry.details?.path).filter(Boolean);
    assert.ok(paths.includes("/explain?pairing_token=<redacted>"));
    assert.ok(paths.includes("/rewrite?client_secret=<redacted>"));
    assert.ok(paths.includes("/memory/query?api_key=<redacted>"));
    assert.equal(entries.filter((entry) => entry.message === "[BCO][local-gateway-server] request_finish").length, 3);
    assert.equal(entries.some((entry) => entry.message === "[BCO][local-gateway-server] request_start"), false);
    assert.equal(
      entries.find((entry) => entry.message === "[BCO][local-gateway-server] explain_result").details.text,
      "Stub explanation."
    );
    assert.equal(
      entries.find((entry) => entry.message === "[BCO][local-gateway-server] rewrite_result").details.text,
      "Stub rewrite."
    );
    assert.doesNotMatch(JSON.stringify(entries), /pairing-secret|hidden/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("gateway provider runtime logs adapter calls without exposing provider secrets", async () => {
  const entries = [];
  const logger = {
    info: (message, details) => entries.push({ level: "info", message, details }),
    warn: (message, details) => entries.push({ level: "warn", message, details })
  };
  const providerRuntime = createGatewayProviderRuntime({
    providerConfig: createGatewayRuntimeConfig({
      providerConfig: {
        explain: {
          enabled: true,
          provider: ProviderKind.CUSTOM,
          adapter: ProviderAdapter.OPENAI_COMPATIBLE,
          endpoint: "https://api.example/v1?api_key=hidden",
          token: "provider-secret",
          modelName: "runtime-model",
          chatPath: "/chat/completions",
          structuredOutput: { mode: StructuredOutputMode.JSON_SCHEMA }
        }
      }
    }),
    logger,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        model: "runtime-model",
        choices: [{ message: { content: JSON.stringify({ explanation: "Gateway provider explanation." }) } }]
      })
    })
  });
  const handler = createLocalGatewayHandler({
    token: "pairing-secret",
    providerRuntime
  });
  const server = await startLocalGatewayServer({ port: 0, handler, logger });
  const address = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/explain`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bco-pairing-token": "pairing-secret"
      },
      body: JSON.stringify({ target: { canonicalName: "KL divergence" } })
    });
    const body = await response.json();

    assert.equal(body.status, AgentResultStatus.AVAILABLE);
    assert.equal(entries.some((entry) => entry.message === "[BCO][provider-adapter] request_start"), true);
    assert.equal(entries.some((entry) => entry.message === "[BCO][provider-adapter] request_success"), true);
    assert.match(entries.find((entry) => entry.message === "[BCO][provider-adapter] request_start").details.summary, /explain .*runtime-model.*started/);
    assert.match(entries.find((entry) => entry.message === "[BCO][provider-adapter] request_success").details.summary, /explain .*runtime-model.*succeeded/);
    assert.equal(entries.some((entry) =>
      entry.message === "[BCO][local-gateway-server] explain_result" &&
      entry.details.text === "Gateway provider explanation."
    ), true);
    assert.equal(entries.find((entry) => entry.message === "[BCO][provider-adapter] request_start").details.modelName, "runtime-model");
    assert.doesNotMatch(JSON.stringify(entries), /provider-secret|pairing-secret|hidden/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("local gateway server logs recall bridges used by explain requests", async () => {
  const entries = [];
  const logger = {
    info: (message, details) => entries.push({ level: "info", message, details }),
    warn: (message, details) => entries.push({ level: "warn", message, details })
  };
  const store = createLocalMemoryStore({ now: () => 7000, autoProcessBacklog: false });
  store.writeDailySummary({
    date: "2026-05-28",
    summaryVersion: "daily-memory-summary.v1",
    summaryHash: "hash_graphql_relay",
    topics: ["frontend"],
    conceptRefs: [
      { canonicalName: "GraphQL", aliases: [], eventCounts: { seen: 1 } },
      { canonicalName: "Relay", aliases: [], eventCounts: { seen: 1 } }
    ],
    relationRefs: [],
    eventCount: 2,
    sourceEventIds: ["evt_graphql", "evt_relay"],
    createdAt: 7000,
    timestamp: 7000
  });
  const blocks = store.loadDayConceptBlocks({ dates: ["2026-05-28"] });
  store.gateRelationProposal({
    sourceCanonicalName: "GraphQL",
    relationType: "related_to",
    targetCanonicalName: "Relay",
    sourceDate: "2026-05-28",
    confidence: "high",
    basis: "provider_structured_relation",
    usableForOverlay: true,
    sourceEventIds: ["evt_relay"]
  }, { dayBlocks: blocks, timestamp: 7000 });
  const handler = createLocalGatewayHandler({
    token: "pairing-secret",
    store,
    now: () => 7000,
    explainHandler: async (request) => ({
      status: AgentResultStatus.AVAILABLE,
      capabilityKind: request.capabilityKind ?? AgentCapability.EXPLAIN,
      target: request.target,
      microExplanation: `Explained with ${request.memoryBridges[0]?.relatedConcept}.`,
      versionMetadata: { id: "stub_recall_ver" }
    })
  });
  const server = await startLocalGatewayServer({ port: 0, handler, logger });
  const address = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/explain`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bco-pairing-token": "pairing-secret"
      },
      body: JSON.stringify({
        target: { canonicalName: "GraphQL", observedText: "GraphQL" },
        constraints: { forceRefresh: true }
      })
    });
    const body = await response.json();
    const logEntry = entries.find((entry) => entry.message === "[BCO][local-gateway-server] explain_result");

    assert.equal(body.runtimeDecision.memoryRecall.bridgeCount, 1);
    assert.match(logEntry.details.summary, /explain .*bridge_used.*Relay/);
    assert.deepEqual(logEntry.details.outcome, {
      kind: "explain",
      status: AgentResultStatus.AVAILABLE,
      target: "GraphQL",
      modelName: null,
      providerMode: null,
      memoryDecision: "bridge_used",
      bridgeCount: 1
    });
    assert.deepEqual(logEntry.details.memoryRecallSummary, {
      decision: "bridge_used",
      bridgeCount: 1,
      bridgeNames: ["Relay"],
      candidateBlockCount: 0,
      relationCandidateCount: 0,
      activeCandidateCount: 0,
      rejectedCandidateCount: 0,
      rejectReasons: [],
      rejectReasonText: ""
    });
    assert.equal(logEntry.details.memoryRecall.bridgeCount, 1);
    assert.deepEqual(logEntry.details.memoryRecall.bridges, [{
      relatedConcept: "Relay",
      relationType: "related_to",
      direction: "outgoing",
      confidence: "high",
      sourceRole: "local_learning_context",
      caution: "not_fact_source"
    }]);
    assert.doesNotMatch(JSON.stringify(entries), /pairing-secret|evt_relay|evt_graphql/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("local gateway server expands nested details when using console logger", async () => {
  const entries = [];
  const originalInfo = console.info;
  console.info = (message, details) => entries.push({ message, details });
  const body = {
    status: AgentResultStatus.AVAILABLE,
    target: { canonicalName: "百色" },
    modelName: "deepseek-v4-flash",
    providerMode: "custom",
    microExplanation: "百色是广西的地级市。",
    runtimeDecision: {
      memoryRecall: {
        status: "local_gateway",
        bridgeCount: 1,
        bridges: [{
          relatedConcept: "广西",
          relationType: "located_in",
          direction: "outgoing",
          confidence: "high",
          sourceRole: "local_learning_context",
          caution: "not_fact_source"
        }],
        preRecall: {
          status: "available",
          reason: null,
          candidateBlockCount: 2,
          relationCandidateCount: 8,
          activeCandidateCount: 6,
          overlayEligibleCandidateCount: 6,
          rejectedCandidateCount: 1,
          gateRejectReasons: ["target_absent_from_day_block", "candidate_needs_stronger_evidence"],
          gateRejectReasonText: "target_absent_from_day_block,candidate_needs_stronger_evidence",
          bridgeCount: 1
        },
        policy: {
          relationDepth: 1,
          maxBridgeCount: 1,
          memorySourceRole: "local_learning_context",
          caution: "not_fact_source"
        }
      }
    }
  };
  const handler = async () => ({
    status: 200,
    ok: true,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const server = await startLocalGatewayServer({ port: 0, handler, logger: console });
  const address = server.address();

  try {
    await fetch(`http://127.0.0.1:${address.port}/explain`, { method: "POST" });
    const logEntry = entries.find((entry) => entry.message === "[BCO][local-gateway-server] explain_result");

    assert.equal(typeof logEntry.details, "string");
    assert.match(logEntry.details, ANSI_PATTERN);
    const plainDetails = stripAnsi(logEntry.details);
    assert.match(plainDetails, /summary:/);
    assert.match(plainDetails, /memoryRecallSummary:/);
    assert.match(plainDetails, /bridges: \[/);
    assert.match(plainDetails, /relatedConcept: '广西'/);
    assert.match(plainDetails, /gateRejectReasons: \[/);
    assert.doesNotMatch(plainDetails, /\[Object\]|\[Array\]/);
  } finally {
    console.info = originalInfo;
    await new Promise((resolve) => server.close(resolve));
  }
});

test("local gateway console logger keeps utility endpoints to one-line summaries", async () => {
  const entries = [];
  const originalInfo = console.info;
  const originalWarn = console.warn;
  console.info = (message, details) => entries.push({ message, details });
  console.warn = (message, details) => entries.push({ message, details });
  const store = createLocalMemoryStore({ now: () => 9100, autoProcessBacklog: false });
  const handler = createLocalGatewayHandler({ store, now: () => 9100, allowUnauthenticated: true });
  const server = await startLocalGatewayServer({ port: 0, handler, logger: console });
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;

  try {
    await fetch(`${base}/health`);
    await fetch(`${base}/memory/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        event: { id: "evt_health_console", type: MemoryEventType.KNOWLEDGE_ENCOUNTERED, canonicalName: "百色", timestamp: 9100 }
      })
    });
    const utilityLogs = entries.filter((entry) =>
      entry.message === "[BCO][local-gateway-server] request_finish"
    );

    assert.equal(utilityLogs.length, 2);
    assert.equal(utilityLogs.every((entry) => typeof entry.details === "string"), true);
    assert.equal(utilityLogs.every((entry) => !entry.details.includes("\n")), true);
    assert.equal(utilityLogs.some((entry) => /^\d{4}-\d{2}-\d{2}T.* GET \/health -> 200 in \d+ms$/.test(entry.details)), true);
    assert.equal(utilityLogs.some((entry) => /^\d{4}-\d{2}-\d{2}T.* POST \/memory\/events -> 200 in \d+ms$/.test(entry.details)), true);
    assert.equal(entries.some((entry) => entry.message === "[BCO][local-gateway-server] request_start"), false);
  } finally {
    console.info = originalInfo;
    console.warn = originalWarn;
    await new Promise((resolve) => server.close(resolve));
  }
});

test("local gateway memory events endpoint accepts batched event writes", async () => {
  const store = createLocalMemoryStore({ now: () => 9000, autoProcessBacklog: false });
  const handler = createLocalGatewayHandler({ token: "pairing-secret", store, now: () => 9000 });
  const server = await startLocalGatewayServer({ port: 0, handler });
  const address = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/memory/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bco-pairing-token": "pairing-secret"
      },
      body: JSON.stringify({
        events: [{
          repository: "learning",
          event: { id: "evt_baise", type: MemoryEventType.KNOWLEDGE_ENCOUNTERED, canonicalName: "百色", timestamp: 9000 }
        }, {
          repository: "learning",
          event: { id: "evt_guangxi", type: MemoryEventType.USER_SELECTED_TERM, canonicalName: "广西", timestamp: 9001 }
        }]
      })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, AgentResultStatus.AVAILABLE);
    assert.equal(body.eventCount, 2);
    assert.deepEqual(body.events.map((event) => event.canonicalName), ["百色", "广西"]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("local gateway health advertises streaming explanation capability", async () => {
  const handler = createLocalGatewayHandler({
    allowUnauthenticated: true,
    providerRuntime: {
      capabilities: {
        [AgentCapability.EXPLAIN]: true,
        [AgentCapability.STREAMING_EXPLANATION]: true
      },
      providerRoles: {},
      streamExplanation: async () => ({ status: AgentResultStatus.AVAILABLE })
    }
  });

  const response = await handler({ method: "GET", url: "http://127.0.0.1/health" });
  const body = await response.json();

  assert.equal(body.status, AgentResultStatus.AVAILABLE);
  assert.equal(body.capabilities[AgentCapability.STREAMING_EXPLANATION], true);
});

test("local gateway stream endpoint emits NDJSON events and ignores browser memory fields", async () => {
  const providerRequests = [];
  const handler = createLocalGatewayHandler({
    token: "pairing-secret",
    store: {
      queryMemory: () => noBridgeMemoryPacket,
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
        providerRequests.push({ request, lane });
        onDelta({ text: "Direct stream." });
        return {
          status: AgentResultStatus.AVAILABLE,
          capabilityKind: AgentCapability.EXPLAIN,
          target: request.target,
          text: "Direct stream.",
          microExplanation: "Direct stream.",
          versionMetadata: { id: "ver_gateway_stream" }
        };
      }
    },
    now: () => 9200
  });
  const server = await startLocalGatewayServer({ port: 0, handler });
  const address = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/explain/stream-session`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bco-pairing-token": "pairing-secret"
      },
      body: JSON.stringify(forgedMemoryStreamRequest)
    });
    const events = parseJsonLines(await response.text());
    const associationFinal = events.find((event) =>
      event.type === StreamEventType.LANE_FINAL && event.lane === StreamLane.ASSOCIATION
    );

    assert.equal(response.status, 200);
    assert.equal(events[0].type, StreamEventType.SESSION_START);
    assert.equal(events.some((event) => event.type === StreamEventType.LANE_DELTA && event.lane === StreamLane.DIRECT), true);
    assert.equal(events.at(-1).type, StreamEventType.SESSION_DONE);
    assert.equal(providerRequests.length, 1);
    assert.equal(providerRequests[0].request.memoryPacket, undefined);
    assert.equal(providerRequests[0].request.memoryBridges, undefined);
    assert.equal(associationFinal.result.reason, "no_memory_bridge");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("local gateway server logs product streaming milestones without raw text or memory", async () => {
  const entries = [];
  const logger = {
    info: (message, details) => entries.push({ level: "info", message, details }),
    warn: (message, details) => entries.push({ level: "warn", message, details })
  };
  const handler = createLocalGatewayHandler({
    token: "pairing-secret",
    store: {
      queryMemory: () => noBridgeMemoryPacket,
      writeEvent: () => null,
      getHealth: () => ({ mode: "local_gateway", status: "available", shared: true })
    },
    providerRuntime: {
      capabilities: {
        [AgentCapability.EXPLAIN]: true,
        [AgentCapability.STREAMING_EXPLANATION]: true
      },
      providerRoles: {},
      streamExplanation: async (request, { onDelta }) => {
        onDelta({ text: "Raw streamed provider text should not be logged." });
        return {
          status: AgentResultStatus.AVAILABLE,
          capabilityKind: AgentCapability.EXPLAIN,
          target: request.target,
          text: "Raw streamed provider text should not be logged.",
          microExplanation: "Raw streamed provider text should not be logged.",
          versionMetadata: { id: "ver_stream_log" }
        };
      }
    },
    now: () => 9300
  });
  const server = await startLocalGatewayServer({ port: 0, handler, logger });
  const address = server.address();

  try {
    await fetch(`http://127.0.0.1:${address.port}/explain/stream-session`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bco-pairing-token": "pairing-secret"
      },
      body: JSON.stringify({
        target: { canonicalName: "Loquat" }
      })
    }).then((response) => response.text());

    assert.equal(entries.some((entry) => entry.message === "[BCO][local-gateway-server] stream_session_start"), true);
    assert.equal(entries.some((entry) =>
      entry.message === "[BCO][local-gateway-server] stream_lane_final" &&
      entry.details.lane === StreamLane.DIRECT &&
      entry.details.status === AgentResultStatus.AVAILABLE
    ), true);
    assert.equal(entries.some((entry) =>
      entry.message === "[BCO][local-gateway-server] stream_lane_final" &&
      entry.details.lane === StreamLane.ASSOCIATION &&
      entry.details.reason === "no_memory_bridge"
    ), true);
    assert.doesNotMatch(JSON.stringify(entries), /pairing-secret|Raw streamed provider text|evt_/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("local gateway health reports persistent memory and summarizer state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bco-gateway-memory-"));
  const store = createPersistentLocalMemoryStore({ directory, now: () => 5000, autoProcessBacklog: false });
  const handler = createLocalGatewayHandler({ token: "pairing-secret", store, now: () => 5000 });
  const server = await startLocalGatewayServer({ port: 0, handler });
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;

  try {
    await fetch(`${base}/memory/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bco-pairing-token": "pairing-secret"
      },
      body: JSON.stringify({
        event: { id: "evt_health", type: MemoryEventType.KNOWLEDGE_ENCOUNTERED, canonicalName: "Lagrange point", timestamp: 4000 }
      })
    });
    const response = await fetch(`${base}/health`, {
      headers: { "x-bco-pairing-token": "pairing-secret" }
    });
    const body = await response.json();

    assert.equal(body.status, AgentResultStatus.AVAILABLE);
    assert.equal(body.memoryRepository.persistent, true);
    assert.equal(body.memoryRepository.pathConfigured, true);
    assert.equal(body.memoryRepository.storeMode, "sqlite");
    assert.equal(body.memoryRepository.sqlite.available, true);
    assert.equal(body.memoryRepository.sqlite.databasePathConfigured, true);
    assert.equal(body.memoryRepository.summarizer.backlogSize, 1);
    assert.equal(body.memoryRepository.summarizer.version, "local-memory-summarizer.v1");
    assert.doesNotMatch(JSON.stringify(body), /evt_health|Lagrange point|pairing-secret/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("local gateway health reports layered memory components", async () => {
  const store = createLayeredMemoryRepository({
    postgres: createInMemoryPostgresMemoryClient(),
    sessionView: createInMemorySessionView({ now: () => 6000 }),
    vectorRecall: createDisabledVectorRecallAdapter(),
    now: () => 6000
  });
  const handler = createLocalGatewayHandler({ token: "pairing-secret", store, now: () => 6000 });
  const server = await startLocalGatewayServer({ port: 0, handler });
  const address = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/health`, {
      headers: { "x-bco-pairing-token": "pairing-secret" }
    });
    const body = await response.json();

    assert.equal(body.status, AgentResultStatus.AVAILABLE);
    assert.equal(body.memoryRepository.storeMode, "layered");
    assert.equal(body.memoryRepository.layered.postgres.status, AgentResultStatus.AVAILABLE);
    assert.equal(body.memoryRepository.layered.redis.status, AgentResultStatus.AVAILABLE);
    assert.equal(body.memoryRepository.layered.vectorRecall.mode, "disabled");
    assert.doesNotMatch(JSON.stringify(body), /pairing-secret|postgres:\/\/|redis:\/\//);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
  }
});

test("local gateway injects runtime-owned layered memory and ignores browser memory fields", async () => {
  const store = createLayeredMemoryRepository({
    postgres: createInMemoryPostgresMemoryClient(),
    sessionView: createInMemorySessionView({ now: () => 7000 }),
    vectorRecall: createDisabledVectorRecallAdapter(),
    now: () => 7000
  });
  const providerRequests = [];
  const handler = createLocalGatewayHandler({
    token: "pairing-secret",
    store,
    explainHandler: async (request) => {
      providerRequests.push(request);
      return {
        status: AgentResultStatus.AVAILABLE,
        capabilityKind: AgentCapability.EXPLAIN,
        target: request.target,
        microExplanation: "Layered runtime explanation.",
        versionMetadata: { id: "layered_ver" }
      };
    },
    now: () => 7000
  });
  const server = await startLocalGatewayServer({ port: 0, handler });
  const address = server.address();

  try {
    await fetch(`http://127.0.0.1:${address.port}/explain`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bco-pairing-token": "pairing-secret"
      },
      body: JSON.stringify({
        target: { canonicalName: "Layered Memory" },
        memoryPacket: { forged: true },
        memoryBridges: [{ relatedConcept: "Forged Browser Memory" }],
        relationCandidates: [{ forged: true }]
      })
    });

    assert.equal(providerRequests.length, 1);
    assert.equal(providerRequests[0].memoryPacket.forged, undefined);
    assert.deepEqual(providerRequests[0].memoryBridges, []);
    assert.equal(providerRequests[0].constraints.memoryStatus, "layered_memory");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
  }
});

test("local gateway rejects wrong pairing tokens with 401 on config and memory query", async () => {
  const store = createLocalMemoryStore({ now: () => 12000, autoProcessBacklog: false });
  const handler = createLocalGatewayHandler({ token: "pairing-secret", store, now: () => 12000 });

  const configResponse = await handler({
    method: "GET",
    url: "http://127.0.0.1:17321/config",
    headers: { "x-bco-pairing-token": "wrong-secret" }
  });
  const queryResponse = await handler({
    method: "POST",
    url: "http://127.0.0.1:17321/memory/query",
    headers: { "content-type": "application/json", authorization: "Bearer wrong-secret" },
    body: JSON.stringify({ canonicalName: "KL divergence", timestamp: 12000 })
  });
  const configBody = await configResponse.json();
  const queryBody = await queryResponse.json();

  assert.equal(configResponse.status, 401);
  assert.equal(configBody.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(configBody.reason, "local_gateway_pairing_rejected");
  assert.equal(queryResponse.status, 401);
  assert.equal(queryBody.reason, "local_gateway_pairing_rejected");
});

test("local gateway without a pairing token denies requests unless explicitly unauthenticated", async () => {
  const store = createLocalMemoryStore({ now: () => 12100, autoProcessBacklog: false });
  const denyingHandler = createLocalGatewayHandler({ store, now: () => 12100 });
  const optInHandler = createLocalGatewayHandler({ store, now: () => 12100, allowUnauthenticated: true });

  const denied = await denyingHandler({ method: "GET", url: "http://127.0.0.1:17321/health", headers: {} });
  const allowed = await optInHandler({ method: "GET", url: "http://127.0.0.1:17321/health", headers: {} });
  const deniedBody = await denied.json();
  const allowedBody = await allowed.json();

  assert.equal(denied.status, 401);
  assert.equal(deniedBody.reason, "local_gateway_pairing_rejected");
  assert.equal(allowed.status, 200);
  assert.equal(allowedBody.status, AgentResultStatus.AVAILABLE);
});

test("local gateway rejects cross-site origins for config reads and writes", async () => {
  const handler = createLocalGatewayHandler({ token: "pairing-secret", now: () => 12200 });

  const update = await handler({
    method: "POST",
    url: "http://127.0.0.1:17321/config",
    headers: {
      "content-type": "application/json",
      "x-bco-pairing-token": "pairing-secret",
      origin: "https://evil.example"
    },
    body: JSON.stringify({ config: { explain: { endpoint: "https://attacker.example" } } })
  });
  const read = await handler({
    method: "GET",
    url: "http://127.0.0.1:17321/config",
    headers: {
      "x-bco-pairing-token": "pairing-secret",
      origin: "https://evil.example"
    }
  });
  const updateBody = await update.json();
  const readBody = await read.json();

  assert.equal(update.status, 403);
  assert.equal(updateBody.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(updateBody.reason, "forbidden_origin");
  assert.equal(read.status, 403);
  assert.equal(readBody.reason, "forbidden_origin");
});

test("local gateway accepts extension origins for memory writes", async () => {
  const store = createLocalMemoryStore({ now: () => 12300, autoProcessBacklog: false });
  const handler = createLocalGatewayHandler({ token: "pairing-secret", store, now: () => 12300 });

  const response = await handler({
    method: "POST",
    url: "http://127.0.0.1:17321/memory/events",
    headers: {
      "content-type": "application/json",
      "x-bco-pairing-token": "pairing-secret",
      origin: "chrome-extension://abcdefghijklmnop"
    },
    body: JSON.stringify({
      event: { id: "evt_origin_ok", type: MemoryEventType.KNOWLEDGE_ENCOUNTERED, canonicalName: "KL divergence", timestamp: 12300 }
    })
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, AgentResultStatus.AVAILABLE);
});

test("local gateway rejects non-JSON POST bodies with 415", async () => {
  const store = createLocalMemoryStore({ now: () => 12400, autoProcessBacklog: false });
  const handler = createLocalGatewayHandler({ token: "pairing-secret", store, now: () => 12400 });

  const response = await handler({
    method: "POST",
    url: "http://127.0.0.1:17321/memory/events",
    headers: {
      "content-type": "text/plain",
      "x-bco-pairing-token": "pairing-secret"
    },
    body: JSON.stringify({
      event: { id: "evt_text_plain", type: MemoryEventType.KNOWLEDGE_ENCOUNTERED, canonicalName: "KL divergence", timestamp: 12400 }
    })
  });
  const body = await response.json();

  assert.equal(response.status, 415);
  assert.equal(body.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(body.reason, "unsupported_content_type");
});

test("local gateway handler rejects oversized request bodies with 413", async () => {
  const handler = createLocalGatewayHandler({
    token: "pairing-secret",
    maxBodyBytes: 1024,
    now: () => 12500
  });

  const response = await handler({
    method: "POST",
    url: "http://127.0.0.1:17321/memory/events",
    headers: {
      "content-type": "application/json",
      "x-bco-pairing-token": "pairing-secret"
    },
    body: JSON.stringify({ event: { id: "evt_huge", payload: "x".repeat(4096) } })
  });
  const body = await response.json();

  assert.equal(response.status, 413);
  assert.equal(body.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(body.reason, "request_body_too_large");
});

test("local gateway server stops reading oversized uploads and answers 413", async () => {
  const store = createLocalMemoryStore({ now: () => 12600, autoProcessBacklog: false });
  const handler = createLocalGatewayHandler({ token: "pairing-secret", store, now: () => 12600 });
  const server = await startLocalGatewayServer({ port: 0, handler, maxBodyBytes: 1024 });
  const address = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/memory/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bco-pairing-token": "pairing-secret"
      },
      body: JSON.stringify({ event: { id: "evt_server_huge", payload: "x".repeat(8192) } })
    });
    const body = await response.json();

    assert.equal(response.status, 413);
    assert.equal(body.status, AgentResultStatus.UNAVAILABLE);
    assert.equal(body.reason, "request_body_too_large");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
