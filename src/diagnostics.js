import { AgentResultStatus, ProviderKind, ProviderRole, StreamEventType, StreamLane } from "./contracts.js";

const EMPTY_HEALTH = Object.freeze({
  status: AgentResultStatus.UNAVAILABLE,
  reason: "provider_health_unknown",
  capabilities: {},
  checkedAt: null
});

export function createDiagnosticsState({ now = () => Date.now() } = {}) {
  const state = {
    providerMode: ProviderKind.OFF,
    providerRoles: {
      [ProviderRole.EXPLAIN]: emptyProviderRoleState(ProviderRole.EXPLAIN),
      [ProviderRole.EMBEDDING]: emptyProviderRoleState(ProviderRole.EMBEDDING),
      [ProviderRole.RELATION_PROPOSER]: emptyProviderRoleState(ProviderRole.RELATION_PROPOSER)
    },
    localGateway: {
      endpoint: "",
      pairingTokenPresent: false,
      timeoutMs: null,
      health: {}
    },
    providerHealth: { ...EMPTY_HEALTH },
    permissionStatus: {},
    pairingStatus: { configured: false },
    runtimeConfig: null,
    memoryRepositoryStatus: { mode: "browser", status: "unknown" },
    lastDecision: null,
    lastRuntimeDecision: null,
    lastAgentResult: null,
    lastStreamingSession: null,
    latestProviderError: null
  };

  return {
    setProviderConfigState(providerState = {}) {
      for (const role of Object.values(ProviderRole)) {
        if (providerState.providerRoles?.[role]) {
          state.providerRoles[role] = sanitizeProviderRoleState(providerState.providerRoles[role]);
        }
      }
      if (providerState.localGateway) {
        state.localGateway = sanitizeLocalGatewayState(providerState.localGateway);
      }
      state.providerMode = state.providerRoles[ProviderRole.EXPLAIN].mode ?? ProviderKind.OFF;
    },
    setProviderMode(mode, role = ProviderRole.EXPLAIN) {
      const providerRole = role === ProviderRole.EMBEDDING ? ProviderRole.EMBEDDING : ProviderRole.EXPLAIN;
      state.providerRoles[providerRole] = {
        ...state.providerRoles[providerRole],
        mode: mode ?? ProviderKind.OFF
      };
      if (providerRole === ProviderRole.EXPLAIN) {
        state.providerMode = mode ?? ProviderKind.OFF;
      }
    },
    setProviderHealth(health = {}) {
      const sanitized = sanitizeHealth({ ...health, checkedAt: health.checkedAt ?? now() });
      state.providerHealth = sanitized;
      for (const runtimeRole of Object.values(ProviderRole)) {
        if (sanitized.providerRoles?.[runtimeRole]) {
          state.providerRoles[runtimeRole] = sanitizeProviderRoleState({
            role: runtimeRole,
            ...sanitized.providerRoles[runtimeRole]
          });
        }
      }
      const role = sanitized.role === ProviderRole.EMBEDDING ? ProviderRole.EMBEDDING : ProviderRole.EXPLAIN;
      state.providerRoles[role] = {
        ...state.providerRoles[role],
        mode: sanitized.mode ?? state.providerRoles[role].mode,
        endpoint: state.providerRoles[role].endpoint || sanitized.endpoint,
        modelName: sanitized.modelName || state.providerRoles[role].modelName,
        health: sanitized
      };
      if (health.runtimeConfig) state.runtimeConfig = sanitizeRuntimeConfigState(health.runtimeConfig);
      if (health.mode) state.providerMode = health.mode;
    },
    setRuntimeConfigState(configState = null) {
      state.runtimeConfig = sanitizeRuntimeConfigState(configState);
    },
    setPermissionStatus(status = {}) {
      state.permissionStatus = { ...status };
    },
    setPairingStatus(status = {}) {
      state.pairingStatus = sanitizePairing(status);
    },
    setMemoryRepositoryStatus(status = {}) {
      state.memoryRepositoryStatus = {
        mode: status.mode ?? state.memoryRepositoryStatus.mode,
        status: status.status ?? state.memoryRepositoryStatus.status,
        reason: status.reason ?? null,
        shared: Boolean(status.shared),
        degraded: Boolean(status.degraded),
        repositoryStatus: status.repositoryStatus ?? null,
        freshness: sanitizeFreshness(status.freshness),
        memoryRepository: sanitizeMemoryRepository(status.memoryRepository),
        updatedAt: status.updatedAt ?? now()
      };
    },
    recordDecision(decision = null) {
      if (!decision) return;
      state.lastDecision = {
        shouldShow: Boolean(decision.shouldShow),
        priority: decision.priority ?? null,
        candidate: decision.candidate?.canonicalName ?? decision.candidate ?? null,
        reasons: Array.isArray(decision.reasons) ? decision.reasons.slice(0, 8) : [],
        suppressionReasons: Array.isArray(decision.suppressions) ? decision.suppressions.slice(0, 8) : [],
        timestamp: now()
      };
    },
    recordAgentResult(result = null, extra = {}) {
      if (!result) return;
      const sanitized = sanitizeAgentResult(result, { ...extra, timestamp: extra.timestamp ?? now() });
      state.lastAgentResult = sanitized;
      if (sanitized.runtimeDecision) {
        state.lastRuntimeDecision = sanitized.runtimeDecision;
      }
      if (sanitized.status !== AgentResultStatus.AVAILABLE) {
        state.latestProviderError = {
          status: sanitized.status,
          reason: sanitized.reason,
          providerRole: sanitized.providerRole,
          providerMode: sanitized.providerMode,
          adapter: sanitized.adapter,
          capabilityKind: sanitized.capabilityKind,
          model: sanitized.model,
          timestamp: sanitized.timestamp
        };
      }
    },
    recordStreamEvent(event = null) {
      if (!event || typeof event !== "object") return;
      state.lastStreamingSession = reduceStreamingSession(state.lastStreamingSession, event, { now });
    },
    snapshot() {
      return {
        providerMode: state.providerMode,
        providerRoles: cloneProviderRoles(state.providerRoles),
        localGateway: { ...state.localGateway, health: { ...state.localGateway.health } },
        providerHealth: {
          ...state.providerHealth,
          capabilities: { ...state.providerHealth.capabilities },
          providerRoles: cloneProviderRoles(state.providerHealth.providerRoles ?? {}),
          memoryRepository: sanitizeMemoryRepository(state.providerHealth.memoryRepository)
        },
        permissionStatus: { ...state.permissionStatus },
        pairingStatus: { ...state.pairingStatus },
        runtimeConfig: state.runtimeConfig ? { ...state.runtimeConfig } : null,
        memoryRepositoryStatus: {
          ...state.memoryRepositoryStatus,
          freshness: sanitizeFreshness(state.memoryRepositoryStatus.freshness),
          memoryRepository: sanitizeMemoryRepository(state.memoryRepositoryStatus.memoryRepository)
        },
        lastDecision: state.lastDecision ? { ...state.lastDecision } : null,
        lastRuntimeDecision: state.lastRuntimeDecision ? { ...state.lastRuntimeDecision } : null,
        lastAgentResult: state.lastAgentResult ? { ...state.lastAgentResult } : null,
        lastStreamingSession: cloneStreamingSession(state.lastStreamingSession),
        latestProviderError: state.latestProviderError ? { ...state.latestProviderError } : null
      };
    }
  };
}

