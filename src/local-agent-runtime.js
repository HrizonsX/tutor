// @ts-nocheck
// Local Agent Runtime boundary: composes the runtime explain pipeline, the
// Memory Runtime facade, the Provider Runtime, and runtime config state into
// one object the HTTP gateway delegates endpoint behavior to. The gateway
// keeps auth, request guards, routing, and HTTP status mapping; everything
// behind those concerns lives here.
import {
  AgentCapability,
  AgentProtocolVersion,
  AgentResultStatus,
  MemoryRepositoryMode,
  ProviderKind,
  StreamLane
} from "./contracts.js";
import { createMemoryRuntime } from "./memory-runtime.js";
import { createRuntimeExplainPipeline } from "./runtime-explain-pipeline.js";

export function createLocalAgentRuntime({
  store = undefined,
  memoryRuntime = createMemoryRuntime(store === undefined ? {} : { store }),
  providerRuntime = null,
  runtimeConfigState = null,
  explainHandler = null,
  rewriteHandler = null,
  embeddingHandler = null,
  capabilities = {},
  now = () => Date.now()
} = {}) {
  const runtime = providerRuntime;
  const configState = runtimeConfigState ?? runtime?.configState ?? null;
  const explainPipeline = createRuntimeExplainPipeline({
    store: memoryRuntime,
    now,
    relationProposer: runtime?.proposeRelations ? (request) => runtime.proposeRelations(request) : null,
    relatedConceptHintProvider: runtime?.suggestRelatedConceptHints ? (request) => runtime.suggestRelatedConceptHints(request) : null
  });

  // Computed per call, not frozen at construction: a /config hot update that
  // enables a provider must be visible in the next /health response, or the
  // extension keeps choosing the wrong streaming/fallback path.
  const computeEnabledCapabilities = () => ({
    [AgentCapability.HEALTH]: true,
    [AgentCapability.EXPLAIN]: Boolean(explainHandler || runtime?.capabilities?.[AgentCapability.EXPLAIN]),
    [AgentCapability.STREAMING_EXPLANATION]: Boolean(runtime?.streamExplanation && runtime?.capabilities?.[AgentCapability.STREAMING_EXPLANATION]),
    [AgentCapability.REWRITE]: Boolean(rewriteHandler || runtime?.capabilities?.[AgentCapability.REWRITE]),
    [AgentCapability.EMBEDDING]: Boolean(embeddingHandler || runtime?.capabilities?.[AgentCapability.EMBEDDING]),
    [AgentCapability.RELATION_PROPOSAL]: Boolean(runtime?.capabilities?.[AgentCapability.RELATION_PROPOSAL]),
    [AgentCapability.MEMORY_EVENT_WRITE]: true,
    [AgentCapability.MEMORY_QUERY]: true,
    [AgentCapability.SOURCE_AWARE_EXPLANATION]: false,
    ...capabilities
  });

  function getHealth() {
    const memoryRepository = memoryRuntime.getHealth() ?? {
      mode: MemoryRepositoryMode.LOCAL_GATEWAY,
      status: "available",
      shared: true,
      persistent: false,
      storeMode: "memory"
    };
    return {
      status: AgentResultStatus.AVAILABLE,
      mode: ProviderKind.LOCAL,
      protocolVersion: AgentProtocolVersion,
      capabilities: computeEnabledCapabilities(),
      providerRoles: runtime?.providerRoles ?? {},
      runtimeConfig: configState?.getDiagnosticsState?.() ?? null,
      memoryRepository,
      checkedAt: now()
    };
  }

  // readConfig/updateConfig return null when no runtime config state is
  // attached; the gateway maps that to 503 runtime_config_unavailable.
  function readConfig() {
    if (!configState?.read) return null;
    return configState.read();
  }

  function updateConfig(body = {}) {
    if (!configState?.update) return null;
    const result = configState.update(body?.config ?? body ?? {});
    if (result.status === AgentResultStatus.AVAILABLE && result.appliedPaths?.some((path) => path.startsWith("memory.cognitive."))) {
      const effective = configState.getEffectiveConfig?.();
      memoryRuntime.updateCognitiveConfig({ memory: effective?.memory ?? {} });
    }
    return result;
  }

  async function explain(body = {}) {
    return explainPipeline.handle({
      request: body,
      capabilityKind: AgentCapability.EXPLAIN,
      providerAvailable: Boolean(explainHandler || runtime?.explain),
      providerCall: explainHandler
        ? (requestWithMemory) => explainHandler(requestWithMemory)
        : runtime?.explain
          ? (requestWithMemory) => runtime.explain(requestWithMemory)
          : null
    });
  }

  async function rewrite(body = {}) {
    return explainPipeline.handle({
      request: body,
      capabilityKind: AgentCapability.REWRITE,
      providerAvailable: Boolean(rewriteHandler || runtime?.rewrite),
      providerCall: rewriteHandler
        ? (requestWithMemory) => rewriteHandler(requestWithMemory)
        : runtime?.rewrite
          ? (requestWithMemory) => runtime.rewrite(requestWithMemory)
          : null
    });
  }

  function streamExplainSession(body = {}, { signal = null } = {}) {
    return explainPipeline.streamSession({
      request: body,
      signal,
      providerAvailable: Boolean(runtime?.streamExplanation),
      directProviderStream: runtime?.streamExplanation
        ? (requestWithLane, options) => runtime.streamExplanation(requestWithLane, { ...options, lane: StreamLane.DIRECT })
        : null,
      associationProviderStream: runtime?.streamExplanation
        ? (requestWithLane, options) => runtime.streamExplanation(requestWithLane, { ...options, lane: StreamLane.ASSOCIATION })
        : null
    });
  }

  function hasEmbeddingProvider() {
    return Boolean(embeddingHandler || runtime?.createEmbedding);
  }

  async function createEmbedding(body = {}) {
    if (embeddingHandler) return embeddingHandler(body);
    if (runtime?.createEmbedding) return runtime.createEmbedding(body);
    return null;
  }

  async function writeMemoryEvents(body = {}) {
    const eventPayloads = normalizeMemoryEventPayloads(body);
    const storedEvents = await memoryRuntime.writeEvents(eventPayloads);
    const failed = storedEvents.find((stored) => stored?.status === AgentResultStatus.UNAVAILABLE);
    if (failed) return failed;
    return {
      status: AgentResultStatus.AVAILABLE,
      capabilityKind: AgentCapability.MEMORY_EVENT_WRITE,
      mode: MemoryRepositoryMode.LOCAL_GATEWAY,
      shared: true,
      repositoryStatus: "local_gateway",
      memoryRepository: memoryRuntime.getHealth(),
      event: storedEvents[0] ?? null,
      events: storedEvents,
      eventCount: storedEvents.length
    };
  }

  async function queryMemory(body = {}) {
    const memoryPacket = await memoryRuntime.queryMemory(body);
    if (memoryPacket?.status === AgentResultStatus.UNAVAILABLE) return memoryPacket;
    return {
      status: AgentResultStatus.AVAILABLE,
      capabilityKind: AgentCapability.MEMORY_QUERY,
      mode: MemoryRepositoryMode.LOCAL_GATEWAY,
      shared: true,
      repositoryStatus: memoryPacket.repositoryStatus ?? "local_gateway",
      memoryRepository: memoryRuntime.getHealth(),
      memoryPacket
    };
  }

  return {
    memoryRuntime,
    providerRuntime: runtime,
    runtimeConfigState: configState,
    getHealth,
    readConfig,
    updateConfig,
    explain,
    rewrite,
    streamExplainSession,
    hasEmbeddingProvider,
    createEmbedding,
    writeMemoryEvents,
    queryMemory,
    get capabilities() {
      return computeEnabledCapabilities();
    }
  };
}

function normalizeMemoryEventPayloads(body = {}) {
  if (!Array.isArray(body?.events)) return [body];
  return body.events
    .map((entry) => ({
      repository: entry?.repository ?? body.repository ?? "learning",
      event: entry?.event ?? entry
    }))
    .filter((entry) => entry.event);
}
