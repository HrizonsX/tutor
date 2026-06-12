// @ts-nocheck
import { DEFAULT_CONFIG, mergeConfig } from "./config.js";
import {
  AgentCapability,
  AgentProtocolVersion,
  AgentRequestGoal,
  AgentResultStatus,
  BackgroundMessageType,
  FactSensitivity,
  MemoryRepositoryMode,
  ProviderKind,
  ProviderRole,
  StreamEventType,
  StreamLane
} from "./contracts.js";
import { createDiagnosticsState } from "./diagnostics.js";
import {
  createProviderRegistry,
  hasCapability
} from "./provider-registry.js";
import { clampText, hashString } from "./privacy.js";

export function createAgentRequest({
  input = {},
  selectedText = "",
  goal = input.explanationGoal ?? AgentRequestGoal.MICRO,
  capabilityKind = goal === AgentRequestGoal.REGENERATE ? AgentCapability.REWRITE : AgentCapability.EXPLAIN,
  providerMode = ProviderKind.OFF,
  providerRole = ProviderRole.EXPLAIN,
  modelName = "",
  config = DEFAULT_CONFIG,
  requestId = null,
  timestamp = Date.now()
} = {}) {
  const target = input.target ?? {};
  const request = {
    schemaVersion: AgentProtocolVersion,
    requestId: requestId ?? `agent_${timestamp}_${hashString(`${target.canonicalName ?? ""}:${goal}:${capabilityKind}`)}`,
    kind: capabilityKind,
    capabilityKind,
    providerMode,
    providerRole,
    goal,
    target: {
      canonicalName: target.canonicalName ?? "",
      observedText: clampText(target.observedText ?? selectedText ?? target.canonicalName ?? "", 120),
      knowledgeType: target.knowledgeType ?? "other",
      factSensitivity: target.factSensitivity ?? FactSensitivity.STABLE
    },
    selectedText: clampText(selectedText || target.observedText || "", 120),
    minimalContext: {
      fragmentId: input.minimalContext?.fragmentId ?? null,
      fragmentType: input.minimalContext?.fragmentType ?? null,
      text: clampText(input.minimalContext?.text ?? "", config.privacy.maxContextChars)
    },
    requestGoal: goal,
    requestedStyle: input.requestedStyle ?? config.composer.defaultStyle,
    previousVersion: sanitizeVersionForAgent(input.previousVersion),
    feedbackEvent: sanitizeFeedbackForAgent(input.feedbackEvent),
    constraints: {
      maxChars: input.constraints?.maxChars ?? config.composer.maxMicroChars,
      avoidNewJargon: input.constraints?.avoidNewJargon !== false,
      composerOwnsInterventionDecision: false,
      memoryStatus: input.memoryStatus ?? "runtime_owned"
    },
    timestamp
  };
  if (modelName) request.modelName = modelName;
  return request;
}

export function createUnavailableAgentResult({
  reason = "provider_unavailable",
  goal = AgentRequestGoal.MICRO,
  capabilityKind = AgentCapability.EXPLAIN,
  providerMode = null,
  providerRole = null,
  modelName = null,
  input = {},
  target = input.target ?? {},
  details = null,
  previousVersion = input.previousVersion ?? null
} = {}) {
  return {
    status: AgentResultStatus.UNAVAILABLE,
    unavailableReason: reason,
    reason,
    details,
    goal,
    capabilityKind,
    providerMode,
    providerRole,
    modelName,
    target: normalizeTarget(target),
    text: "",
    microExplanation: "",
    expandedExplanation: "",
    ambiguity: null,
    rewrite: null,
    versionMetadata: null,
    explanationVersion: null,
    previousVersionId: previousVersion?.id ?? null,
    feedbackEventId: input.feedbackEvent?.id ?? null,
    ownsInterventionDecision: false,
    factSensitivity: {
      level: target?.factSensitivity ?? FactSensitivity.STABLE,
      requiresSource: false
    }
  };
}

export function createInvalidAgentResult({
  reason = "invalid_agent_response",
  goal = AgentRequestGoal.MICRO,
  capabilityKind = AgentCapability.EXPLAIN,
  providerMode = null,
  providerRole = null,
  input = {},
  raw = null
} = {}) {
  return {
    ...createUnavailableAgentResult({
      reason,
      goal,
      capabilityKind,
      providerMode,
      providerRole,
      input,
      details: { rawType: typeof raw }
    }),
    status: AgentResultStatus.INVALID
  };
}

export function validateAgentProtocolResponse(raw, {
  capabilityKind = AgentCapability.EXPLAIN,
  providerMode = null,
  providerRole = null
} = {}) {
  if (!raw || typeof raw !== "object") {
    return {
      status: AgentResultStatus.INVALID,
      reason: "invalid_agent_response",
      capabilityKind,
      providerMode,
      providerRole
    };
  }
  const status = raw.status ?? AgentResultStatus.INVALID;
  if (!Object.values(AgentResultStatus).includes(status)) {
    return {
      status: AgentResultStatus.INVALID,
      reason: "invalid_agent_status",
      capabilityKind,
      providerMode,
      providerRole
    };
  }
  return {
    ...raw,
    status,
    capabilityKind: raw.capabilityKind ?? raw.kind ?? capabilityKind,
    providerMode: raw.providerMode ?? providerMode,
    providerRole: raw.providerRole ?? providerRole
  };
}

