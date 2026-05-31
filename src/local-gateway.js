import { DEFAULT_CONFIG } from "./config.js";
import {
  AgentCapability,
  AgentProtocolVersion,
  AgentResultStatus,
  MemoryRepositoryMode,
  ProviderAdapter,
  ProviderKind,
  ProviderRole,
  StreamEventType,
  StreamLane,
  StructuredOutputMode
} from "./contracts.js";
import {
  createLocalMemoryStore,
  createPersistentLocalMemoryStore,
  resolveDefaultLocalMemoryStorePath
} from "./local-memory-store.js";
import { createMemoryRepositoryFromRuntimeConfig } from "./memory-repository-factory.js";
import { createProviderAdapterClient } from "./provider-adapters.js";
import { createRuntimeExplainPipeline } from "./runtime-explain-pipeline.js";
import { inspect } from "node:util";

export {
  createLocalMemoryStore,
  createPersistentLocalMemoryStore,
  createMemoryRepositoryFromRuntimeConfig,
  resolveDefaultLocalMemoryStorePath
};

export const DEFAULT_GATEWAY_PROVIDER_CONFIG = Object.freeze({
  explain: {
    enabled: false,
    provider: ProviderKind.OFF,
    adapter: ProviderAdapter.NONE,
    endpoint: "",
    token: "",
    modelName: "",
    chatPath: "/chat/completions",
    structuredOutput: {
      enabled: true,
      mode: StructuredOutputMode.JSON_SCHEMA,
      schemaName: "bco_explanation_result"
    },
    timeoutMs: 8000,
    health: {
      enabled: true,
      cacheTtlMs: 30 * 1000
    }
  },
  embedding: {
    enabled: false,
    provider: ProviderKind.OFF,
    adapter: ProviderAdapter.NONE,
    endpoint: "",
    token: "",
    modelName: "",
    embeddingPath: "/embeddings",
    timeoutMs: 8000,
    health: {
      enabled: true,
      cacheTtlMs: 30 * 1000
    }
  },
  relationProposer: {
    enabled: false,
    reuseExplainProvider: true,
    provider: ProviderKind.OFF,
    adapter: ProviderAdapter.NONE,
    endpoint: "",
    token: "",
    modelName: "",
    chatPath: "/chat/completions",
    structuredOutput: {
      enabled: true,
      mode: StructuredOutputMode.JSON_SCHEMA,
      schemaName: "bco_relation_proposal_result"
    },
    timeoutMs: 8000,
    health: {
      enabled: true,
      cacheTtlMs: 30 * 1000
    }
  }
});

export function createGatewayRuntimeConfig({ env = globalThis.process?.env ?? {}, providerConfig = {} } = {}) {
  const explain = mergeGatewayProviderRole(DEFAULT_GATEWAY_PROVIDER_CONFIG.explain, {
      ...providerConfig.explain,
      enabled: readBoolean(env.BCO_GATEWAY_EXPLAIN_ENABLED, providerConfig.explain?.enabled),
      provider: env.BCO_GATEWAY_EXPLAIN_PROVIDER ?? providerConfig.explain?.provider,
      adapter: env.BCO_GATEWAY_EXPLAIN_ADAPTER ?? providerConfig.explain?.adapter,
      endpoint: env.BCO_GATEWAY_EXPLAIN_ENDPOINT ?? providerConfig.explain?.endpoint,
      token: env.BCO_GATEWAY_EXPLAIN_TOKEN ?? providerConfig.explain?.token,
      modelName: env.BCO_GATEWAY_EXPLAIN_MODEL ?? providerConfig.explain?.modelName,
      chatPath: env.BCO_GATEWAY_EXPLAIN_CHAT_PATH ?? providerConfig.explain?.chatPath,
      timeoutMs: readNumber(env.BCO_GATEWAY_EXPLAIN_TIMEOUT_MS, providerConfig.explain?.timeoutMs),
      structuredOutput: {
        ...providerConfig.explain?.structuredOutput,
        mode: env.BCO_GATEWAY_EXPLAIN_STRUCTURED_OUTPUT ?? providerConfig.explain?.structuredOutput?.mode,
        schemaName: env.BCO_GATEWAY_EXPLAIN_SCHEMA_NAME ?? providerConfig.explain?.structuredOutput?.schemaName
      }
    });
  const embedding = mergeGatewayProviderRole(DEFAULT_GATEWAY_PROVIDER_CONFIG.embedding, {
      ...providerConfig.embedding,
      enabled: readBoolean(env.BCO_GATEWAY_EMBEDDING_ENABLED, providerConfig.embedding?.enabled),
      provider: env.BCO_GATEWAY_EMBEDDING_PROVIDER ?? providerConfig.embedding?.provider,
      adapter: env.BCO_GATEWAY_EMBEDDING_ADAPTER ?? providerConfig.embedding?.adapter,
      endpoint: env.BCO_GATEWAY_EMBEDDING_ENDPOINT ?? providerConfig.embedding?.endpoint,
      token: env.BCO_GATEWAY_EMBEDDING_TOKEN ?? providerConfig.embedding?.token,
      modelName: env.BCO_GATEWAY_EMBEDDING_MODEL ?? providerConfig.embedding?.modelName,
      embeddingPath: env.BCO_GATEWAY_EMBEDDING_PATH ?? providerConfig.embedding?.embeddingPath,
      timeoutMs: readNumber(env.BCO_GATEWAY_EMBEDDING_TIMEOUT_MS, providerConfig.embedding?.timeoutMs)
    });
  const relationProposer = mergeGatewayProviderRole(DEFAULT_GATEWAY_PROVIDER_CONFIG.relationProposer, {
      ...providerConfig.relationProposer,
      enabled: readBoolean(
        env.BCO_GATEWAY_RELATION_PROPOSER_ENABLED,
        providerConfig.relationProposer?.enabled ?? Boolean(explain.enabled)
      ),
      reuseExplainProvider: readBoolean(
        env.BCO_GATEWAY_RELATION_PROPOSER_REUSE_EXPLAIN,
        providerConfig.relationProposer?.reuseExplainProvider
      ),
      provider: env.BCO_GATEWAY_RELATION_PROPOSER_PROVIDER ?? providerConfig.relationProposer?.provider,
      adapter: env.BCO_GATEWAY_RELATION_PROPOSER_ADAPTER ?? providerConfig.relationProposer?.adapter,
      endpoint: env.BCO_GATEWAY_RELATION_PROPOSER_ENDPOINT ?? providerConfig.relationProposer?.endpoint,
      token: env.BCO_GATEWAY_RELATION_PROPOSER_TOKEN ?? providerConfig.relationProposer?.token,
      modelName: env.BCO_GATEWAY_RELATION_PROPOSER_MODEL ?? providerConfig.relationProposer?.modelName,
      chatPath: env.BCO_GATEWAY_RELATION_PROPOSER_CHAT_PATH ?? providerConfig.relationProposer?.chatPath,
      timeoutMs: readNumber(env.BCO_GATEWAY_RELATION_PROPOSER_TIMEOUT_MS, providerConfig.relationProposer?.timeoutMs),
      structuredOutput: {
        ...providerConfig.relationProposer?.structuredOutput,
        mode: env.BCO_GATEWAY_RELATION_PROPOSER_STRUCTURED_OUTPUT ?? providerConfig.relationProposer?.structuredOutput?.mode,
        schemaName: env.BCO_GATEWAY_RELATION_PROPOSER_SCHEMA_NAME ?? providerConfig.relationProposer?.structuredOutput?.schemaName
      }
    });
  return {
    explain,
    embedding,
    relationProposer
  };
}