function reduceStreamingSession(previous = null, event = {}, { now }) {
  const session = event.type === StreamEventType.SESSION_START || !previous || previous.sessionId !== event.sessionId
    ? {
        sessionId: event.sessionId ?? null,
        target: event.target?.canonicalName ?? event.target?.observedText ?? null,
        status: "started",
        startedAt: now(),
        updatedAt: now(),
        lastSequence: event.sequence ?? null,
        lanes: {
          [StreamLane.DIRECT]: { status: "pending", reason: null, updatedAt: null },
          [StreamLane.ASSOCIATION]: { status: "pending", reason: null, updatedAt: null }
        },
        recall: {
          bridgeCount: 0,
          relationCandidateCount: 0,
          activeCandidateCount: 0,
          rejectedCandidateCount: 0
        }
      }
    : {
        ...previous,
        lanes: cloneStreamLanes(previous.lanes),
        recall: { ...(previous.recall ?? {}) },
        updatedAt: now(),
        lastSequence: event.sequence ?? previous.lastSequence
      };

  if (event.type === StreamEventType.LANE_START && event.lane) {
    session.lanes[event.lane] = { status: "streaming", reason: null, updatedAt: now() };
  }
  if (event.type === StreamEventType.RECALL_STATUS) {
    const recall = event.memoryRecall ?? {};
    const preRecall = recall.preRecall ?? {};
    session.recall = {
      bridgeCount: Number(recall.bridgeCount ?? event.bridges?.length ?? 0),
      relationCandidateCount: Number(preRecall.relationCandidateCount ?? 0),
      activeCandidateCount: Number(preRecall.activeCandidateCount ?? 0),
      rejectedCandidateCount: Number(preRecall.rejectedCandidateCount ?? 0)
    };
  }
  if ((event.type === StreamEventType.LANE_FINAL || event.type === StreamEventType.LANE_ERROR) && event.lane) {
    session.lanes[event.lane] = {
      status: event.result?.status ?? (event.type === StreamEventType.LANE_ERROR ? AgentResultStatus.UNAVAILABLE : null),
      reason: event.result?.reason ?? event.result?.unavailableReason ?? null,
      updatedAt: now()
    };
  }
  if (event.type === StreamEventType.SESSION_DONE) {
    session.status = AgentResultStatus.AVAILABLE;
    session.completedAt = now();
  }
  if (event.type === StreamEventType.SESSION_CANCELLED) {
    session.status = AgentResultStatus.UNAVAILABLE;
    session.reason = "content_cancelled";
    session.completedAt = now();
  }
  return session;
}