export function validateAgentExplanationResult(raw, {
  input = {},
  goal = input.explanationGoal ?? AgentRequestGoal.MICRO,
  capabilityKind = goal === AgentRequestGoal.REGENERATE ? AgentCapability.REWRITE : AgentCapability.EXPLAIN,
  providerMode = null,
  providerRole = ProviderRole.EXPLAIN,
  modelName = "",
  config = DEFAULT_CONFIG,
  now = () => Date.now()
} = {}) {
  const protocol = validateAgentProtocolResponse(raw, { capabilityKind, providerMode, providerRole });
  if (protocol.status === AgentResultStatus.INVALID) {
    const result = createInvalidAgentResult({ reason: protocol.reason, input, goal, capabilityKind, providerMode, providerRole, raw });
    if (protocol.runtimeDecision) result.runtimeDecision = protocol.runtimeDecision;
    return result;
  }

  if (protocol.status === AgentResultStatus.UNAVAILABLE || protocol.status === "unavailable") {
    const result = createUnavailableAgentResult({
      reason: protocol.reason ?? protocol.unavailableReason ?? "provider_unavailable",
      goal,
      capabilityKind: protocol.capabilityKind,
      providerMode: protocol.providerMode,
      providerRole: protocol.providerRole,
      modelName: protocol.modelName ?? modelName,
      input,
      target: protocol.target ?? input.target,
      details: protocol.details ?? null
    });
    if (protocol.runtimeDecision) result.runtimeDecision = protocol.runtimeDecision;
    return result;
  }

  if (protocol.status === AgentResultStatus.AMBIGUOUS || protocol.status === "ambiguous") {
    const result = {
      ...createUnavailableAgentResult({
        reason: protocol.reason ?? "ambiguous_target",
        goal,
        capabilityKind: protocol.capabilityKind,
        providerMode: protocol.providerMode,
        providerRole: protocol.providerRole,
        modelName: protocol.modelName ?? modelName,
        input,
        target: protocol.target ?? input.target
      }),
      status: AgentResultStatus.AMBIGUOUS,
      ambiguity: protocol.ambiguity ?? { candidates: protocol.candidates ?? [] }
    };
    if (protocol.runtimeDecision) result.runtimeDecision = protocol.runtimeDecision;
    return result;
  }

  if (protocol.status !== AgentResultStatus.AVAILABLE) {
    return createInvalidAgentResult({ reason: "missing_available_status", input, goal, capabilityKind, providerMode, providerRole, raw });
  }

  const text = trimMicro(protocol.microExplanation ?? protocol.text ?? protocol.explanation ?? protocol.explanationVersion?.text ?? "", config);
  if (!text) {
    return createInvalidAgentResult({ reason: "missing_explanation_text", input, goal, capabilityKind, providerMode, providerRole, raw });
  }

  const target = normalizeTarget(protocol.target ?? input.target);
  const style = protocol.style ?? protocol.versionMetadata?.style ?? input.requestedStyle ?? config.composer.defaultStyle;
  const timestamp = protocol.versionMetadata?.timestamp ?? protocol.explanationVersion?.timestamp ?? now();
  const id = protocol.versionMetadata?.id ?? protocol.explanationVersion?.id ?? `ver_${timestamp}_${hashString(text)}`;
  const factSensitivity = normalizeFactSensitivity(protocol.factSensitivity, target);
  const versionMetadata = {
    id,
    target: target.canonicalName,
    style,
    timestamp,
    source: "external_agent",
    provider: protocol.versionMetadata?.provider ?? protocol.provider ?? protocol.providerMode ?? null,
    model: protocol.versionMetadata?.model ?? protocol.model ?? protocol.modelName ?? modelName ?? null,
    schema: protocol.versionMetadata?.schema ?? null,
    structuredOutputMode: protocol.versionMetadata?.structuredOutputMode ?? null,
    previousVersionId: protocol.versionMetadata?.previousVersionId ?? protocol.previousVersionId ?? input.previousVersion?.id ?? null,
    feedbackEventId: protocol.versionMetadata?.feedbackEventId ?? protocol.feedbackEventId ?? input.feedbackEvent?.id ?? null
  };

  return {
    status: AgentResultStatus.AVAILABLE,
    id,
    goal,
    capabilityKind: protocol.capabilityKind,
    providerMode: protocol.providerMode,
    providerRole: protocol.providerRole,
    modelName: protocol.modelName ?? modelName ?? null,
    target: target.canonicalName,
    targetObject: target,
    explanation: protocol.explanation ?? text,
    summary: protocol.summary ?? "",
    confidence: protocol.confidence ?? null,
    terms: Array.isArray(protocol.terms) ? protocol.terms : [],
    actions: Array.isArray(protocol.actions) ? protocol.actions : [],
    text,
    microExplanation: text,
    expandedExplanation: protocol.expandedExplanation ? trimMicro(protocol.expandedExplanation, config) : "",
    style,
    input,
    ambiguity: protocol.ambiguity ?? null,
    rewrite: protocol.rewrite ?? null,
    versionMetadata,
    explanationVersion: {
      ...versionMetadata,
      text,
      summary: protocol.summary ?? "",
      confidence: protocol.confidence ?? null,
      terms: Array.isArray(protocol.terms) ? protocol.terms : [],
      actions: Array.isArray(protocol.actions) ? protocol.actions : [],
      factSensitivity: factSensitivity.level
    },
    ownsInterventionDecision: false,
    factSensitivity: factSensitivity.level,
    factSensitivityMetadata: factSensitivity,
    previousVersionId: versionMetadata.previousVersionId,
    feedbackEventId: versionMetadata.feedbackEventId,
    runtimeDecision: protocol.runtimeDecision ?? null
  };
}