export function createGatewayProviderRuntime({
  providerConfig = createGatewayRuntimeConfig(),
  configState = null,
  fetchImpl = globalThis.fetch,
  logger = null,
  now = () => Date.now(),
  config = DEFAULT_CONFIG
} = {}) {
  const staticRuntimeConfig = createGatewayRuntimeConfig({ providerConfig });
  const getRuntimeConfig = () => configState?.getEffectiveConfig?.() ?? staticRuntimeConfig;

  async function explain(request = {}) {
    return dispatchChat(request, AgentCapability.EXPLAIN);
  }

  async function rewrite(request = {}) {
    return dispatchChat(request, AgentCapability.REWRITE);
  }

  async function streamExplanation(request = {}, options = {}) {
    const runtimeConfig = getRuntimeConfig();
    const provider = buildRuntimeProvider(runtimeConfig.explain, ProviderRole.EXPLAIN, AgentCapability.EXPLAIN);
    const unavailable = validateRuntimeProvider(provider, AgentCapability.EXPLAIN);
    if (unavailable) return unavailable;
    const adapterClient = createProviderAdapterClient({
      provider,
      fetchImpl,
      token: provider.token,
      config,
      now,
      logger
    });
    if (!adapterClient?.streamExplanation) {
      return unavailableRuntimeProvider("provider_adapter_unconfigured", AgentCapability.EXPLAIN, provider);
    }
    try {
      return await withTimeout(
        adapterClient.streamExplanation(request, options),
        provider.timeoutMs,
        "agent_timeout"
      );
    } catch (error) {
      return unavailableRuntimeProvider(
        error?.message === "agent_timeout" ? "agent_timeout" : "provider_unavailable",
        AgentCapability.EXPLAIN,
        provider
      );
    }
  }

  async function suggestRelatedConceptHints(request = {}) {
    const runtimeConfig = getRuntimeConfig();
    const provider = buildRuntimeProvider(runtimeConfig.explain, ProviderRole.EXPLAIN, AgentCapability.EXPLAIN);
    const unavailable = validateRuntimeProvider(provider, AgentCapability.EXPLAIN);
    if (unavailable) return unavailable;
    const adapterClient = createProviderAdapterClient({
      provider,
      fetchImpl,
      token: provider.token,
      config,
      now,
      logger
    });
    if (!adapterClient?.suggestRelatedConceptHints) {
      return unavailableRuntimeProvider("provider_adapter_unconfigured", AgentCapability.EXPLAIN, provider);
    }
    try {
      return await withTimeout(
        adapterClient.suggestRelatedConceptHints(request),
        provider.timeoutMs,
        "agent_timeout"
      );
    } catch (error) {
      return unavailableRuntimeProvider(
        error?.message === "agent_timeout" ? "agent_timeout" : "provider_unavailable",
        AgentCapability.EXPLAIN,
        provider
      );
    }
  }

  async function createEmbedding(payload = {}) {
    const runtimeConfig = getRuntimeConfig();
    const provider = buildRuntimeProvider(runtimeConfig.embedding, ProviderRole.EMBEDDING, AgentCapability.EMBEDDING);
    const unavailable = validateRuntimeProvider(provider, AgentCapability.EMBEDDING);
    if (unavailable) return unavailable;
    const adapterClient = createProviderAdapterClient({
      provider,
      fetchImpl,
      token: provider.token,
      config,
      now,
      logger
    });
    if (!adapterClient?.createEmbedding) {
      return unavailableRuntimeProvider("provider_adapter_unconfigured", AgentCapability.EMBEDDING, provider, { vector: null });
    }
    try {
      return await withTimeout(
        adapterClient.createEmbedding(payload),
        provider.timeoutMs,
        "embedding_timeout"
      );
    } catch (error) {
      return unavailableRuntimeProvider(
        error?.message === "embedding_timeout" ? "embedding_timeout" : "provider_unavailable",
        AgentCapability.EMBEDDING,
        provider,
        { vector: null }
      );
    }
  }

  async function proposeRelations(request = {}) {
    const runtimeConfig = getRuntimeConfig();
    const roleConfig = resolveRelationProposerRoleConfig(runtimeConfig);
    const provider = buildRuntimeProvider(roleConfig, ProviderRole.RELATION_PROPOSER, AgentCapability.RELATION_PROPOSAL);
    const unavailable = validateRuntimeProvider(provider, AgentCapability.RELATION_PROPOSAL);
    if (unavailable) return unavailable;
    const adapterClient = createProviderAdapterClient({
      provider,
      fetchImpl,
      token: provider.token,
      config,
      now,
      logger
    });
    if (!adapterClient?.proposeRelations) {
      return unavailableRuntimeProvider("provider_adapter_unconfigured", AgentCapability.RELATION_PROPOSAL, provider);
    }
    try {
      return await withTimeout(
        adapterClient.proposeRelations(request),
        provider.timeoutMs,
        "relation_proposer_timeout"
      );
    } catch (error) {
      return unavailableRuntimeProvider(
        error?.message === "relation_proposer_timeout" ? "relation_proposer_timeout" : "provider_unavailable",
        AgentCapability.RELATION_PROPOSAL,
        provider
      );
    }
  }

  async function dispatchChat(request, capabilityKind) {
    const runtimeConfig = getRuntimeConfig();
    const provider = buildRuntimeProvider(runtimeConfig.explain, ProviderRole.EXPLAIN, capabilityKind);
    const unavailable = validateRuntimeProvider(provider, capabilityKind);
    if (unavailable) return unavailable;
    const adapterClient = createProviderAdapterClient({
      provider,
      fetchImpl,
      token: provider.token,
      config,
      now,
      logger
    });
    const method = capabilityKind === AgentCapability.REWRITE ? adapterClient?.rewrite : adapterClient?.explain;
    if (!method) {
      return unavailableRuntimeProvider("provider_adapter_unconfigured", capabilityKind, provider);
    }
    try {
      return await withTimeout(method.call(adapterClient, request), provider.timeoutMs, "agent_timeout");
    } catch (error) {
      return unavailableRuntimeProvider(
        error?.message === "agent_timeout" ? "agent_timeout" : "provider_unavailable",
        capabilityKind,
        provider
      );
    }
  }

  return {
    explain,
    rewrite,
    streamExplanation,
    suggestRelatedConceptHints,
    createEmbedding,
    proposeRelations,
    configState,
    get capabilities() {
      return createRuntimeCapabilities(getRuntimeConfig());
    },
    get providerRoles() {
      return createRuntimeProviderRoleState(getRuntimeConfig());
    }
  };
}

