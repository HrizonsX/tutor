// @ts-nocheck
import { DEFAULT_CONFIG, mergeConfig } from "../shared/config.js";
import { AgentResultStatus, MemoryEventType, MemoryRepositoryMode } from "../shared/contracts.js";
import { normalizeKnowledgeObjectName } from "../shared/concepts.js";
import {
  createCandidateFromEvent,
  createLocalMemoryStore,
  normalizeExplanation,
  normalizeMemoryCandidate,
  normalizeMemoryEvent
} from "./local-memory-store.js";

export const LayeredMemoryRepositoryStoreMode = "layered";
export const VectorRecallMode = Object.freeze({
  DISABLED: "disabled",
  TEST: "test",
  MILVUS: "milvus"
});

const DEFAULT_SESSION_ID = "default";
const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000;

export function createDisabledVectorRecallAdapter() {
  return {
    mode: VectorRecallMode.DISABLED,
    async: false,
    recall() {
      return {
        status: "disabled",
        candidates: [],
        reason: "vector_recall_disabled",
        lastError: null
      };
    },
    getHealth() {
      return {
        status: "disabled",
        mode: VectorRecallMode.DISABLED,
        candidateCount: 0,
        lastError: null
      };
    }
  };
}

export function createTestVectorRecallAdapter({ candidates = [], lastError = null } = {}) {
  return {
    mode: VectorRecallMode.TEST,
    recall() {
      return {
        status: lastError ? AgentResultStatus.UNAVAILABLE : AgentResultStatus.AVAILABLE,
        candidates: candidates.map(normalizeVectorCandidate),
        reason: lastError ? "vector_recall_failed" : null,
        lastError
      };
    },
    getHealth() {
      return {
        status: lastError ? AgentResultStatus.UNAVAILABLE : AgentResultStatus.AVAILABLE,
        mode: VectorRecallMode.TEST,
        candidateCount: candidates.length,
        lastError
      };
    }
  };
}

export function createInMemoryPostgresMemoryClient({ schemaVersion = DEFAULT_CONFIG.memory.schemaVersion } = {}) {
  const tables = {
    rawMemoryEvents: [],
    explanationVersions: [],
    memoryCandidates: [],
    concepts: [],
    conceptAliases: [],
    userConceptStates: [],
    relationRecords: [],
    dailyMemorySummaries: [],
    reflectionReports: [],
    projectionJobs: [],
    outboxEvents: []
  };
  return {
    kind: "memory-postgres",
    available: true,
    tables,
    getHealth() {
      return {
        status: AgentResultStatus.AVAILABLE,
        reason: null,
        schemaVersion,
        migrationStatus: { schemaVersion, count: 0, latest: null },
        rowCounts: Object.fromEntries(Object.entries(tables).map(([key, value]) => [key, value.length]))
      };
    },
    writeEventTransaction({ event, outboxEvent, concept, alias }) {
      tables.rawMemoryEvents.push(event);
      tables.outboxEvents.push(outboxEvent);
      if (concept && !tables.concepts.some((entry) => entry.canonicalName === concept.canonicalName)) {
        tables.concepts.push(concept);
      }
      if (alias && !tables.conceptAliases.some((entry) => entry.alias === alias.alias && entry.canonicalName === alias.canonicalName)) {
        tables.conceptAliases.push(alias);
      }
      return { event, outboxEvent };
    },
    writeExplanationVersion(version) {
      tables.explanationVersions.push(version);
      return version;
    },
    writeMemoryCandidate(candidate) {
      tables.memoryCandidates.push(candidate);
      return candidate;
    },
    writeRelationRecord(relation) {
      const index = tables.relationRecords.findIndex((entry) => entry.id === relation.id);
      if (index >= 0) tables.relationRecords[index] = relation;
      else tables.relationRecords.push(relation);
      return relation;
    },
    processOutboxBatch({ limit = Infinity, timestamp = Date.now() } = {}) {
      const pending = tables.outboxEvents.filter((event) => event.status !== "processed").slice(0, limit);
      for (const event of pending) {
        event.status = "processed";
        event.processedAt = timestamp;
        event.updatedAt = timestamp;
      }
      return { processed: pending.length, failed: 0 };
    },
    readAllRecords({ limit = 50000 } = {}) {
      return {
        status: AgentResultStatus.AVAILABLE,
        events: tables.rawMemoryEvents.slice(0, limit),
        explanationVersions: tables.explanationVersions.slice(0, limit),
        memoryCandidates: tables.memoryCandidates.slice(0, limit),
        relationRecords: tables.relationRecords.slice(0, limit)
      };
    },
    countOutboxPending() {
      return tables.outboxEvents.filter((event) => event.status !== "processed").length;
    },
    close() {}
  };
}