export function createBackgroundAgentClient(runtime = globalThis.chrome?.runtime) {
  return {
    async composeShortExplanation(input) {
      return sendRuntimeMessage(runtime, {
        type: BackgroundMessageType.EXPLAIN_KNOWLEDGE,
        payload: { input, goal: AgentRequestGoal.MICRO }
      });
    },
    async regenerateExplanation(input) {
      return sendRuntimeMessage(runtime, {
        type: BackgroundMessageType.EXPLAIN_KNOWLEDGE,
        payload: { input, goal: AgentRequestGoal.REGENERATE }
      });
    },
    async createEmbedding(payload) {
      return sendRuntimeMessage(runtime, {
        type: BackgroundMessageType.CREATE_EMBEDDING,
        payload
      });
    },
    async refreshProviderHealth(payload = {}) {
      return sendRuntimeMessage(runtime, {
        type: BackgroundMessageType.GET_PROVIDER_HEALTH,
        payload
      });
    },
    async getDiagnostics() {
      return sendRuntimeMessage(runtime, {
        type: BackgroundMessageType.GET_DIAGNOSTICS,
        payload: {}
      });
    },
    async getRuntimeConfig() {
      return sendRuntimeMessage(runtime, {
        type: BackgroundMessageType.GET_RUNTIME_CONFIG,
        payload: {}
      });
    },
    async updateRuntimeConfig(config) {
      return sendRuntimeMessage(runtime, {
        type: BackgroundMessageType.UPDATE_RUNTIME_CONFIG,
        payload: { config }
      });
    },
    async updateBrowserConfig(config) {
      return sendRuntimeMessage(runtime, {
        type: BackgroundMessageType.UPDATE_BROWSER_CONFIG,
        payload: { config }
      });
    },
    async writeMemoryEvent(payload = {}) {
      return sendRuntimeMessage(runtime, {
        type: BackgroundMessageType.WRITE_MEMORY_EVENT,
        payload
      });
    },
    async queryMemory(payload = {}) {
      return sendRuntimeMessage(runtime, {
        type: BackgroundMessageType.QUERY_MEMORY,
        payload
      });
    },
    async streamExplanation(input, { onEvent = () => {}, signal = null } = {}) {
      if (!runtime?.connect) {
        return createUnavailableAgentResult({ reason: "runtime_stream_unavailable", input });
      }
      let port = null;
      try {
        port = runtime.connect({ name: BackgroundMessageType.EXPLAIN_KNOWLEDGE_STREAM });
      } catch (error) {
        return createUnavailableAgentResult({
          reason: "runtime_stream_connect_failed",
          input,
          details: { message: error?.message ?? String(error) }
        });
      }
      if (!port) {
        return createUnavailableAgentResult({
          reason: "runtime_stream_connect_failed",
          input,
          details: { message: "runtime.connect returned no port" }
        });
      }
      return new Promise((resolve) => {
        let lastResult = null;
        let settled = false;
        const finish = (result) => {
          if (settled) return;
          settled = true;
          resolve(result ?? lastResult ?? { status: AgentResultStatus.AVAILABLE });
        };
        try {
          port.onMessage?.addListener?.((event) => {
            onEvent(event);
            if (event?.type === StreamEventType.LANE_FINAL && event.result) {
              lastResult = event.result;
            }
            if (event?.type === StreamEventType.SESSION_DONE || event?.type === StreamEventType.SESSION_CANCELLED) {
              finish(lastResult);
            }
          });
          port.onDisconnect?.addListener?.(() => finish(lastResult ?? createUnavailableAgentResult({ reason: "runtime_stream_disconnected", input })));
          if (signal) {
            signal.addEventListener?.("abort", () => {
              try {
                port.postMessage?.({ type: "cancel" });
                port.disconnect?.();
              } catch {
                finish(createUnavailableAgentResult({ reason: "runtime_stream_cancelled", input }));
              }
            }, { once: true });
          }
          port.postMessage?.({ input, goal: AgentRequestGoal.MICRO });
        } catch (error) {
          finish(createUnavailableAgentResult({
            reason: "runtime_stream_setup_failed",
            input,
            details: { message: error?.message ?? String(error) }
          }));
        }
      });
    }
  };
}