export function createLocalGatewayHandler({
  token = "",
  store = createLocalMemoryStore(),
  capabilities = {},
  explainHandler = null,
  rewriteHandler = null,
  embeddingHandler = null,
  providerRuntime = null,
  runtimeConfigState = null,
  now = () => Date.now()
} = {}) {
  const runtime = providerRuntime;
  const configState = runtimeConfigState ?? runtime?.configState ?? null;
  const explainPipeline = createRuntimeExplainPipeline({
    store,
    now,
    relationProposer: runtime?.proposeRelations ? (request) => runtime.proposeRelations(request) : null,
    relatedConceptHintProvider: runtime?.suggestRelatedConceptHints ? (request) => runtime.suggestRelatedConceptHints(request) : null
  });
  const enabledCapabilities = {
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
  };

  return async function handleLocalGatewayRequest(request = {}) {
    const method = request.method ?? "GET";
    const url = new URL(request.url ?? "http://127.0.0.1/");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (!isAuthorized(request, token)) {
      return jsonResponse({ status: AgentResultStatus.UNAVAILABLE, reason: "local_gateway_pairing_rejected" }, 401);
    }

    if (path === "/health") {
      const memoryRepository = typeof store.getHealth === "function"
        ? store.getHealth()
        : {
            mode: MemoryRepositoryMode.LOCAL_GATEWAY,
            status: "available",
            shared: true,
            persistent: false,
            storeMode: "memory"
          };
      return jsonResponse({
        status: AgentResultStatus.AVAILABLE,
        mode: ProviderKind.LOCAL,
        protocolVersion: AgentProtocolVersion,
        capabilities: enabledCapabilities,
        providerRoles: runtime?.providerRoles ?? {},
        runtimeConfig: configState?.getDiagnosticsState?.() ?? null,
        memoryRepository,
        checkedAt: now()
      });
    }

    if (path === "/config" && method === "GET") {
      if (!configState?.read) {
        return jsonResponse({ status: AgentResultStatus.UNAVAILABLE, reason: "runtime_config_unavailable" }, 503);
      }
      return jsonResponse(configState.read());
    }

    if (method !== "POST") {
      return jsonResponse({ status: AgentResultStatus.UNAVAILABLE, reason: "method_not_allowed" }, 405);
    }

    const body = await readBody(request);
    if (path === "/config") {
      if (!configState?.update) {
        return jsonResponse({ status: AgentResultStatus.UNAVAILABLE, reason: "runtime_config_unavailable" }, 503);
      }
      const result = configState.update(body?.config ?? body ?? {});
      if (result.status === AgentResultStatus.AVAILABLE && result.appliedPaths?.some((path) => path.startsWith("memory.cognitive."))) {
        const effective = configState.getEffectiveConfig?.();
        store.updateConfig?.({ memory: effective?.memory ?? {} });
      }
      return jsonResponse(result, result.status === AgentResultStatus.INVALID ? 400 : 200);
    }
    if (path === "/explain") {
      return jsonResponse(await explainPipeline.handle({
        request: body,
        capabilityKind: AgentCapability.EXPLAIN,
        providerAvailable: Boolean(explainHandler || runtime?.explain),
        providerCall: explainHandler
          ? (requestWithMemory) => explainHandler(requestWithMemory)
          : runtime?.explain
            ? (requestWithMemory) => runtime.explain(requestWithMemory)
            : null
      }));
    }
    if (path === "/explain/stream-session") {
      return jsonLineStreamResponse(explainPipeline.streamSession({
        request: body,
        providerAvailable: Boolean(runtime?.streamExplanation),
        directProviderStream: runtime?.streamExplanation
          ? (requestWithLane, options) => runtime.streamExplanation(requestWithLane, { ...options, lane: StreamLane.DIRECT })
          : null,
        associationProviderStream: runtime?.streamExplanation
          ? (requestWithLane, options) => runtime.streamExplanation(requestWithLane, { ...options, lane: StreamLane.ASSOCIATION })
          : null
      }));
    }
    if (path === "/rewrite") {
      return jsonResponse(await explainPipeline.handle({
        request: body,
        capabilityKind: AgentCapability.REWRITE,
        providerAvailable: Boolean(rewriteHandler || runtime?.rewrite),
        providerCall: rewriteHandler
          ? (requestWithMemory) => rewriteHandler(requestWithMemory)
          : runtime?.rewrite
            ? (requestWithMemory) => runtime.rewrite(requestWithMemory)
            : null
      }));
    }
    if (path === "/embedding") {
      if (embeddingHandler) {
        return jsonResponse(await embeddingHandler(body));
      }
      if (runtime?.createEmbedding) {
        return jsonResponse(await runtime.createEmbedding(body));
      }
      if (!enabledCapabilities[AgentCapability.EMBEDDING]) {
        return jsonResponse(unavailableCapability(AgentCapability.EMBEDDING));
      }
    }
    if (path === "/memory/events") {
      const eventPayloads = normalizeMemoryEventPayloads(body);
      const storedEvents = [];
      for (const eventPayload of eventPayloads) {
        const stored = await store.writeEvent(eventPayload);
        if (stored?.status === AgentResultStatus.UNAVAILABLE) {
          return jsonResponse(stored, 503);
        }
        storedEvents.push(stored);
      }
      return jsonResponse({
        status: AgentResultStatus.AVAILABLE,
        capabilityKind: AgentCapability.MEMORY_EVENT_WRITE,
        mode: MemoryRepositoryMode.LOCAL_GATEWAY,
        shared: true,
        repositoryStatus: "local_gateway",
        memoryRepository: typeof store.getHealth === "function" ? store.getHealth() : null,
        event: storedEvents[0] ?? null,
        events: storedEvents,
        eventCount: storedEvents.length
      });
    }
    if (path === "/memory/query") {
      const memoryPacket = await store.queryMemory(body);
      if (memoryPacket?.status === AgentResultStatus.UNAVAILABLE) {
        return jsonResponse(memoryPacket, 503);
      }
      return jsonResponse({
        status: AgentResultStatus.AVAILABLE,
        capabilityKind: AgentCapability.MEMORY_QUERY,
        mode: MemoryRepositoryMode.LOCAL_GATEWAY,
        shared: true,
        repositoryStatus: memoryPacket.repositoryStatus ?? "local_gateway",
        memoryRepository: typeof store.getHealth === "function" ? store.getHealth() : null,
        memoryPacket
      });
    }

    return jsonResponse({ status: AgentResultStatus.UNAVAILABLE, reason: "provider_capability_unsupported" }, 404);
  };
}