export function createInMemorySessionView({
  now = () => Date.now(),
  ttlMs = DEFAULT_SESSION_TTL_MS,
  failWrites = false
} = {}) {
  const sessions = new Map();
  return {
    kind: "memory",
    recordEvent({ sessionId = DEFAULT_SESSION_ID, canonicalName = "", type = "", timestamp = now() } = {}) {
      if (failWrites) {
        return { status: AgentResultStatus.UNAVAILABLE, reason: "redis_session_write_failed" };
      }
      const name = normalizeKnowledgeObjectName(canonicalName);
      if (!name) return { status: AgentResultStatus.AVAILABLE };
      const session = readSession(sessionId);
      upsertRecent(session.recentConcepts, {
        canonicalName: name,
        timestamp,
        expiresAt: timestamp + ttlMs
      });
      if (type === MemoryEventType.EXPLANATION_SHOWN) {
        upsertRecent(session.recentlyExplained, {
          canonicalName: name,
          timestamp,
          expiresAt: timestamp + ttlMs
        });
      }
      sessions.set(sessionId, session);
      return { status: AgentResultStatus.AVAILABLE };
    },
    getContext({ sessionId = DEFAULT_SESSION_ID, timestamp = now() } = {}) {
      const session = readSession(sessionId);
      const active = {
        recentConcepts: filterActive(session.recentConcepts, timestamp),
        recentlyExplained: filterActive(session.recentlyExplained, timestamp),
        suppressions: filterActive(session.suppressions, timestamp)
      };
      sessions.set(sessionId, active);
      return active;
    },
    getHealth() {
      return {
        status: failWrites ? AgentResultStatus.UNAVAILABLE : AgentResultStatus.AVAILABLE,
        mode: "memory",
        ttlMs,
        sessionCount: sessions.size,
        reason: failWrites ? "redis_session_write_failed" : null
      };
    }
  };

  function readSession(sessionId) {
    return sessions.get(sessionId) ?? { recentConcepts: [], recentlyExplained: [], suppressions: [] };
  }
}