export function createBackgroundService({
  config = DEFAULT_CONFIG,
  providerClient = null,
  embeddingClient = null,
  providerRegistry = null,
  diagnostics = createDiagnosticsState(),
  fetchImpl = globalThis.fetch,
  chromeApi = globalThis.chrome,
  logger = createDefaultBackgroundLogger(chromeApi),
  now = () => Date.now(),
  cache = new Map(),
  memoryEventBatchDelayMs = 75,
  memoryEventBatchMaxSize = 20,
  memoryEventRetryDelayMs = 5000,
  configHydration = null
} = {}) {
  const requestTimes = [];
  const memoryEventBatch = [];
  let memoryEventBatchTimer = null;
  // One fire-and-forget retry pass for failed batch flushes. Entries carry
  // only {event, repository, attempts}: the original promises were already
  // settled with UNAVAILABLE and must never be touched again.
  const memoryEventRetryQueue = [];
  const memoryEventRetryQueueLimit = 200;
  let memoryEventRetryTimer = null;
  let runtimeConfig = config;
  let registry = providerRegistry ?? createProviderRegistry({
    config: runtimeConfig,
    chromeApi,
    fetchImpl,
    providerClient,
    embeddingClient,
    now
  });
  diagnostics.setProviderConfigState?.(registry.getDiagnosticsState?.() ?? {});
  diagnostics.setProviderMode(registry.mode, ProviderRole.EXPLAIN);
  diagnostics.setProviderMode(registry.getMode?.(ProviderRole.EMBEDDING), ProviderRole.EMBEDDING);
  diagnostics.setPairingStatus({
    required: registry.usesLocalGateway?.() ?? false,
    configured: Boolean(runtimeConfig.localGateway?.pairingToken)
  });
  diagnostics.setMemoryRepositoryStatus({
    mode: MemoryRepositoryMode.LOCAL_GATEWAY,
    status: "unknown",
    shared: true
  });

  async function handleMessage(message = {}) {
    // Hydration gate: a restarted MV3 worker must not answer with default
    // config while the persisted browser config is still loading.
    if (configHydration) {
      await configHydration;
      configHydration = null;
    }
    if (message.type === BackgroundMessageType.EXPLAIN_KNOWLEDGE) {
      return explainKnowledge(message.payload ?? {});
    }
    if (message.type === BackgroundMessageType.CREATE_EMBEDDING) {
      return createEmbedding(message.payload ?? {});
    }
    if (message.type === BackgroundMessageType.GET_PROVIDER_HEALTH) {
      return refreshProviderHealth(message.payload ?? {});
    }
    if (message.type === BackgroundMessageType.GET_DIAGNOSTICS) {
      return diagnostics.snapshot();
    }
    if (message.type === BackgroundMessageType.GET_RUNTIME_CONFIG) {
      return getRuntimeConfig();
    }
    if (message.type === BackgroundMessageType.UPDATE_RUNTIME_CONFIG) {
      return updateRuntimeConfig(message.payload ?? {});
    }
    if (message.type === BackgroundMessageType.UPDATE_BROWSER_CONFIG) {
      return updateBrowserConfig(message.payload ?? {});
    }
    if (message.type === BackgroundMessageType.WRITE_MEMORY_EVENT) {
      return writeMemoryEvent(message.payload ?? {});
    }
    if (message.type === BackgroundMessageType.QUERY_MEMORY) {
      return queryMemory(message.payload ?? {});
    }
    return { status: AgentResultStatus.UNAVAILABLE, reason: "unknown_message_type" };
  }

  function handleStreamPort(port = {}) {
    if (!port?.onMessage?.addListener || typeof port.postMessage !== "function") return false;
    let abortController = null;
    port.onMessage.addListener((message = {}) => {
      if (message?.type === "cancel" || message?.cancel === true) {
        abortController?.abort();
        return Promise.resolve({ status: AgentResultStatus.UNAVAILABLE, reason: "content_cancelled" });
      }
      abortController?.abort();
      abortController = new AbortController();
      const payload = message.payload ?? message;
      return explainKnowledgeStream({
        input: payload.input ?? {},
        selectedText: payload.selectedText ?? "",
        goal: payload.goal ?? AgentRequestGoal.MICRO,
        onEvent: (event) => {
          try {
            port.postMessage(event);
          } catch {
            abortController?.abort();
          }
        },
        signal: abortController.signal
      });
    });
    port.onDisconnect?.addListener?.(() => {
      abortController?.abort();
    });
    return true;
  }

  async function explainKnowledge({ input = {}, selectedText = "", goal = AgentRequestGoal.MICRO } = {}) {
    const capabilityKind = goal === AgentRequestGoal.REGENERATE ? AgentCapability.REWRITE : AgentCapability.EXPLAIN;
    const provider = registry.resolveProvider(capabilityKind, { role: ProviderRole.EXPLAIN });
    if (provider.unavailableReason) {
      const result = createUnavailableAgentResult({
        reason: provider.unavailableReason,
        goal,
        capabilityKind,
        providerMode: provider.mode,
        providerRole: provider.role,
        modelName: provider.modelName,
        input
      });
      diagnostics.recordAgentResult(result);
      return result;
    }

    const request = createAgentRequest({
      input,
      selectedText,
      goal,
      capabilityKind,
      providerMode: provider.mode,
      providerRole: provider.role,
      modelName: provider.modelName,
      config: runtimeConfig,
      timestamp: now()
    });
    const cacheKey = hashString(JSON.stringify({
      goal: request.goal,
      capabilityKind: request.capabilityKind,
      providerMode: request.providerMode,
      providerRole: request.providerRole,
      modelName: request.modelName ?? "",
      target: request.target,
      context: request.minimalContext,
      style: request.requestedStyle
    }));
    const cached = cache.get(cacheKey);
    const canUseBrowserCache = !(registry.usesLocalGateway?.() ?? false);
    if (canUseBrowserCache && cached && now() - cached.timestamp <= runtimeConfig.agent.cacheTtlMs) {
      diagnostics.recordAgentResult(cached.result);
      return cached.result;
    }

    if (!consumeRateLimit(requestTimes, runtimeConfig.agent.rateLimit, now())) {
      const result = createUnavailableAgentResult({
        reason: "agent_rate_limited",
        goal,
        capabilityKind,
        providerMode: provider.mode,
        providerRole: provider.role,
        modelName: provider.modelName,
        input
      });
      diagnostics.recordAgentResult(result);
      return result;
    }

    try {
      const raw = await withTimeout(
        callAgentProvider({ request, provider, registry }),
        provider.timeoutMs ?? DEFAULT_CONFIG.localGateway.timeoutMs,
        "agent_timeout"
      );
      const result = validateAgentExplanationResult(raw, {
        input,
        goal,
        capabilityKind,
        providerMode: provider.mode,
        providerRole: provider.role,
        modelName: provider.modelName,
        config: runtimeConfig,
        now
      });
      if (canUseBrowserCache && result.status === AgentResultStatus.AVAILABLE) {
        cache.set(cacheKey, { timestamp: now(), result });
      }
      diagnostics.recordAgentResult(result);
      return result;
    } catch (error) {
      const result = createUnavailableAgentResult({
        reason: normalizeRequestError(error, "agent_timeout", "agent_request_failed"),
        goal,
        capabilityKind,
        providerMode: provider.mode,
        providerRole: provider.role,
        modelName: provider.modelName,
        input,
        details: { message: error?.message ?? String(error) }
      });
      diagnostics.recordAgentResult(result);
      return result;
    }
  }

  async function explainKnowledgeStream({
    input = {},
    selectedText = "",
    goal = AgentRequestGoal.MICRO,
    onEvent = () => {},
    signal = null
  } = {}) {
    const capabilityKind = AgentCapability.EXPLAIN;
    const provider = registry.resolveProvider(capabilityKind, { role: ProviderRole.EXPLAIN });
    if (provider.unavailableReason) {
      const result = createUnavailableAgentResult({
        reason: provider.unavailableReason,
        goal,
        capabilityKind,
        providerMode: provider.mode,
        providerRole: provider.role,
        modelName: provider.modelName,
        input
      });
      emitFallbackStreamEvents(result, {
        associationReason: provider.unavailableReason,
        input,
        onEvent,
        now
      });
      diagnostics.recordAgentResult(result);
      return result;
    }

    const request = createAgentRequest({
      input,
      selectedText,
      goal,
      capabilityKind,
      providerMode: provider.mode,
      providerRole: provider.role,
      modelName: provider.modelName,
      config: runtimeConfig,
      timestamp: now()
    });

    if (!consumeRateLimit(requestTimes, runtimeConfig.agent.rateLimit, now())) {
      const result = createUnavailableAgentResult({
        reason: "agent_rate_limited",
        goal,
        capabilityKind,
        providerMode: provider.mode,
        providerRole: provider.role,
        modelName: provider.modelName,
        input
      });
      emitFallbackStreamEvents(result, {
        associationReason: "agent_rate_limited",
        input,
        onEvent,
        now
      });
      diagnostics.recordAgentResult(result);
      return result;
    }

    const health = await registry.refreshHealth({ force: false, role: provider.role });
    diagnostics.setProviderHealth(health);
    diagnostics.setPairingStatus({
      required: registry.usesLocalGateway?.() ?? false,
      configured: Boolean(runtimeConfig.localGateway?.pairingToken),
      rejected: health.reason === "local_gateway_pairing_rejected",
      reason: health.reason ?? null
    });

    if (health.status !== AgentResultStatus.AVAILABLE || !hasCapability(health, AgentCapability.STREAMING_EXPLANATION)) {
      const fallback = await explainKnowledge({ input, selectedText, goal });
      emitFallbackStreamEvents(fallback, {
        associationReason: "streaming_capability_unavailable",
        input,
        onEvent,
        now
      });
      return fallback;
    }

    let directLaneResult = null;
    let lastLaneResult = null;
    const result = await registry.getLocalGatewayClient().streamExplanation(request, {
      signal,
      onEvent: (event) => {
        logBackgroundStreamEvent(logger, event);
        diagnostics.recordStreamEvent?.(event);
        if (event?.type === StreamEventType.LANE_FINAL && event.result) {
          if (event.lane === StreamLane.DIRECT) directLaneResult = event.result;
          lastLaneResult = event.result;
          diagnostics.recordAgentResult(event.result);
        }
        onEvent(event);
      }
    });
    if (result?.status !== AgentResultStatus.AVAILABLE) {
      diagnostics.recordAgentResult(result);
      return result;
    }
    return directLaneResult?.status === AgentResultStatus.AVAILABLE
      ? directLaneResult
      : lastLaneResult ?? result;
  }

  async function createEmbedding({ text = "", summary = {}, metadata = {} } = {}) {
    const provider = registry.resolveProvider(AgentCapability.EMBEDDING, { role: ProviderRole.EMBEDDING });
    if (provider.unavailableReason) {
      const result = {
        status: AgentResultStatus.UNAVAILABLE,
        reason: provider.unavailableReason,
        capabilityKind: AgentCapability.EMBEDDING,
        providerRole: provider.role,
        providerMode: provider.mode,
        modelName: provider.modelName,
        vector: null
      };
      diagnostics.recordAgentResult(result);
      return result;
    }

    try {
      const safeText = clampText(text || summary.text || "", runtimeConfig.privacy.maxContextChars);
      const raw = await withTimeout(
        callEmbeddingProvider({ text: safeText, summary, metadata, provider, registry }),
        provider.timeoutMs ?? DEFAULT_CONFIG.localGateway.timeoutMs,
        "embedding_timeout"
      );
      if (raw?.status && raw.status !== AgentResultStatus.AVAILABLE) {
        const result = {
          status: raw.status,
          reason: raw.reason ?? raw.unavailableReason ?? "embedding_request_failed",
          capabilityKind: AgentCapability.EMBEDDING,
          providerRole: provider.role,
          providerMode: provider.mode,
          modelName: raw.modelName ?? provider.modelName,
          vector: null
        };
        diagnostics.recordAgentResult(result);
        return result;
      }
      if (!Array.isArray(raw?.vector) || raw.vector.some((value) => typeof value !== "number")) {
        const result = {
          status: AgentResultStatus.INVALID,
          reason: "invalid_embedding_response",
          capabilityKind: AgentCapability.EMBEDDING,
          providerRole: provider.role,
          providerMode: provider.mode,
          modelName: provider.modelName,
          vector: null
        };
        diagnostics.recordAgentResult(result);
        return result;
      }
      const result = {
        status: AgentResultStatus.AVAILABLE,
        capabilityKind: AgentCapability.EMBEDDING,
        providerRole: provider.role,
        providerMode: provider.mode,
        vector: raw.vector,
        model: raw.model ?? provider.modelName ?? null,
        modelName: provider.modelName ?? null,
        metadata
      };
      diagnostics.recordAgentResult(result);
      return result;
    } catch (error) {
      const result = {
        status: AgentResultStatus.UNAVAILABLE,
        reason: normalizeRequestError(error, "embedding_timeout", "embedding_request_failed"),
        capabilityKind: AgentCapability.EMBEDDING,
        providerRole: provider.role,
        providerMode: provider.mode,
        modelName: provider.modelName,
        vector: null
      };
      diagnostics.recordAgentResult(result);
      return result;
    }
  }

  async function refreshProviderHealth({ force = false, role = ProviderRole.EXPLAIN } = {}) {
    const health = await registry.refreshHealth({ force, role });
    diagnostics.setProviderHealth(health);
    diagnostics.setPairingStatus({
      required: registry.usesLocalGateway?.() ?? false,
      configured: Boolean(runtimeConfig.localGateway?.pairingToken),
      rejected: health.reason === "local_gateway_pairing_rejected",
      reason: health.reason ?? null
    });
    return health;
  }

  async function writeMemoryEvent({ event = null, repository = "learning" } = {}) {
    if (!event) {
      return { status: AgentResultStatus.INVALID, reason: "missing_memory_event", capabilityKind: AgentCapability.MEMORY_EVENT_WRITE };
    }
    return enqueueMemoryEvent({ event, repository });
  }

  function enqueueMemoryEvent(entry) {
    return new Promise((resolve) => {
      memoryEventBatch.push({ ...entry, resolve });
      if (memoryEventBatch.length >= memoryEventBatchMaxSize) {
        void flushMemoryEventBatch();
      } else {
        scheduleMemoryEventBatch();
      }
    });
  }

  function scheduleMemoryEventBatch() {
    if (memoryEventBatchTimer) return;
    memoryEventBatchTimer = setTimeout(() => {
      memoryEventBatchTimer = null;
      void flushMemoryEventBatch();
    }, Math.max(0, Number(memoryEventBatchDelayMs ?? 0)));
  }

  async function flushMemoryEventBatch() {
    if (memoryEventBatchTimer) {
      clearTimeout(memoryEventBatchTimer);
      memoryEventBatchTimer = null;
    }
    const batch = memoryEventBatch.splice(0, memoryEventBatch.length);
    if (batch.length === 0) return;
    const payload = batch.length === 1
      ? { event: batch[0].event, repository: batch[0].repository }
      : {
          events: batch.map((entry) => ({
            event: entry.event,
            repository: entry.repository
          }))
        };
    let result;
    try {
      result = await registry.getLocalGatewayClient().writeMemoryEvent(payload);
    } catch (error) {
      result = {
        status: AgentResultStatus.UNAVAILABLE,
        reason: "memory_event_write_failed",
        capabilityKind: AgentCapability.MEMORY_EVENT_WRITE,
        details: { message: error?.message ?? String(error) }
      };
    }
    diagnostics.setMemoryRepositoryStatus({
      mode: MemoryRepositoryMode.LOCAL_GATEWAY,
      status: result.status,
      reason: result.reason,
      shared: true,
      repositoryStatus: result.repositoryStatus,
      memoryRepository: result.memoryRepository
    });
    for (const entry of batch) entry.resolve(result);
    if (result.status === AgentResultStatus.UNAVAILABLE) {
      for (const entry of batch) {
        if ((entry.attempts ?? 0) >= 1) continue;
        if (memoryEventRetryQueue.length >= memoryEventRetryQueueLimit) break;
        memoryEventRetryQueue.push({
          event: entry.event,
          repository: entry.repository,
          attempts: (entry.attempts ?? 0) + 1
        });
      }
      scheduleMemoryEventRetry();
    }
  }

  function scheduleMemoryEventRetry() {
    if (memoryEventRetryTimer || memoryEventRetryQueue.length === 0) return;
    memoryEventRetryTimer = setTimeout(() => {
      memoryEventRetryTimer = null;
      const retries = memoryEventRetryQueue.splice(0, memoryEventRetryQueue.length);
      for (const entry of retries) {
        memoryEventBatch.push({ ...entry, resolve: () => {} });
      }
      void flushMemoryEventBatch();
    }, Math.max(0, Number(memoryEventRetryDelayMs ?? 0)));
  }

  async function queryMemory(query = {}) {
    const result = await registry.getLocalGatewayClient().queryMemory(query);
    diagnostics.setMemoryRepositoryStatus({
      mode: MemoryRepositoryMode.LOCAL_GATEWAY,
      status: result.status,
      reason: result.reason,
      shared: true,
      repositoryStatus: result.repositoryStatus,
      memoryRepository: result.memoryRepository,
      freshness: result.memoryPacket?.memoryFreshness
    });
    return result;
  }

  async function getRuntimeConfig() {
    const result = await registry.getLocalGatewayClient().readRuntimeConfig();
    if (result?.status === AgentResultStatus.AVAILABLE) {
      diagnostics.setRuntimeConfigState?.(result);
      diagnostics.setProviderConfigState?.({
        providerRoles: result.config ? {
          [ProviderRole.EXPLAIN]: result.config.explain,
          [ProviderRole.EMBEDDING]: result.config.embedding,
          [ProviderRole.RELATION_PROPOSER]: result.config.relationProposer
        } : {}
      });
    }
    return result;
  }

  async function updateRuntimeConfig(payload = {}) {
    const patch = Object.hasOwn(payload, "config") ? (payload.config ?? {}) : payload;
    const result = await registry.getLocalGatewayClient().updateRuntimeConfig(patch);
    if (result?.status === AgentResultStatus.AVAILABLE) {
      registry.invalidateHealthCache?.();
      diagnostics.setRuntimeConfigState?.(result);
      diagnostics.setProviderConfigState?.({
        providerRoles: result.config ? {
          [ProviderRole.EXPLAIN]: result.config.explain,
          [ProviderRole.EMBEDDING]: result.config.embedding,
          [ProviderRole.RELATION_PROPOSER]: result.config.relationProposer
        } : {}
      });
    }
    return result;
  }

  async function updateBrowserConfig(payload = {}) {
    const patch = Object.hasOwn(payload, "config") ? (payload.config ?? {}) : payload;
    runtimeConfig = mergeConfig(runtimeConfig, patch);
    if (!providerRegistry) {
      registry = createProviderRegistry({
        config: runtimeConfig,
        chromeApi,
        fetchImpl,
        providerClient,
        embeddingClient,
        now,
        healthCache: new Map()
      });
    } else {
      registry.invalidateHealthCache?.();
    }
    diagnostics.setProviderConfigState?.(registry.getDiagnosticsState?.() ?? {});
    diagnostics.setPairingStatus({
      required: registry.usesLocalGateway?.() ?? false,
      configured: Boolean(runtimeConfig.localGateway?.pairingToken)
    });
    return {
      status: AgentResultStatus.AVAILABLE,
      config: {
        featureEnabled: runtimeConfig.featureEnabled,
        localGateway: {
          endpoint: runtimeConfig.localGateway?.endpoint ?? "",
          pairingTokenPresent: Boolean(runtimeConfig.localGateway?.pairingToken),
          timeoutMs: runtimeConfig.localGateway?.timeoutMs ?? null
        }
      }
    };
  }

  return {
    handleMessage,
    handleStreamPort,
    explainKnowledge,
    explainKnowledgeStream,
    createEmbedding,
    refreshProviderHealth,
    getRuntimeConfig,
    updateRuntimeConfig,
    updateBrowserConfig,
    writeMemoryEvent,
    queryMemory,
    flushMemoryEvents: flushMemoryEventBatch,
    getDiagnostics: diagnostics.snapshot
  };
}

