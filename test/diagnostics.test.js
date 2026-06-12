import test from "node:test";
import assert from "node:assert/strict";
import { createBackgroundService } from "../src/extension/agent-service.js";
import { DEFAULT_CONFIG, mergeConfig } from "../src/shared/config.js";
import { createDiagnosticsState } from "../src/extension/diagnostics.js";
import { createLocalGatewayHandler } from "../src/gateway/local-gateway.js";
import {
  AgentCapability,
  AgentResultStatus,
  BackgroundMessageType,
  ProviderAdapter,
  ProviderKind,
  ProviderRole,
  StreamEventType,
  StreamLane
} from "../src/shared/contracts.js";

test("diagnostics snapshot redacts secrets and records latest state", () => {
  const diagnostics = createDiagnosticsState({ now: () => 1000 });
  diagnostics.setProviderConfigState({
    providerRoles: {
      explain: {
        role: ProviderRole.EXPLAIN,
        enabled: true,
        mode: ProviderKind.LOCAL,
        adapter: ProviderAdapter.OPENAI_COMPATIBLE,
        endpoint: "http://127.0.0.1:17321?access_token=secret",
        chatPath: "/chat/completions?client_secret=secret",
        modelName: "explain-model",
        tokenPresent: true
      },
      embedding: {
        role: ProviderRole.EMBEDDING,
        enabled: true,
        mode: ProviderKind.CUSTOM,
        adapter: ProviderAdapter.OPENAI_COMPATIBLE,
        endpoint: "https://embed.example/vector?api_key=secret",
        embeddingPath: "/embeddings?token=secret",
        modelName: "embedding-model",
        tokenPresent: true
      }
    },
    localGateway: {
      endpoint: "http://127.0.0.1:17321?pairing_token=secret",
      pairingTokenPresent: true,
      timeoutMs: 8000
    }
  });
  diagnostics.setProviderHealth({
    status: AgentResultStatus.UNAVAILABLE,
    reason: "local_gateway_unreachable",
    role: ProviderRole.EXPLAIN,
    mode: ProviderKind.LOCAL,
    endpoint: "http://127.0.0.1:17321?token=secret",
    modelName: "explain-model",
    capabilities: { [AgentCapability.EXPLAIN]: false }
  });
  diagnostics.setPairingStatus({ required: true, configured: true });
  diagnostics.recordDecision({
    shouldShow: false,
    candidate: { canonicalName: "KL divergence" },
    suppressions: ["recently_explained"]
  });
  diagnostics.recordAgentResult({
    status: AgentResultStatus.UNAVAILABLE,
    reason: "provider_capability_unsupported",
    capabilityKind: AgentCapability.REWRITE,
    providerRole: ProviderRole.EXPLAIN,
    providerMode: ProviderKind.LOCAL,
    adapter: ProviderAdapter.OPENAI_COMPATIBLE,
    modelName: "explain-model",
    target: "KL divergence",
    runtimeDecision: {
      kind: "return_degraded",
      reason: "provider_capability_unsupported",
      providerCallStatus: "skipped",
      persistenceStatus: "not_persisted",
      memoryFreshness: { status: "raw_fallback" },
      timestamp: 1000
    }
  });

  const snapshot = diagnostics.snapshot();
  assert.equal(snapshot.providerMode, ProviderKind.LOCAL);
  assert.equal(snapshot.providerHealth.endpoint, "http://127.0.0.1:17321?token=<redacted>");
  assert.equal(snapshot.providerHealth.modelName, "explain-model");
  assert.equal(snapshot.providerRoles.explain.modelName, "explain-model");
  assert.equal(snapshot.providerRoles.explain.adapter, ProviderAdapter.OPENAI_COMPATIBLE);
  assert.equal(snapshot.providerRoles.explain.tokenPresent, true);
  assert.equal(snapshot.providerRoles.explain.endpoint, "http://127.0.0.1:17321?access_token=<redacted>");
  assert.equal(snapshot.providerRoles.explain.chatPath, "/chat/completions?client_secret=<redacted>");
  assert.equal(snapshot.providerRoles.embedding.modelName, "embedding-model");
  assert.equal(snapshot.providerRoles.embedding.endpoint, "https://embed.example/vector?api_key=<redacted>");
  assert.equal(snapshot.providerRoles.embedding.embeddingPath, "/embeddings?token=<redacted>");
  assert.equal(snapshot.localGateway.endpoint, "http://127.0.0.1:17321?pairing_token=<redacted>");
  assert.equal(snapshot.localGateway.pairingTokenPresent, true);
  assert.equal(snapshot.pairingStatus.configured, true);
  assert.deepEqual(snapshot.lastDecision.suppressionReasons, ["recently_explained"]);
  assert.equal(snapshot.lastAgentResult.capabilityKind, AgentCapability.REWRITE);
  assert.equal(snapshot.lastAgentResult.providerRole, ProviderRole.EXPLAIN);
  assert.equal(snapshot.lastRuntimeDecision.kind, "return_degraded");
  assert.equal(snapshot.lastRuntimeDecision.providerCallStatus, "skipped");
  assert.equal(snapshot.lastRuntimeDecision.memoryFreshness.status, "raw_fallback");
  assert.equal(snapshot.latestProviderError.reason, "provider_capability_unsupported");
  assert.equal(snapshot.latestProviderError.adapter, ProviderAdapter.OPENAI_COMPATIBLE);
  assert.equal(snapshot.latestProviderError.model, "explain-model");
});