async function injectRuntimeMemory(request = {}, { store, capabilityKind, now = () => Date.now() } = {}) {
  const statelessRequest = stripBrowserMemoryFields(request);
  if (!store?.queryMemory) return statelessRequest;
  const target = statelessRequest.target ?? {};
  const canonicalName = target.canonicalName ?? target.target ?? statelessRequest.targetObject?.canonicalName ?? "";
  if (!canonicalName) return statelessRequest;
  const memoryPacket = await store.queryMemory({
    canonicalName,
    candidate: target,
    timestamp: statelessRequest.timestamp ?? now()
  });
  if (memoryPacket?.status === AgentResultStatus.UNAVAILABLE) {
    return {
      ...statelessRequest,
      constraints: {
        ...(statelessRequest.constraints ?? {}),
        memoryStatus: memoryPacket.reason ?? "local_gateway_degraded"
      }
    };
  }
  return {
    ...statelessRequest,
    capabilityKind: statelessRequest.capabilityKind ?? capabilityKind,
    memoryPacket,
    memorySummary: memoryPacket.agentSummary ?? {},
    profileHints: memoryPacket.profileHints ?? {},
    constraints: {
      ...(statelessRequest.constraints ?? {}),
      memoryStatus: memoryPacket.repositoryStatus ?? memoryPacket.memoryFreshness?.status ?? "local_gateway"
    }
  };
}