async function sendRuntimeMessage(runtime, message) {
  if (!runtime?.sendMessage) {
    return createUnavailableAgentResult({ reason: "runtime_unavailable", input: message.payload?.input ?? {} });
  }
  return new Promise((resolve) => {
    try {
      runtime.sendMessage(message, (response) => {
        resolve(response ?? createUnavailableAgentResult({ reason: "empty_background_response", input: message.payload?.input ?? {} }));
      });
    } catch (error) {
      resolve(createUnavailableAgentResult({
        reason: "runtime_message_failed",
        input: message.payload?.input ?? {},
        details: { message: error?.message ?? String(error) }
      }));
    }
  });
}

function emitFallbackStreamEvents(result, {
  associationReason = "streaming_capability_unavailable",
  input = {},
  onEvent = () => {},
  now = () => Date.now()
} = {}) {
  const timestamp = now();
  const sessionId = `fallback_${timestamp}_${hashString(input.target?.canonicalName ?? input.target?.observedText ?? "")}`;
  let sequence = 0;
  const emit = (event) => onEvent({
    sessionId,
    sequence: sequence++,
    timestamp: now(),
    ...event
  });
  emit({
    type: StreamEventType.SESSION_START,
    target: normalizeTarget(result.targetObject ?? input.target ?? {})
  });
  emit({ type: StreamEventType.LANE_START, lane: StreamLane.DIRECT });
  emit({
    type: StreamEventType.LANE_FINAL,
    lane: StreamLane.DIRECT,
    result
  });
  emit({ type: StreamEventType.LANE_START, lane: StreamLane.ASSOCIATION });
  emit({
    type: StreamEventType.LANE_FINAL,
    lane: StreamLane.ASSOCIATION,
    result: createUnavailableAgentResult({
      reason: associationReason,
      goal: AgentRequestGoal.ASSOCIATION,
      capabilityKind: AgentCapability.EXPLAIN,
      providerMode: result.providerMode,
      providerRole: result.providerRole,
      modelName: result.modelName,
      input,
      target: result.targetObject ?? input.target
    })
  });
  emit({
    type: StreamEventType.SESSION_DONE,
    status: result.status,
    reason: result.reason ?? result.unavailableReason ?? null
  });
}

