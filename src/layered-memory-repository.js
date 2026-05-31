import { DEFAULT_CONFIG, mergeConfig } from "./config.js";
import { AgentResultStatus, MemoryEventType, MemoryRepositoryMode } from "./contracts.js";
import { normalizeKnowledgeObjectName } from "./concepts.js";
import { createLocalMemoryStore } from "./local-memory-store.js";

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

  const repository = {
    mode: MemoryRepositoryMode.LOCAL_GATEWAY,
    shared: true,
    storeMode: LayeredMemoryRepositoryStoreMode,
    persistent: true,
    ready: Promise.all([
      postgres?.ready,
      sessionView?.ready,
      vectorRecall?.ready
    ].filter(Boolean)).catch(() => null),
    updateConfig(nextConfig = {}) {
      effectiveConfig = mergeConfig(effectiveConfig, nextConfig);
      localProjection.updateConfig?.(nextConfig);
      return { status: AgentResultStatus.AVAILABLE };
    },
    writeEvent(payload = {}) {
      const unavailable = unavailableIfPostgresMissing();
      if (unavailable) return unavailable;
      const stored = localProjection.writeEvent(payload);
      if (stored?.status === AgentResultStatus.UNAVAILABLE) return stored;
      const outboxEvent = createOutboxEvent("memory_event", stored, now());
      const persisted = postgres.writeEventTransaction?.({
        event: stored,
        outboxEvent,
        concept: conceptRecordFor(stored),
        alias: aliasRecordFor(stored)
      });
      return after(persisted, (persistResult) => {
        if (persistResult?.status === AgentResultStatus.UNAVAILABLE) return persistResult;
        const sessionResult = sessionView.recordEvent?.({
          sessionId: payload.sessionId,
          canonicalName: stored.canonicalName,
          type: stored.type,
          timestamp: stored.timestamp
        });
        return after(sessionResult, (resolvedSessionResult) => ({
          ...stored,
          sessionStatus: resolvedSessionResult?.status ?? AgentResultStatus.AVAILABLE
        }));
      });
    },
    writeExplanationVersion(version = {}) {
      const unavailable = unavailableIfPostgresMissing();
      if (unavailable) return unavailable;
      const stored = localProjection.writeExplanationVersion(version);
      if (stored?.status === AgentResultStatus.UNAVAILABLE) return stored;
      const persisted = postgres.writeExplanationVersion?.(stored);
      return after(persisted, (persistResult) => {
        if (persistResult?.status === AgentResultStatus.UNAVAILABLE) return persistResult;
        const sessionResult = sessionView.recordEvent?.({
          sessionId: version.sessionId,
          canonicalName: stored.target,
          type: MemoryEventType.EXPLANATION_SHOWN,
          timestamp: stored.timestamp
        });
        return after(sessionResult, () => stored);
      });
    },
    writeMemoryCandidate(candidate = {}) {
      const unavailable = unavailableIfPostgresMissing();
      if (unavailable) return unavailable;
      const stored = localProjection.writeMemoryCandidate(candidate);
      if (stored?.status === AgentResultStatus.UNAVAILABLE) return stored;
      const persisted = postgres.writeMemoryCandidate?.(stored);
      return after(persisted, (persistResult) => {
        if (persistResult?.status === AgentResultStatus.UNAVAILABLE) return persistResult;
        return stored;
      });
    },
    gateRelationProposal(proposal = {}, options = {}) {
      const unavailable = unavailableIfPostgresMissing({ capabilityKind: "memory_event_write" });
      if (unavailable) return unavailable;
      const stored = localProjection.gateRelationProposal?.(proposal, options);
      if (stored?.status === AgentResultStatus.UNAVAILABLE) return stored;
      const persisted = postgres.writeRelationRecord?.(stored);
      return after(persisted, (persistResult) => {
        if (persistResult?.status === AgentResultStatus.UNAVAILABLE) return persistResult;
        return stored;
      });
    },
    queryMemory(query = {}) {
      const unavailable = unavailableIfPostgresMissing({ capabilityKind: "memory_query", memoryPacket: null });
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
    processOutbox({ limit = Infinity } = {}) {
      const unavailable = unavailableIfPostgresMissing({ capabilityKind: "memory_query" });
      if (unavailable) return unavailable;
      const result = postgres.processOutboxBatch?.({ limit, timestamp: now() }) ?? { processed: 0, failed: 0 };
      return after(result, (resolvedResult) => {
        if (resolvedResult?.status === AgentResultStatus.UNAVAILABLE) return resolvedResult;
        localProjection.processBacklog?.({ limit });
        return {
          status: AgentResultStatus.AVAILABLE,
          processed: resolvedResult.processed ?? 0,
          failed: resolvedResult.failed ?? 0
        };
      });
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
          outbox: summarizeOutbox(postgres)
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

  for (const key of [
    "readConceptProjection",
    "writeDailySummary",
    "readDailySummary",
    "listDailySummaries",
    "generateDailySummary",
    "selectRelevantDays",
    "loadDayConceptBlocks",
    "queryActiveRelations",
    "planOverlayRecall",
    "scheduleRelationDiscovery",
    "runRelationDiscovery",
    "generateDailyReport",
    "generateWeeklyReport",
    "readTargetEvidence",
    "readDerivedSummary",
    "writeDerivedSummary",
    "listStaleTargets",
    "processBacklog"
  ]) {
    if (typeof localProjection[key] === "function" && !repository[key]) {
      repository[key] = (...args) => localProjection[key](...args);
    }
  }

  return repository;

  function unavailableIfPostgresMissing(extra = {}) {
    const health = postgres?.getHealth?.();
    const available = postgres?.available === true || health?.status === AgentResultStatus.AVAILABLE || health?.status === "available";
    if (available) return null;
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

function summarizeOutbox(postgres) {
  const rows = postgres?.tables?.outboxEvents;
  if (!Array.isArray(rows)) return { status: "unknown", pendingCount: 0, failedCount: 0, lastProcessedAt: null };
  return {
    status: rows.some((row) => row.status === "failed") ? "degraded" : AgentResultStatus.AVAILABLE,
    pendingCount: rows.filter((row) => row.status === "pending").length,
    failedCount: rows.filter((row) => row.status === "failed").length,
    lastProcessedAt: rows.filter((row) => row.processedAt).at(-1)?.processedAt ?? null
  };
}

function after(value, callback) {
  if (value && typeof value.then === "function") return value.then(callback);
  return callback(value);
}