function stripBrowserMemoryFields(request = {}) {
  const {
    memoryPacket: _memoryPacket,
    memorySummary: _memorySummary,
    profileHints: _profileHints,
    priorExplanations: _priorExplanations,
    feedbackEvents: _feedbackEvents,
    feedbackHistory: _feedbackHistory,
    conceptFamiliarity: _conceptFamiliarity,
    derivedSummaries: _derivedSummaries,
    preferenceSummaries: _preferenceSummaries,
    conceptProjection: _conceptProjection,
    conceptProjections: _conceptProjections,
    dailySummary: _dailySummary,
    dailySummaries: _dailySummaries,
    memoryBridges: _memoryBridges,
    relationProposals: _relationProposals,
    relationCandidates: _relationCandidates,
    reportContext: _reportContext,
    reflectionReport: _reflectionReport,
    ...statelessRequest
  } = request;
  return statelessRequest;
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

export async function startLocalGatewayServer({
  host = "127.0.0.1",
  port = 17321,
  handler = createLocalGatewayHandler(),
  logger = null
} = {}) {
  const { createServer } = await import("node:http");
  const server = createServer(async (req, res) => {
    const startedAt = Date.now();
    const startedAtIso = new Date(startedAt).toISOString();
    const requestUrl = `http://${host}:${port}${req.url}`;
    const method = req.method ?? "GET";
    const path = redactUrlForLog(requestUrl);
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", async () => {
      const body = Buffer.concat(chunks).toString("utf8");
      try {
        const response = await handler({
          method,
          url: requestUrl,
          headers: req.headers,
          body
        });
        res.writeHead(response.status, response.headers);
        if (isAsyncIterable(response.body)) {
          for await (const chunk of response.body) {
            logStreamChunk(logger, requestUrl, chunk);
            res.write(typeof chunk === "string" || Buffer.isBuffer(chunk) ? chunk : JSON.stringify(chunk));
          }
          res.end();
        } else {
          res.end(response.body);
        }
        logGatewayServer(logger, response.ok ? "info" : "warn", "request_finish", {
          method,
          path,
          status: response.status,
          startedAt: startedAtIso,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt
        });
        logExplainResult(logger, requestUrl, response);
      } catch (error) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({
          status: AgentResultStatus.UNAVAILABLE,
          reason: "local_gateway_handler_failed"
        }));
        logGatewayServer(logger, "warn", "request_error", {
          method,
          path,
          status: 500,
          startedAt: startedAtIso,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
          message: error?.message ?? String(error)
        });
      }
    });
  });

  await new Promise((resolve) => server.listen(port, host, resolve));
  return server;
}

function mergeGatewayProviderRole(base = {}, override = {}) {
  return {
    ...base,
    ...removeUndefined(override),
    structuredOutput: {
      ...(base.structuredOutput ?? {}),
      ...removeUndefined(override.structuredOutput ?? {})
    },
    health: {
      ...(base.health ?? {}),
      ...removeUndefined(override.health ?? {})
    }
  };
}

function removeUndefined(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function readBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return value === true || String(value).toLowerCase() === "true";
}