function createDefaultBackgroundLogger(chromeApi) {
  if (!chromeApi?.runtime || !globalThis.console) return null;
  return globalThis.console;
}

function logBackgroundStreamEvent(logger, event = {}) {
  if (!logger) return;
  const log = event.type === StreamEventType.LANE_FINAL && event.result?.status !== AgentResultStatus.AVAILABLE
    ? logger.warn ?? logger.log
    : logger.info ?? logger.log;
  if (typeof log !== "function") return;
  if (event.type === StreamEventType.SESSION_START) {
    log.call(logger, "[BCO][background-service] stream_session_start", {
      sessionId: event.sessionId ?? null,
      target: event.target?.canonicalName ?? event.target?.observedText ?? null,
      sequence: event.sequence ?? null
    });
  } else if (event.type === StreamEventType.LANE_FINAL || event.type === StreamEventType.LANE_ERROR) {
    log.call(logger, "[BCO][background-service] stream_lane_final", {
      sessionId: event.sessionId ?? null,
      lane: event.lane ?? null,
      status: event.result?.status ?? null,
      reason: event.result?.reason ?? event.result?.unavailableReason ?? null,
      target: event.result?.target?.canonicalName ?? event.result?.target?.observedText ?? null,
      sequence: event.sequence ?? null
    });
  } else if (event.type === StreamEventType.SESSION_CANCELLED) {
    log.call(logger, "[BCO][background-service] stream_cancelled", {
      sessionId: event.sessionId ?? null,
      sequence: event.sequence ?? null
    });
  }
}