export function createLayeredMemoryRepository({
  postgres = null,
  sessionView = createInMemorySessionView(),
  vectorRecall = createDisabledVectorRecallAdapter(),
  config = DEFAULT_CONFIG,
  now = () => Date.now(),
  projectionStore = null
} = {}) {
  let effectiveConfig = mergeConfig(DEFAULT_CONFIG, config);
  const localProjection = projectionStore ?? createLocalMemoryStore({
    config: effectiveConfig,
    now,
    autoProcessBacklog: false
  });
  const hydration = { hydrated: false, recordCounts: null, error: null };
  const outboxState = { pendingCount: null, failedCount: 0, lastProcessedAt: null };

  const repository = {
    mode: MemoryRepositoryMode.LOCAL_GATEWAY,
    shared: true,
    storeMode: LayeredMemoryRepositoryStoreMode,
    persistent: true,
    ready: null,
    updateConfig(nextConfig = {}) {
      effectiveConfig = mergeConfig(effectiveConfig, nextConfig);
      localProjection.updateConfig?.(nextConfig);
      return { status: AgentResultStatus.AVAILABLE };
    },
    // Durable-source-first writes: each record is normalized exactly once,
    // written to Postgres, and only ingested into the projection after the
    // durable write succeeds. A Postgres failure returns a structured
    // UNAVAILABLE without leaving projection-only state behind.
    async writeEvent(payload = {}) {
      const unavailable = await unavailableIfPostgresMissing();
      if (unavailable) return unavailable;
      const repositoryName = payload.repository ?? "learning";
      const stored = normalizeMemoryEvent(payload.event ?? payload, {
        repository: repositoryName,
        config: effectiveConfig,
        now,
        index: 0
      });
      const candidate = createCandidateFromEvent(stored);
      const storedCandidate = candidate
        ? normalizeMemoryCandidate(candidate, { config: effectiveConfig, now, index: 0 })
        : null;
      const outboxEvent = createOutboxEvent("memory_event", stored, now());
      const persisted = await postgres.writeEventTransaction?.({
        event: stored,
        outboxEvent,
        concept: conceptRecordFor(stored),
        alias: aliasRecordFor(stored)
      });
      if (persisted?.status === AgentResultStatus.UNAVAILABLE) return persisted;
      if (storedCandidate) {
        const candidatePersisted = await postgres.writeMemoryCandidate?.(storedCandidate);
        if (candidatePersisted?.status === AgentResultStatus.UNAVAILABLE) return candidatePersisted;
      }
      localProjection.ingestNormalizedEvent?.(stored);
      if (storedCandidate) localProjection.ingestNormalizedMemoryCandidate?.(storedCandidate);
      const sessionResult = await sessionView.recordEvent?.({
        sessionId: payload.sessionId,
        canonicalName: stored.canonicalName,
        type: stored.type,
        timestamp: stored.timestamp
      });
      return {
        ...stored,
        sessionStatus: sessionResult?.status ?? AgentResultStatus.AVAILABLE
      };
    },
    async writeExplanationVersion(version = {}) {
      const unavailable = await unavailableIfPostgresMissing();
      if (unavailable) return unavailable;
      const stored = normalizeExplanation(version, { config: effectiveConfig, now, index: 0 });
      const persisted = await postgres.writeExplanationVersion?.(stored);
      if (persisted?.status === AgentResultStatus.UNAVAILABLE) return persisted;
      localProjection.ingestNormalizedExplanationVersion?.(stored);
      await sessionView.recordEvent?.({
        sessionId: version.sessionId,
        canonicalName: stored.target,
        type: MemoryEventType.EXPLANATION_SHOWN,
        timestamp: stored.timestamp
      });
      return stored;
    },
    async writeMemoryCandidate(candidate = {}) {
      const unavailable = await unavailableIfPostgresMissing();
      if (unavailable) return unavailable;
      const stored = normalizeMemoryCandidate(candidate, { config: effectiveConfig, now, index: 0 });
      const persisted = await postgres.writeMemoryCandidate?.(stored);
      if (persisted?.status === AgentResultStatus.UNAVAILABLE) return persisted;
      localProjection.ingestNormalizedMemoryCandidate?.(stored);
      return stored;
    },
    async gateRelationProposal(proposal = {}, options = {}) {
      const unavailable = await unavailableIfPostgresMissing({ capabilityKind: "memory_event_write" });
      if (unavailable) return unavailable;
      const gated = localProjection.previewRelationProposal?.(proposal, options);
      if (!gated || gated.status === AgentResultStatus.UNAVAILABLE) return gated ?? null;
      const persisted = await postgres.writeRelationRecord?.(gated);
      if (persisted?.status === AgentResultStatus.UNAVAILABLE) return persisted;
      return localProjection.ingestRelationRecord?.(gated) ?? gated;
    },
    queryMemory(query = {}) {
      // Stays synchronous when all layers are synchronous (the established
      // contract); availability is checked without awaiting postgres.ready.
      const unavailable = unavailableIfPostgresMissingSync({ capabilityKind: "memory_query", memoryPacket: null });
      if (unavailable) return unavailable;
      const timestamp = query.timestamp ?? now();
      const packet = localProjection.queryMemory(query);
      if (packet?.status === AgentResultStatus.UNAVAILABLE) return packet;
      const sessionContextResult = sessionView.getContext?.({
        sessionId: query.sessionId,
        timestamp
      }) ?? { recentConcepts: [], recentlyExplained: [], suppressions: [] };
      return after(sessionContextResult, (sessionContext) => {
        const vectorResult = vectorRecall.recall?.({
          canonicalName: normalizeKnowledgeObjectName(query.canonicalName ?? query.target?.canonicalName ?? ""),
          sessionContext,
          timestamp,
          limit: query.maxBridgeCount ?? effectiveConfig.memory?.cognitive?.expandedBridgeLimit
        }) ?? createDisabledVectorRecallAdapter().recall();
        return after(vectorResult, (resolvedVectorResult) => {
          const maxBridgeCount = Math.max(0, Number(
            query.maxBridgeCount ?? packet.recallPolicy?.maxBridgeCount ?? effectiveConfig.memory?.cognitive?.microBridgeLimit ?? 1
          ));
          const memoryBridges = mergeRecallBridges({
            relationBridges: packet.memoryBridges ?? [],
            vectorCandidates: resolvedVectorResult.candidates ?? [],
            maxBridgeCount
          });
          return {
            ...packet,
            repositoryStatus: "layered_memory",
            repositoryMode: MemoryRepositoryMode.LOCAL_GATEWAY,
            localMemoryRole: "learning_state",
            sessionContext,
            vectorRecall: {
              status: resolvedVectorResult.status ?? "disabled",
              reason: resolvedVectorResult.reason ?? null,
              candidateCount: resolvedVectorResult.candidates?.length ?? 0,
              lastError: resolvedVectorResult.lastError ?? null
            },
            memoryBridges,
            relatedMemories: memoryBridges,
            recallPolicy: {
              ...(packet.recallPolicy ?? {}),
              maxBridgeCount,
              caution: "not_fact_source"
            }
          };
        });
      });
    },
    async processOutbox({ limit = Infinity } = {}) {
      const unavailable = await unavailableIfPostgresMissing({ capabilityKind: "memory_query" });
      if (unavailable) return unavailable;
      const resolvedResult = await (postgres.processOutboxBatch?.({ limit, timestamp: now() }) ?? { processed: 0, failed: 0 });
      if (resolvedResult?.status === AgentResultStatus.UNAVAILABLE) return resolvedResult;
      localProjection.processBacklog?.({ limit });
      outboxState.failedCount = resolvedResult.failed ?? 0;
      outboxState.lastProcessedAt = now();
      await refreshOutboxPendingCount();
      return {
        status: AgentResultStatus.AVAILABLE,
        processed: resolvedResult.processed ?? 0,
        failed: resolvedResult.failed ?? 0
      };
    },
    getHealth() {
      const postgresHealth = postgres?.getHealth?.() ?? {
        status: AgentResultStatus.UNAVAILABLE,
        reason: "layered_postgres_unconfigured"
      };
      const sessionHealth = sessionView.getHealth?.() ?? {
        status: AgentResultStatus.UNAVAILABLE,
        reason: "redis_session_unconfigured"
      };
      const vectorHealth = vectorRecall.getHealth?.() ?? createDisabledVectorRecallAdapter().getHealth();
      const available = postgresHealth.status === AgentResultStatus.AVAILABLE || postgresHealth.status === "available";
      const projection = localProjection.getHealth?.() ?? {};
      return {
        mode: MemoryRepositoryMode.LOCAL_GATEWAY,
        status: available ? AgentResultStatus.AVAILABLE : AgentResultStatus.UNAVAILABLE,
        reason: available ? null : (postgresHealth.reason ?? "layered_postgres_unconfigured"),
        shared: true,
        persistent: true,
        storeMode: LayeredMemoryRepositoryStoreMode,
        pathConfigured: false,
        schemaVersion: postgresHealth.schemaVersion ?? projection.schemaVersion ?? effectiveConfig.memory?.schemaVersion,
        migrationStatus: postgresHealth.migrationStatus ?? projection.migrationStatus ?? null,
        summarizer: projection.summarizer ?? null,
        cognitiveMemory: projection.cognitiveMemory ?? null,
        layered: {
          postgres: redactLayerHealth(postgresHealth),
          redis: redactLayerHealth(sessionHealth),
          vectorRecall: redactLayerHealth(vectorHealth),
          outbox: {
            status: outboxState.pendingCount === null
              ? "unknown"
              : outboxState.failedCount > 0
                ? "degraded"
                : AgentResultStatus.AVAILABLE,
            pendingCount: outboxState.pendingCount ?? 0,
            failedCount: outboxState.failedCount,
            lastProcessedAt: outboxState.lastProcessedAt
          },
          hydration: { ...hydration }
        }
      };
    },
    close() {
      const results = [
        localProjection.close?.(),
        postgres?.close?.(),
        sessionView.close?.(),
        vectorRecall.close?.()
      ].filter(Boolean);
      return results.some((result) => result && typeof result.then === "function")
        ? Promise.allSettled(results)
        : undefined;
    }
  };

  // Dynamic delegation: every projection capability that the repository does
  // not explicitly own is forwarded automatically. The old hand-maintained
  // whitelist silently dropped newer methods (pre-recall bridge discovery,
  // profile summaries, related concept hints) when layered mode was selected.
  const OVERRIDDEN_METHODS = new Set([
    "writeEvent",
    "writeExplanationVersion",
    "writeMemoryCandidate",
    "gateRelationProposal",
    "queryMemory",
    "processOutbox",
    "updateConfig",
    "getHealth",
    "close"
  ]);
  for (const key of Object.keys(localProjection)) {
    if (typeof localProjection[key] !== "function") continue;
    if (OVERRIDDEN_METHODS.has(key) || repository[key]) continue;
    repository[key] = (...args) => localProjection[key](...args);
  }

  repository.ready = initialize();
  return repository;

  // Hydration: Postgres is the durable source of truth, so a restarted
  // gateway replays its records into the fresh local projection before
  // serving recall. Without this, layered mode restarted from zero while
  // Postgres accumulated rows that were never read back.
  async function initialize() {
    await Promise.all([
      postgres?.ready,
      sessionView?.ready,
      vectorRecall?.ready
    ].filter(Boolean)).catch(() => null);
    if (!isPostgresAvailable()) return;
    try {
      const records = await postgres.readAllRecords?.({ limit: 50000 });
      if (!records || records.status === AgentResultStatus.UNAVAILABLE) {
        hydration.error = records?.reason ?? null;
        return;
      }
      for (const event of records.events ?? []) {
        localProjection.ingestNormalizedEvent?.(event);
      }
      for (const version of records.explanationVersions ?? []) {
        localProjection.ingestNormalizedExplanationVersion?.(version);
      }
      for (const candidate of records.memoryCandidates ?? []) {
        localProjection.ingestNormalizedMemoryCandidate?.(candidate);
      }
      for (const relation of records.relationRecords ?? []) {
        localProjection.ingestRelationRecord?.(relation);
      }
      localProjection.processBacklog?.({});
      hydration.hydrated = true;
      hydration.recordCounts = {
        events: records.events?.length ?? 0,
        explanationVersions: records.explanationVersions?.length ?? 0,
        memoryCandidates: records.memoryCandidates?.length ?? 0,
        relationRecords: records.relationRecords?.length ?? 0
      };
    } catch (error) {
      hydration.error = error?.message ?? String(error);
    }
    await refreshOutboxPendingCount();
  }

  async function refreshOutboxPendingCount() {
    try {
      const count = await postgres?.countOutboxPending?.();
      outboxState.pendingCount = typeof count === "number" ? count : null;
    } catch {
      outboxState.pendingCount = null;
    }
  }

  function isPostgresAvailable() {
    const health = postgres?.getHealth?.();
    return postgres?.available === true || health?.status === AgentResultStatus.AVAILABLE || health?.status === "available";
  }

  async function unavailableIfPostgresMissing(extra = {}) {
    // Awaiting ready first prevents the startup race where writes during
    // pool initialization were misreported as layered_postgres_unconfigured.
    if (postgres?.ready) await Promise.resolve(postgres.ready).catch(() => null);
    return unavailableIfPostgresMissingSync(extra);
  }

  function unavailableIfPostgresMissingSync(extra = {}) {
    if (isPostgresAvailable()) return null;
    const health = postgres?.getHealth?.();
    const reason = health?.reason ?? "layered_postgres_unconfigured";
    return {
      status: AgentResultStatus.UNAVAILABLE,
      reason,
      unavailableReason: reason,
      mode: MemoryRepositoryMode.LOCAL_GATEWAY,
      shared: true,
      repositoryStatus: "layered_memory_unavailable",
      ...extra
    };
  }
}