function readNumber(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildRuntimeProvider(roleConfig = {}, role = ProviderRole.EXPLAIN, capability = AgentCapability.EXPLAIN) {
  return {
    role,
    mode: normalizeRuntimeProviderMode(roleConfig.provider),
    capability,
    adapter: normalizeRuntimeAdapter(roleConfig.adapter),
    endpoint: roleConfig.endpoint ?? "",
    token: roleConfig.token ?? "",
    modelName: roleConfig.modelName ?? "",
    chatPath: roleConfig.chatPath ?? "",
    embeddingPath: roleConfig.embeddingPath ?? "",
    structuredOutput: { ...(roleConfig.structuredOutput ?? {}) },
    timeoutMs: roleConfig.timeoutMs ?? 8000,
    enabled: Boolean(roleConfig.enabled)
  };
}

function resolveRelationProposerRoleConfig(runtimeConfig = {}) {
  const relationConfig = mergeGatewayProviderRole(
    DEFAULT_GATEWAY_PROVIDER_CONFIG.relationProposer,
    runtimeConfig.relationProposer ?? {}
  );
  if (!relationConfig.reuseExplainProvider) return relationConfig;
  const explainConfig = mergeGatewayProviderRole(DEFAULT_GATEWAY_PROVIDER_CONFIG.explain, runtimeConfig.explain ?? {});
  return mergeGatewayProviderRole(explainConfig, {
    enabled: Boolean(relationConfig.enabled && explainConfig.enabled),
    reuseExplainProvider: true,
    structuredOutput: relationConfig.structuredOutput ?? DEFAULT_GATEWAY_PROVIDER_CONFIG.relationProposer.structuredOutput,
    timeoutMs: relationConfig.timeoutMs ?? explainConfig.timeoutMs,
    health: relationConfig.health ?? explainConfig.health
  });
}

function normalizeRuntimeProviderMode(provider = ProviderKind.OFF) {
  if (provider === "none" || provider === ProviderKind.OFF) return ProviderKind.OFF;
  if (provider === "custom_http" || provider === "test" || provider === ProviderKind.CUSTOM) return ProviderKind.CUSTOM;
  if (provider === ProviderKind.CLOUD) return ProviderKind.CLOUD;
  if (provider === ProviderKind.LOCAL) return ProviderKind.LOCAL;
  return ProviderKind.OFF;
}

function normalizeRuntimeAdapter(adapter = ProviderAdapter.NONE) {
  if (adapter === "openai" || adapter === "openai_compatible" || adapter === ProviderAdapter.OPENAI_COMPATIBLE) {
    return ProviderAdapter.OPENAI_COMPATIBLE;
  }
  if (adapter === "agent" || adapter === "internal_agent" || adapter === ProviderAdapter.INTERNAL_AGENT) {
    return ProviderAdapter.INTERNAL_AGENT;
  }
  return ProviderAdapter.NONE;
}

function validateRuntimeProvider(provider, capabilityKind) {
  if (!provider.enabled || provider.mode === ProviderKind.OFF) {
    const reason = provider.role === ProviderRole.EMBEDDING
      ? "embedding_provider_disabled"
      : provider.role === ProviderRole.RELATION_PROPOSER
        ? "relation_proposer_disabled"
        : "explain_provider_off";
    return unavailableRuntimeProvider(reason, capabilityKind, provider, provider.role === ProviderRole.EMBEDDING ? { vector: null } : {});
  }
  if (!provider.endpoint) {
    const reason = provider.role === ProviderRole.EMBEDDING
      ? "embedding_endpoint_unconfigured"
      : provider.role === ProviderRole.RELATION_PROPOSER
        ? "relation_proposer_endpoint_unconfigured"
        : "explain_endpoint_unconfigured";
    return unavailableRuntimeProvider(reason, capabilityKind, provider, provider.role === ProviderRole.EMBEDDING ? { vector: null } : {});
  }
  if (!provider.adapter) {
    return unavailableRuntimeProvider("provider_adapter_unconfigured", capabilityKind, provider, provider.role === ProviderRole.EMBEDDING ? { vector: null } : {});
  }
  if (provider.adapter === ProviderAdapter.OPENAI_COMPATIBLE) {
    if ((capabilityKind === AgentCapability.EXPLAIN || capabilityKind === AgentCapability.REWRITE || capabilityKind === AgentCapability.RELATION_PROPOSAL) && !provider.chatPath) {
      const reason = capabilityKind === AgentCapability.RELATION_PROPOSAL
        ? "relation_proposer_chat_path_unconfigured"
        : "explain_chat_path_unconfigured";
      return unavailableRuntimeProvider(reason, capabilityKind, provider);
    }
    if (capabilityKind === AgentCapability.EMBEDDING && !provider.embeddingPath) {
      return unavailableRuntimeProvider("embedding_path_unconfigured", capabilityKind, provider, { vector: null });
    }
    const mode = provider.structuredOutput?.mode ?? StructuredOutputMode.PROMPT_JSON;
    if ((provider.role === ProviderRole.EXPLAIN || provider.role === ProviderRole.RELATION_PROPOSER) && !Object.values(StructuredOutputMode).includes(mode)) {
      return unavailableRuntimeProvider("provider_model_unsupported", capabilityKind, provider);
    }
  }
  return null;
}

function createRuntimeCapabilities(runtimeConfig = {}) {
  return {
    [AgentCapability.EXPLAIN]: isRuntimeRoleAvailable(runtimeConfig.explain, AgentCapability.EXPLAIN),
    [AgentCapability.STREAMING_EXPLANATION]: isRuntimeRoleAvailable(runtimeConfig.explain, AgentCapability.EXPLAIN),
    [AgentCapability.REWRITE]: isRuntimeRoleAvailable(runtimeConfig.explain, AgentCapability.REWRITE),
    [AgentCapability.EMBEDDING]: isRuntimeRoleAvailable(runtimeConfig.embedding, AgentCapability.EMBEDDING),
    [AgentCapability.RELATION_PROPOSAL]: isRuntimeRoleAvailable(
      resolveRelationProposerRoleConfig(runtimeConfig),
      AgentCapability.RELATION_PROPOSAL
    )
  };
}

function isRuntimeRoleAvailable(roleConfig = {}, capabilityKind) {
  const role = capabilityKind === AgentCapability.EMBEDDING
    ? ProviderRole.EMBEDDING
    : capabilityKind === AgentCapability.RELATION_PROPOSAL
      ? ProviderRole.RELATION_PROPOSER
      : ProviderRole.EXPLAIN;
  const provider = buildRuntimeProvider(roleConfig, role, capabilityKind);
  return !validateRuntimeProvider(provider, capabilityKind);
}

function createRuntimeProviderRoleState(runtimeConfig = {}) {
  return {
    [ProviderRole.EXPLAIN]: runtimeRoleState(runtimeConfig.explain, ProviderRole.EXPLAIN),
    [ProviderRole.EMBEDDING]: runtimeRoleState(runtimeConfig.embedding, ProviderRole.EMBEDDING),
    [ProviderRole.RELATION_PROPOSER]: runtimeRoleState(
      resolveRelationProposerRoleConfig(runtimeConfig),
      ProviderRole.RELATION_PROPOSER
    )
  };
}

function runtimeRoleState(roleConfig = {}, role = ProviderRole.EXPLAIN) {
  const provider = buildRuntimeProvider(roleConfig, role, role === ProviderRole.EMBEDDING
    ? AgentCapability.EMBEDDING
    : role === ProviderRole.RELATION_PROPOSER
      ? AgentCapability.RELATION_PROPOSAL
      : AgentCapability.EXPLAIN);
  return {
    role,
    enabled: provider.enabled,
    mode: provider.mode,
    adapter: provider.adapter,
    endpoint: redactUrlForLog(provider.endpoint),
    chatPath: redactUrlForLog(provider.chatPath),
    embeddingPath: redactUrlForLog(provider.embeddingPath),
    structuredOutput: { ...(provider.structuredOutput ?? {}) },
    modelName: provider.modelName,
    tokenPresent: Boolean(provider.token),
    timeoutMs: provider.timeoutMs,
    reuseExplainProvider: Boolean(roleConfig.reuseExplainProvider),
    health: { ...(roleConfig.health ?? {}) }
  };
}

function unavailableCapability(capabilityKind) {
  return {
    status: AgentResultStatus.UNAVAILABLE,
    reason: "provider_capability_unsupported",
    capabilityKind
  };
}

function unavailableRuntimeProvider(reason, capabilityKind, provider = {}, extra = {}) {
  return {
    status: AgentResultStatus.UNAVAILABLE,
    reason,
    unavailableReason: reason,
    capabilityKind,
    providerRole: provider.role ?? null,
    providerMode: provider.mode ?? null,
    adapter: provider.adapter ?? null,
    modelName: provider.modelName ?? null,
    ...extra
  };
}

function isAuthorized(request, token) {
  if (!token) return true;
  const headers = request.headers ?? {};
  const headerValue = headers["x-bco-pairing-token"] ?? headers["X-BCO-Pairing-Token"];
  const authorization = headers.authorization ?? headers.Authorization ?? "";
  return headerValue === token || authorization === `Bearer ${token}`;
}

async function readBody(request) {
  if (!request.body) return {};
  if (typeof request.body === "string") {
    try {
      return JSON.parse(request.body);
    } catch {
      return {};
    }
  }
  if (typeof request.json === "function") return request.json();
  return {};
}

function jsonResponse(body, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    json: async () => body
  };
}