async function callAgentProvider({ request, provider, registry }) {
  const health = await registry.refreshHealth({ force: false, role: provider.role });
  const neededCapability = request.capabilityKind === AgentCapability.REWRITE ? AgentCapability.REWRITE : AgentCapability.EXPLAIN;
  if (health.status === AgentResultStatus.AVAILABLE && !hasCapability(health, neededCapability)) {
    return createUnavailableAgentResult({
      reason: "provider_capability_unsupported",
      capabilityKind: neededCapability,
      providerMode: provider.mode,
      providerRole: provider.role,
      modelName: provider.modelName,
      input: { target: request.target }
    });
  }
  return request.capabilityKind === AgentCapability.REWRITE
    ? registry.getLocalGatewayClient().rewrite(request)
    : registry.getLocalGatewayClient().explain(request);
}

async function callEmbeddingProvider({ text, summary, metadata, provider, registry }) {
  const health = await registry.refreshHealth({ force: false, role: provider.role });
  if (health.status === AgentResultStatus.AVAILABLE && !hasCapability(health, AgentCapability.EMBEDDING)) {
    return {
      status: AgentResultStatus.UNAVAILABLE,
      reason: "provider_capability_unsupported",
      capabilityKind: AgentCapability.EMBEDDING,
      providerRole: provider.role,
      providerMode: provider.mode,
      modelName: provider.modelName,
      vector: null
    };
  }
  return registry.getLocalGatewayClient().createEmbedding({ text, summary, metadata, modelName: provider.modelName });
}