function cloneStreamingSession(session = null) {
  if (!session) return null;
  return {
    ...session,
    lanes: cloneStreamLanes(session.lanes),
    recall: { ...(session.recall ?? {}) }
  };
}

function cloneStreamLanes(lanes = {}) {
  return {
    [StreamLane.DIRECT]: { ...(lanes[StreamLane.DIRECT] ?? {}) },
    [StreamLane.ASSOCIATION]: { ...(lanes[StreamLane.ASSOCIATION] ?? {}) }
  };
}

export function sanitizeAgentResult(result = {}, extra = {}) {
  return {
    status: result.status ?? AgentResultStatus.UNAVAILABLE,
    reason: result.reason ?? result.unavailableReason ?? extra.reason ?? null,
    capabilityKind: result.capabilityKind ?? extra.capabilityKind ?? null,
    providerRole: result.providerRole ?? extra.providerRole ?? null,
    providerMode: result.providerMode ?? extra.providerMode ?? null,
    adapter: result.adapter ?? result.providerAdapter ?? extra.adapter ?? null,
    target: result.targetObject?.canonicalName ?? result.target?.canonicalName ?? result.target ?? null,
    versionId: result.explanationVersion?.id ?? result.versionMetadata?.id ?? result.id ?? null,
    provider: result.versionMetadata?.provider ?? result.provider ?? extra.provider ?? null,
    model: result.versionMetadata?.model ?? result.model ?? result.modelName ?? extra.modelName ?? null,
    runtimeDecision: sanitizeRuntimeDecision(result.runtimeDecision),
    timestamp: extra.timestamp ?? result.timestamp ?? null
  };
}

function sanitizeRuntimeDecision(decision = null) {
  if (!decision) return null;
  return {
    kind: decision.kind ?? null,
    reason: decision.reason ?? null,
    providerCallStatus: decision.providerCallStatus ?? null,
    persistenceStatus: decision.persistenceStatus ?? null,
    summarizerEnqueued: Boolean(decision.summarizerEnqueued),
    memoryFreshness: sanitizeFreshness(decision.memoryFreshness),
    explanationVersionId: decision.explanationVersionId ?? null,
    persistedEventId: decision.persistedEventId ?? null,
    memoryCandidateIds: Array.isArray(decision.memoryCandidateIds) ? decision.memoryCandidateIds.slice(0, 8) : [],
    timestamp: decision.timestamp ?? null
  };
}

function sanitizeHealth(health = {}) {
  return {
    status: health.status ?? AgentResultStatus.UNAVAILABLE,
    reason: health.reason ?? null,
    role: health.role ?? null,
    mode: health.mode ?? null,
    adapter: health.adapter ?? null,
    endpoint: redactEndpoint(health.endpoint),
    modelName: health.modelName ?? null,
    capabilities: { ...(health.capabilities ?? {}) },
    providerRoles: cloneProviderRoles(health.providerRoles ?? {}),
    memoryRepository: sanitizeMemoryRepository(health.memoryRepository),
    runtimeConfig: sanitizeRuntimeConfigState(health.runtimeConfig),
    protocolVersion: health.protocolVersion ?? null,
    checkedAt: health.checkedAt ?? null
  };
}