function logGatewayServer(logger, level, event, details = {}) {
  if (!logger) return;
  const log = logger[level] ?? logger.log;
  if (typeof log !== "function") return;
  const enrichedDetails = enrichGatewayLogDetails(event, details);
  log.call(logger, `[BCO][local-gateway-server] ${event}`, formatLogDetailsForLogger(logger, event, enrichedDetails));
}

function jsonLineStreamResponse(events, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store"
    },
    body: mapAsyncIterable(events, (event) => `${JSON.stringify(event)}\n`)
  };
}

async function* mapAsyncIterable(iterable, mapper) {
  for await (const item of iterable) {
    yield mapper(item);
  }
}

function isAsyncIterable(value) {
  return value && typeof value[Symbol.asyncIterator] === "function";
}

function enrichGatewayLogDetails(event, details = {}) {
  const summary = details.summary ?? summarizeGatewayLogEvent(event, details);
  return summary ? { summary, ...details } : details;
}

function summarizeGatewayLogEvent(event, details = {}) {
  if (event === "request_start") return `${details.method ?? "HTTP"} ${details.path ?? ""} started`;
  if (event === "request_finish") {
    const timestamp = details.startedAt ? `${details.startedAt} ` : "";
    return `${timestamp}${details.method ?? "HTTP"} ${details.path ?? ""} -> ${details.status ?? "unknown"} in ${details.durationMs ?? "?"}ms`;
  }
  if (event === "request_error") {
    const timestamp = details.startedAt ? `${details.startedAt} ` : "";
    return `${timestamp}${details.method ?? "HTTP"} ${details.path ?? ""} failed: ${details.message ?? details.reason ?? "handler_error"}`;
  }
  if (event === "explain_result" || event === "rewrite_result") {
    const kind = event === "rewrite_result" ? "rewrite" : "explain";
    return summarizeExplanationLog(kind, details);
  }
  if (event === "stream_session_start") {
    return `stream ${details.sessionId ?? ""} started target=${details.target ?? "unknown"}`.trim();
  }
  if (event === "stream_lane_final") {
    const reason = details.reason ? ` reason=${details.reason}` : "";
    return `stream ${details.sessionId ?? ""} ${details.lane ?? "lane"} ${details.status ?? "unknown"}${reason}`.trim();
  }
  if (event === "stream_cancelled") {
    return `stream ${details.sessionId ?? ""} cancelled`;
  }
  return "";
}

function formatLogDetailsForLogger(logger, event, details = {}) {
  if (logger !== console) return details;
  if (event === "request_start" || event === "request_finish" || event === "request_error") {
    return details.summary ?? summarizeGatewayLogEvent(event, details);
  }
  return inspect(details, {
    depth: null,
    colors: true,
    compact: false,
    breakLength: 120
  });
}

function logExplainResult(logger, requestUrl, response) {
  if (!logger || !response?.ok) return;
  const path = getPathname(requestUrl);
  if (path !== "/explain" && path !== "/rewrite") return;
  const body = parseJsonForLog(response.body);
  const text = body?.explanation ?? body?.microExplanation ?? body?.text ?? "";
  if (!text) return;
  const kind = path === "/rewrite" ? "rewrite" : "explain";
  const details = {
    status: body.status ?? null,
    target: body.target?.canonicalName ?? body.target?.observedText ?? null,
    modelName: body.modelName ?? body.versionMetadata?.model ?? null,
    providerMode: body.providerMode ?? null,
    text: clampLogText(text, 500)
  };
  const memoryRecall = sanitizeMemoryRecallForLog(body?.runtimeDecision?.memoryRecall);
  const memoryRecallSummary = summarizeMemoryRecallForProductLog(memoryRecall);
  details.outcome = {
    kind,
    status: details.status,
    target: details.target,
    modelName: details.modelName,
    providerMode: details.providerMode,
    memoryDecision: memoryRecallSummary.decision,
    bridgeCount: memoryRecallSummary.bridgeCount
  };
  details.memoryRecallSummary = memoryRecallSummary;
  if (memoryRecall) details.memoryRecall = memoryRecall;
  details.summary = summarizeExplanationLog(kind, details);
  logGatewayServer(logger, "info", kind === "rewrite" ? "rewrite_result" : "explain_result", details);
}

function logStreamChunk(logger, requestUrl, chunk) {
  if (!logger || getPathname(requestUrl) !== "/explain/stream-session") return;
  try {
    const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk ?? "");
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (event.type === StreamEventType.SESSION_START) {
        logGatewayServer(logger, "info", "stream_session_start", {
          sessionId: event.sessionId ?? null,
          target: event.target?.canonicalName ?? event.target?.observedText ?? null,
          sequence: event.sequence ?? null
        });
      } else if (event.type === StreamEventType.LANE_FINAL || event.type === StreamEventType.LANE_ERROR) {
        const memoryRecall = sanitizeMemoryRecallForLog(event.result?.runtimeDecision?.memoryRecall);
        const memorySummary = summarizeMemoryRecallForProductLog(memoryRecall);
        logGatewayServer(logger, event.result?.status === AgentResultStatus.AVAILABLE ? "info" : "warn", "stream_lane_final", {
          sessionId: event.sessionId ?? null,
          lane: event.lane ?? null,
          status: event.result?.status ?? null,
          reason: event.result?.reason ?? event.result?.unavailableReason ?? null,
          target: event.result?.target?.canonicalName ?? event.result?.target?.observedText ?? null,
          sequence: event.sequence ?? null,
          memoryRecallSummary: memorySummary,
          summary: summarizeGatewayLogEvent("stream_lane_final", {
            sessionId: event.sessionId ?? null,
            lane: event.lane ?? null,
            status: event.result?.status ?? null,
            reason: event.result?.reason ?? event.result?.unavailableReason ?? null
          })
        });
      } else if (event.type === StreamEventType.SESSION_CANCELLED) {
        logGatewayServer(logger, "warn", "stream_cancelled", {
          sessionId: event.sessionId ?? null,
          sequence: event.sequence ?? null
        });
      }
    }
  } catch {
    // Streaming logs are diagnostic only and must never break the response.
  }
}