function sanitizeMemoryPacket(packet = {}, config) {
  return {
    target: packet.target ? normalizeTarget(packet.target) : null,
    priorExplanations: (packet.priorExplanations ?? []).slice(-5).map(sanitizeVersionForAgent),
    feedbackEvents: (packet.feedbackEvents ?? []).slice(-8).map(sanitizeFeedbackForAgent),
    relatedObjects: (packet.relatedObjects ?? []).slice(0, config.knowledge.maxRelatedObjects).map((object) => ({
      canonicalName: clampText(object.canonicalName ?? "", config.privacy.maxStoredAliasChars),
      uncertainty: object.uncertainty ?? null,
      evidenceEventIds: Array.isArray(object.evidenceEventIds) ? object.evidenceEventIds.slice(0, 8) : []
    })),
    profileHints: sanitizeProfileHints(packet.profileHints ?? {}),
    cooldowns: packet.cooldowns ?? {},
    derivedSignals: packet.derivedSignals ?? {},
    uncertainty: packet.uncertainty ?? {},
    repositoryStatus: packet.repositoryStatus ?? packet.status ?? "available",
    memoryFreshness: packet.memoryFreshness ?? null,
    localMemoryRole: packet.localMemoryRole ?? null,
    explanationPreferences: sanitizeExplanationPreferences(packet.explanationPreferences),
    summaryEvidenceEventIds: Array.isArray(packet.summaryEvidenceEventIds) ? packet.summaryEvidenceEventIds.slice(0, 8) : []
  };
}

function sanitizeMemorySummary(summary = {}, config) {
  return {
    priorExplanationCount: Number(summary.priorExplanationCount ?? 0),
    relatedObjects: (summary.relatedObjects ?? []).slice(0, config.knowledge.maxRelatedObjects).map((object) => ({
      canonicalName: clampText(object.canonicalName ?? "", config.privacy.maxStoredAliasChars),
      uncertainty: object.uncertainty ?? null,
      evidenceEventIds: Array.isArray(object.evidenceEventIds) ? object.evidenceEventIds.slice(0, 8) : []
    })),
    sourceEventIds: Array.isArray(summary.sourceEventIds ?? summary.evidenceEventIds) ? (summary.sourceEventIds ?? summary.evidenceEventIds).slice(0, 8) : [],
    derivedSignals: summary.derivedSignals ?? {},
    uncertainty: summary.uncertainty ?? {}
  };
}

function sanitizeProfileHints(hints = {}) {
  return {
    categoryInterest: hints.categoryInterest ?? 0,
    categoryMuted: Boolean(hints.categoryMuted),
    objectMuted: Boolean(hints.objectMuted),
    familiarObject: Boolean(hints.familiarObject),
    difficultObject: Boolean(hints.difficultObject),
    cautionRequired: Boolean(hints.cautionRequired),
    preferredStyle: hints.preferredStyle ?? null,
    uncertainty: hints.uncertainty ?? null
  };
}

function sanitizeExplanationPreferences(preferences = null) {
  if (!preferences) return null;
  return {
    preferredStyle: preferences.preferredStyle ?? null,
    styleCounts: { ...(preferences.styleCounts ?? {}) },
    evidenceEventIds: Array.isArray(preferences.evidenceEventIds) ? preferences.evidenceEventIds.slice(0, 8) : [],
    uncertainty: preferences.uncertainty ?? null
  };
}

function sanitizeVersionForAgent(version = null) {
  if (!version) return null;
  return {
    id: version.id ?? null,
    target: version.target ?? null,
    style: version.style ?? null,
    text: clampText(version.text ?? "", 220),
    timestamp: version.timestamp ?? null,
    source: version.source ?? version.versionMetadata?.source ?? null
  };
}

function sanitizeFeedbackForAgent(event = null) {
  if (!event) return null;
  return {
    id: event.id ?? null,
    type: event.type ?? null,
    canonicalName: event.canonicalName ?? event.concept ?? null,
    requestedStyle: event.requestedStyle ?? null,
    explanationVersionId: event.explanationVersionId ?? null,
    timestamp: event.timestamp ?? null
  };
}

function normalizeTarget(target = {}) {
  return {
    canonicalName: target.canonicalName ?? target.target ?? "",
    observedText: target.observedText ?? target.canonicalName ?? "",
    knowledgeType: target.knowledgeType ?? "other",
    factSensitivity: target.factSensitivity ?? FactSensitivity.STABLE
  };
}

function normalizeFactSensitivity(value, target) {
  if (typeof value === "object" && value) {
    return {
      level: value.level ?? target.factSensitivity ?? FactSensitivity.STABLE,
      requiresSource: Boolean(value.requiresSource),
      reason: value.reason ?? null
    };
  }
  return {
    level: value ?? target.factSensitivity ?? FactSensitivity.STABLE,
    requiresSource: value === FactSensitivity.NEEDS_SOURCE,
    reason: null
  };
}

function trimMicro(text, config) {
  const bounded = clampText(text, config.composer.maxMicroChars);
  const sentences = bounded.match(/[^.!?。！？]+[.!?。！？]?/g) ?? [bounded];
  return clampText(sentences.slice(0, 2).join(" ").trim(), config.composer.maxMicroChars);
}

function consumeRateLimit(requestTimes, rateLimit, timestamp) {
  const windowMs = rateLimit?.windowMs ?? 60 * 1000;
  const maxRequests = rateLimit?.maxRequests ?? 20;
  while (requestTimes.length && timestamp - requestTimes[0] > windowMs) {
    requestTimes.shift();
  }
  if (requestTimes.length >= maxRequests) return false;
  requestTimes.push(timestamp);
  return true;
}

function normalizeRequestError(error, timeoutReason, fallbackReason) {
  const message = error?.message ?? String(error);
  if (message === timeoutReason) return timeoutReason;
  if (/provider_.*model|model_.*unsupported|model_.*invalid/i.test(message)) {
    return message;
  }
  return fallbackReason;
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