test("diagnostics snapshot preserves layered memory status without secrets", () => {
  const diagnostics = createDiagnosticsState({ now: () => 1500 });

  diagnostics.setMemoryRepositoryStatus({
    mode: "local_gateway",
    status: AgentResultStatus.AVAILABLE,
    shared: true,
    memoryRepository: {
      mode: "local_gateway",
      status: AgentResultStatus.AVAILABLE,
      shared: true,
      persistent: true,
      storeMode: "layered",
      schemaVersion: 1,
      layered: {
        postgres: {
          status: AgentResultStatus.AVAILABLE,
          connectionString: "postgres://user:secret@localhost:5432/bco"
        },
        redis: {
          status: AgentResultStatus.UNAVAILABLE,
          reason: "redis_session_write_failed",
          url: "redis://:secret@localhost:6379/0"
        },
        vectorRecall: {
          status: "disabled",
          mode: "disabled",
          candidateCount: 0
        },
        outbox: {
          status: AgentResultStatus.AVAILABLE,
          pendingCount: 2,
          failedCount: 0,
          lastProcessedAt: 1400
        }
      }
    }
  });

  const snapshot = diagnostics.snapshot();

  assert.equal(snapshot.memoryRepositoryStatus.memoryRepository.storeMode, "layered");
  assert.equal(snapshot.memoryRepositoryStatus.memoryRepository.layered.postgres.status, AgentResultStatus.AVAILABLE);
  assert.equal(snapshot.memoryRepositoryStatus.memoryRepository.layered.redis.reason, "redis_session_write_failed");
  assert.equal(snapshot.memoryRepositoryStatus.memoryRepository.layered.vectorRecall.mode, "disabled");
  assert.equal(snapshot.memoryRepositoryStatus.memoryRepository.layered.outbox.pendingCount, 2);
  assert.doesNotMatch(JSON.stringify(snapshot), /user:secret|:secret@/);
});

test("diagnostics records streaming session state without raw memory or text", () => {
  const diagnostics = createDiagnosticsState({ now: () => 2500 });

  diagnostics.recordStreamEvent({
    type: StreamEventType.SESSION_START,
    sessionId: "stream_diag",
    sequence: 0,
    target: { canonicalName: "Loquat" }
  });
  diagnostics.recordStreamEvent({
    type: StreamEventType.RECALL_STATUS,
    sessionId: "stream_diag",
    sequence: 1,
    lane: StreamLane.ASSOCIATION,
    memoryRecall: {
      bridgeCount: 2,
      bridges: [{ relatedConcept: "Changtai", evidenceEventIds: ["evt_secret"] }],
      preRecall: { relationCandidateCount: 4 }
    }
  });
  diagnostics.recordStreamEvent({
    type: StreamEventType.LANE_FINAL,
    sessionId: "stream_diag",
    sequence: 2,
    lane: StreamLane.ASSOCIATION,
    result: {
      status: AgentResultStatus.UNAVAILABLE,
      reason: "weak_candidates_only",
      text: "Do not store raw streamed text."
    }
  });

  const snapshot = diagnostics.snapshot();

  assert.equal(snapshot.lastStreamingSession.sessionId, "stream_diag");
  assert.equal(snapshot.lastStreamingSession.target, "Loquat");
  assert.equal(snapshot.lastStreamingSession.lanes.association.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(snapshot.lastStreamingSession.lanes.association.reason, "weak_candidates_only");
  assert.equal(snapshot.lastStreamingSession.recall.bridgeCount, 2);
  assert.equal(snapshot.lastStreamingSession.recall.relationCandidateCount, 4);
  assert.doesNotMatch(JSON.stringify(snapshot.lastStreamingSession), /Do not store|evt_secret/);
});

test("background exposes health and diagnostics without generating explanations", async () => {
  let explainCalls = 0;
  const handler = createLocalGatewayHandler({
    token: "local-secret",
    capabilities: { [AgentCapability.EXPLAIN]: true },
    explainHandler: async () => {
      explainCalls += 1;
      return { status: AgentResultStatus.UNAVAILABLE, reason: "not_used" };
    },
    providerRuntime: {
      capabilities: { [AgentCapability.EXPLAIN]: true },
      providerRoles: {
        explain: {
          role: ProviderRole.EXPLAIN,
          enabled: true,
          mode: ProviderKind.CLOUD,
          adapter: ProviderAdapter.OPENAI_COMPATIBLE,
          endpoint: "https://agent.example/v1?api_key=secret",
          modelName: "explain-model",
          tokenPresent: true
        }
      }
    },
    now: () => 2000
  });
  const service = createBackgroundService({
    config: mergeConfig(DEFAULT_CONFIG, {
      localGateway: {
        endpoint: "http://127.0.0.1:17321",
        pairingToken: "local-secret"
      }
    }),
    fetchImpl: (url, options = {}) => handler({ url, method: options.method, headers: options.headers, body: options.body }),
    now: () => 2000
  });

  const health = await service.handleMessage({ type: BackgroundMessageType.GET_PROVIDER_HEALTH, payload: { force: true } });
  const snapshot = await service.handleMessage({ type: BackgroundMessageType.GET_DIAGNOSTICS });

  assert.equal(health.status, AgentResultStatus.AVAILABLE);
  assert.equal(snapshot.providerHealth.status, AgentResultStatus.AVAILABLE);
  assert.equal(snapshot.providerRoles.explain.modelName, "explain-model");
  assert.equal(snapshot.providerRoles.explain.tokenPresent, true);
  assert.equal(snapshot.providerRoles.explain.endpoint, "https://agent.example/v1?api_key=<redacted>");
  assert.equal(explainCalls, 0);
});