function sanitizeMemoryRepository(repository = null) {
  if (!repository) return null;
  return {
    mode: repository.mode ?? null,
    status: repository.status ?? null,
    reason: repository.reason ?? null,
    shared: Boolean(repository.shared),
    persistent: Boolean(repository.persistent),
    storeMode: repository.storeMode ?? null,
    pathConfigured: Boolean(repository.pathConfigured),
    schemaVersion: repository.schemaVersion ?? null,
    sqlite: repository.sqlite ? {
      available: Boolean(repository.sqlite.available),
      driver: repository.sqlite.driver ?? null,
      databasePathConfigured: Boolean(repository.sqlite.databasePathConfigured),
      ftsAvailable: Boolean(repository.sqlite.ftsAvailable)
    } : null,
    migrationStatus: repository.migrationStatus ? {
      schemaVersion: repository.migrationStatus.schemaVersion ?? null,
      count: repository.migrationStatus.count ?? 0,
      latest: repository.migrationStatus.latest ? {
        id: repository.migrationStatus.latest.id ?? null,
        type: repository.migrationStatus.latest.type ?? null,
        fromVersion: repository.migrationStatus.latest.fromVersion ?? null,
        toVersion: repository.migrationStatus.latest.toVersion ?? null,
        status: repository.migrationStatus.latest.status ?? null,
        timestamp: repository.migrationStatus.latest.timestamp ?? null
      } : null
    } : null,
    summarizer: repository.summarizer ? {
      enabled: Boolean(repository.summarizer.enabled),
      version: repository.summarizer.version ?? null,
      status: repository.summarizer.status ?? null,
      reason: repository.summarizer.reason ?? null,
      backlogSize: repository.summarizer.backlogSize ?? 0,
      staleTargets: repository.summarizer.staleTargets ?? 0,
      lastRunAt: repository.summarizer.lastRunAt ?? null,
      lastError: repository.summarizer.lastError ?? repository.summarizer.reason ?? null,
      processedEventCount: repository.summarizer.processedEventCount ?? 0
    } : null,
    cognitiveMemory: repository.cognitiveMemory ? {
      version: repository.cognitiveMemory.version ?? null,
      dailySummaryCount: repository.cognitiveMemory.dailySummaryCount ?? 0,
      conceptProjectionCount: repository.cognitiveMemory.conceptProjectionCount ?? 0,
      relationProposalCount: repository.cognitiveMemory.relationProposalCount ?? 0,
      activeRelationCount: repository.cognitiveMemory.activeRelationCount ?? 0,
      reflectionReportCount: repository.cognitiveMemory.reflectionReportCount ?? 0,
      staleDateCount: repository.cognitiveMemory.staleDateCount ?? 0,
      relationDiscovery: repository.cognitiveMemory.relationDiscovery ? {
        status: repository.cognitiveMemory.relationDiscovery.status ?? null,
        backlogSize: repository.cognitiveMemory.relationDiscovery.backlogSize ?? 0,
        lastRunAt: repository.cognitiveMemory.relationDiscovery.lastRunAt ?? null,
        lastError: repository.cognitiveMemory.relationDiscovery.lastError ?? null,
        cacheHits: repository.cognitiveMemory.relationDiscovery.cacheHits ?? 0,
        cacheMisses: repository.cognitiveMemory.relationDiscovery.cacheMisses ?? 0,
        concurrencyLimit: repository.cognitiveMemory.relationDiscovery.concurrencyLimit ?? null
      } : null
    } : null,
    layered: repository.layered ? sanitizeLayeredMemory(repository.layered) : null
  };
}

function sanitizeLayeredMemory(layered = {}) {
  return {
    postgres: layered.postgres ? sanitizeLayerHealth(layered.postgres) : null,
    redis: layered.redis ? sanitizeLayerHealth(layered.redis) : null,
    vectorRecall: layered.vectorRecall ? sanitizeLayerHealth(layered.vectorRecall) : null,
    outbox: layered.outbox ? {
      status: layered.outbox.status ?? null,
      pendingCount: layered.outbox.pendingCount ?? 0,
      failedCount: layered.outbox.failedCount ?? 0,
      lastProcessedAt: layered.outbox.lastProcessedAt ?? null
    } : null
  };
}