function mergeRecallBridges({ relationBridges = [], vectorCandidates = [], maxBridgeCount = 1 } = {}) {
  const vectorBridges = vectorCandidates
    .filter((candidate) => Number(candidate.score ?? 0) >= 0.5)
    .map((candidate) => ({
      relationId: candidate.relationId ?? null,
      relatedConcept: candidate.canonicalName,
      relationType: candidate.relationType ?? "semantic_recall",
      direction: "semantic",
      confidence: candidate.confidence ?? scoreToConfidence(candidate.score),
      score: Number(Number(candidate.score ?? 0).toFixed(3)),
      relationDepth: 1,
      sourceRole: "local_learning_context",
      caution: "not_fact_source",
      recallReason: candidate.reasonCode ?? candidate.reason ?? "vector_recall",
      evidenceEventIds: candidate.evidenceEventIds ?? [],
      evidenceExplanationVersionIds: candidate.evidenceExplanationVersionIds ?? [],
      forgettingRisk: candidate.forgettingRisk ?? "unknown"
    }));
  const seen = new Set();
  return [...relationBridges, ...vectorBridges]
    .filter((bridge) => {
      const key = bridge.relatedConcept ?? bridge.relationId;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => Number(right.score ?? 0) - Number(left.score ?? 0))
    .slice(0, maxBridgeCount);
}

function normalizeVectorCandidate(candidate = {}) {
  return {
    canonicalName: normalizeKnowledgeObjectName(candidate.canonicalName ?? candidate.target ?? candidate.concept ?? ""),
    score: Number(candidate.score ?? 0),
    reasonCode: candidate.reasonCode ?? candidate.reason ?? "vector_recall",
    relationType: candidate.relationType ?? "semantic_recall",
    confidence: candidate.confidence ?? scoreToConfidence(candidate.score),
    evidenceEventIds: Array.isArray(candidate.evidenceEventIds) ? candidate.evidenceEventIds.slice(0, 8) : [],
    evidenceExplanationVersionIds: Array.isArray(candidate.evidenceExplanationVersionIds) ? candidate.evidenceExplanationVersionIds.slice(0, 8) : [],
    forgettingRisk: candidate.forgettingRisk ?? "unknown"
  };
}

function scoreToConfidence(score = 0) {
  const value = Number(score ?? 0);
  if (value >= 0.85) return "high";
  if (value >= 0.65) return "medium";
  return "low";
}

function createOutboxEvent(kind, record, timestamp) {
  return {
    id: `outbox_${kind}_${record.id ?? timestamp}`,
    kind,
    aggregateId: record.id ?? record.canonicalName ?? record.target ?? "",
    status: "pending",
    attemptCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    record
  };
}

function conceptRecordFor(event = {}) {
  if (!event.canonicalName) return null;
  return {
    canonicalName: event.canonicalName,
    knowledgeType: event.knowledgeType ?? null,
    createdAt: event.timestamp,
    updatedAt: event.timestamp
  };
}

function aliasRecordFor(event = {}) {
  if (!event.canonicalName || !event.observedAlias) return null;
  return {
    canonicalName: event.canonicalName,
    alias: event.observedAlias,
    sourceEventId: event.id ?? null,
    confidence: "low",
    createdAt: event.timestamp,
    updatedAt: event.timestamp
  };
}

function upsertRecent(items, entry) {
  const next = items.filter((item) => item.canonicalName !== entry.canonicalName);
  next.push(entry);
  next.sort((left, right) => Number(right.timestamp ?? 0) - Number(left.timestamp ?? 0));
  items.splice(0, items.length, ...next.slice(0, 20));
}

function filterActive(items = [], timestamp) {
  return items.filter((item) => !item.expiresAt || item.expiresAt > timestamp);
}

function redactLayerHealth(health = {}) {
  return {
    ...health,
    connectionString: health.connectionString ? "<redacted>" : undefined,
    url: health.url ? "<redacted>" : undefined
  };
}

function after(value, callback) {
  if (value && typeof value.then === "function") return value.then(callback);
  return callback(value);
}