function summarizeExplanationLog(kind, details = {}) {
  const memory = details.memoryRecallSummary ?? summarizeMemoryRecallForProductLog(details.memoryRecall);
  const target = details.target ? ` ${details.target}` : "";
  const bridge = memory.bridgeNames?.length ? ` bridge=${memory.bridgeNames.join("|")}` : "";
  const rejected = memory.rejectedCandidateCount ? ` rejected=${memory.rejectedCandidateCount}` : "";
  const model = details.modelName ? ` model=${details.modelName}` : "";
  return `${kind}${target} ${details.status ?? "unknown"} | memory=${memory.decision}${bridge} candidates=${memory.relationCandidateCount} active=${memory.activeCandidateCount}${rejected}${model}`.trim();
}

function summarizeMemoryRecallForProductLog(memoryRecall = null) {
  const bridges = Array.isArray(memoryRecall?.bridges) ? memoryRecall.bridges : [];
  const preRecall = memoryRecall?.preRecall ?? {};
  const bridgeNames = bridges.map((bridge) => bridge.relatedConcept).filter(Boolean);
  const relationCandidateCount = Number(preRecall.relationCandidateCount ?? 0);
  const activeCandidateCount = Number(preRecall.activeCandidateCount ?? 0);
  const rejectedCandidateCount = Number(preRecall.rejectedCandidateCount ?? 0);
  const bridgeCount = Number(memoryRecall?.bridgeCount ?? bridges.length);
  const rejectReasons = Array.isArray(preRecall.gateRejectReasons) ? preRecall.gateRejectReasons.slice(0, 8) : [];
  let decision = "memory_not_used";
  if (bridgeCount > 0) decision = "bridge_used";
  else if (preRecall.reason) decision = preRecall.reason;
  else if (relationCandidateCount > 0 && activeCandidateCount === 0) decision = "all_candidates_rejected";
  else if (relationCandidateCount > 0) decision = "no_bridge_selected";
  else if (Number(preRecall.candidateBlockCount ?? 0) > 0) decision = "no_relation_candidates";
  return {
    decision,
    bridgeCount,
    bridgeNames,
    candidateBlockCount: Number(preRecall.candidateBlockCount ?? 0),
    relationCandidateCount,
    activeCandidateCount,
    rejectedCandidateCount,
    rejectReasons,
    rejectReasonText: preRecall.gateRejectReasonText ?? rejectReasons.join(",")
  };
}

function sanitizeMemoryRecallForLog(memoryRecall = null) {
  if (!memoryRecall || typeof memoryRecall !== "object") return null;
  const bridges = Array.isArray(memoryRecall.bridges) ? memoryRecall.bridges : [];
  if (bridges.length === 0 && !memoryRecall.preRecall) return null;
  return {
    status: memoryRecall.status ?? null,
    bridgeCount: Number(memoryRecall.bridgeCount ?? bridges.length),
    bridges: bridges.slice(0, 5).map((bridge) => ({
      relatedConcept: clampLogText(bridge.relatedConcept ?? "", 120),
      relationType: bridge.relationType ?? null,
      direction: bridge.direction ?? null,
      confidence: bridge.confidence ?? null,
      sourceRole: bridge.sourceRole ?? null,
      caution: bridge.caution ?? null
    })),
    preRecall: memoryRecall.preRecall ? {
      status: memoryRecall.preRecall.status ?? null,
      reason: memoryRecall.preRecall.reason ?? null,
      candidateBlockCount: Number(memoryRecall.preRecall.candidateBlockCount ?? 0),
      relationCandidateCount: Number(memoryRecall.preRecall.relationCandidateCount ?? 0),
      activeCandidateCount: Number(memoryRecall.preRecall.activeCandidateCount ?? 0),
      overlayEligibleCandidateCount: Number(memoryRecall.preRecall.overlayEligibleCandidateCount ?? 0),
      rejectedCandidateCount: Number(memoryRecall.preRecall.rejectedCandidateCount ?? 0),
      gateRejectReasons: Array.isArray(memoryRecall.preRecall.gateRejectReasons)
        ? memoryRecall.preRecall.gateRejectReasons.slice(0, 8).map((reason) => clampLogText(reason, 80))
        : [],
      gateRejectReasonText: clampLogText(memoryRecall.preRecall.gateRejectReasonText ?? "", 240),
      bridgeCount: Number(memoryRecall.preRecall.bridgeCount ?? 0)
    } : null,
    policy: memoryRecall.policy ? {
      relationDepth: memoryRecall.policy.relationDepth ?? null,
      maxBridgeCount: memoryRecall.policy.maxBridgeCount ?? null,
      memorySourceRole: memoryRecall.policy.memorySourceRole ?? null,
      caution: memoryRecall.policy.caution ?? null
    } : null
  };
}

function parseJsonForLog(value = "") {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getPathname(value = "") {
  try {
    return new URL(String(value)).pathname.replace(/\/+$/, "") || "/";
  } catch {
    return "";
  }
}

function clampLogText(value = "", limit = 500) {
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}...` : text;
}

function redactUrlForLog(value = "") {
  try {
    const parsed = new URL(String(value));
    for (const key of parsed.searchParams.keys()) {
      if (/token|secret|key|authorization/i.test(key)) {
        parsed.searchParams.set(key, "<redacted>");
      }
    }
    return `${parsed.pathname}${parsed.search}`.replaceAll("%3Credacted%3E", "<redacted>");
  } catch {
    return String(value).replace(/([?&][^=]*(?:token|secret|key|authorization)[^=]*=)[^&]*/gi, "$1<redacted>");
  }
}

function withTimeout(promise, timeoutMs, reason) {
  let timer = null;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(reason)), timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
}