function sanitizeLayerHealth(health = {}) {
  return {
    status: health.status ?? null,
    reason: health.reason ?? null,
    mode: health.mode ?? null,
    schemaVersion: health.schemaVersion ?? null,
    candidateCount: health.candidateCount ?? undefined,
    sessionCount: health.sessionCount ?? undefined,
    ttlMs: health.ttlMs ?? undefined,
    lastError: health.lastError ?? null,
    rowCounts: health.rowCounts ? { ...health.rowCounts } : undefined,
    connectionStringConfigured: Boolean(health.connectionString || health.connectionStringConfigured),
    urlConfigured: Boolean(health.url || health.urlConfigured)
  };
}

function sanitizeRuntimeConfigState(configState = null) {
  if (!configState) return null;
  return {
    version: configState.version ?? null,
    lastUpdatedAt: configState.lastUpdatedAt ?? null,
    lastUpdateStatus: configState.lastUpdateStatus ?? null,
    hotUpdateFields: Array.isArray(configState.hotUpdateFields) ? configState.hotUpdateFields.slice(0, 32) : [],
    restartRequiredFields: Array.isArray(configState.restartRequiredFields) ? configState.restartRequiredFields.slice(0, 32) : [],
    lastUpdateResult: configState.lastUpdateResult ? {
      status: configState.lastUpdateResult.status ?? null,
      reason: configState.lastUpdateResult.reason ?? null,
      appliedPaths: Array.isArray(configState.lastUpdateResult.appliedPaths) ? configState.lastUpdateResult.appliedPaths.slice(0, 32) : [],
      restartRequiredPaths: Array.isArray(configState.lastUpdateResult.restartRequiredPaths) ? configState.lastUpdateResult.restartRequiredPaths.slice(0, 32) : [],
      validationFailures: Array.isArray(configState.lastUpdateResult.validationFailures)
        ? configState.lastUpdateResult.validationFailures.map((failure) => ({
            path: failure.path ?? null,
            reason: failure.reason ?? null
          })).slice(0, 16)
        : []
    } : null
  };
}

function sanitizeFreshness(freshness = null) {
  if (!freshness) return null;
  return {
    status: freshness.status ?? null,
    lastSummarizedAt: freshness.lastSummarizedAt ?? null,
    summarizerVersion: freshness.summarizerVersion ?? null
  };
}

function sanitizePairing(status = {}) {
  return {
    configured: Boolean(status.configured),
    required: Boolean(status.required),
    reason: status.reason ?? null,
    rejected: Boolean(status.rejected)
  };
}

function redactEndpoint(endpoint = "") {
  if (!endpoint) return "";
  return String(endpoint).replace(/([?&](?:token|key|api_key|access_token|pairing_token|secret|client_secret)=)[^&]+/gi, "$1<redacted>");
}

function emptyProviderRoleState(role) {
  return {
    role,
    enabled: false,
    mode: ProviderKind.OFF,
    adapter: "",
    endpoint: "",
    chatPath: "",
    embeddingPath: "",
    modelName: "",
    tokenPresent: false,
    timeoutMs: null,
    health: {}
  };
}

function sanitizeProviderRoleState(roleState = {}) {
  return {
    role: roleState.role ?? null,
    enabled: Boolean(roleState.enabled),
    mode: roleState.mode ?? ProviderKind.OFF,
    adapter: roleState.adapter ?? "",
    endpoint: redactEndpoint(roleState.endpoint),
    chatPath: redactEndpoint(roleState.chatPath),
    embeddingPath: redactEndpoint(roleState.embeddingPath),
    structuredOutput: { ...(roleState.structuredOutput ?? {}) },
    modelName: roleState.modelName ?? "",
    tokenPresent: Boolean(roleState.tokenPresent),
    timeoutMs: roleState.timeoutMs ?? null,
    health: { ...(roleState.health ?? {}) }
  };
}

function sanitizeLocalGatewayState(localGateway = {}) {
  return {
    endpoint: redactEndpoint(localGateway.endpoint),
    pairingTokenPresent: Boolean(localGateway.pairingTokenPresent),
    timeoutMs: localGateway.timeoutMs ?? null,
    health: { ...(localGateway.health ?? {}) }
  };
}

function cloneProviderRoles(providerRoles = {}) {
  return Object.fromEntries(Object.entries(providerRoles).map(([role, value]) => [
    role,
    { ...value, health: { ...(value.health ?? {}) } }
  ]));
}
