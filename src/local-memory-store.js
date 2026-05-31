import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { DEFAULT_CONFIG, mergeConfig } from "./config.js";
import {
  AgentResultStatus,
  DerivedSignal,
  ExplanationStyle,
  MemoryEventType,
  MemoryRepositoryMode
} from "./contracts.js";
import { normalizeKnowledgeObjectName } from "./concepts.js";
import {
  buildConceptProjection,
  buildDailyMemorySummary,
  buildDayConceptBlocks,
  buildReflectionReport,
  COGNITIVE_MEMORY_VERSION,
  createEmptyCognitiveMemoryState,
  DAILY_SUMMARY_VERSION,
  gateRelationProposal,
  isRelationUsableForOverlay,
  normalizeCognitiveMemoryState,
  rankMemoryBridges,
  REFLECTION_REPORT_VERSION,
  selectRelevantDays,
  toMemoryDate
} from "./cognitive-memory.js";
import { buildRetrievalPacket } from "./knowledge-agent.js";
import {
  clampText,
  hashString,
  sanitizeEventContext,
  sanitizeExplanationVersion,
  sanitizeKnowledgeContext,
  sanitizeRelationEvidence
} from "./privacy.js";

export const LocalMemoryStoreMode = Object.freeze({
  MEMORY: "memory",
  SQLITE: "sqlite"
});

export const LOCAL_MEMORY_SUMMARIZER_VERSION = "local-memory-summarizer.v1";

const SQLITE_FILE = "local-memory.sqlite";
const SQLITE_SCHEMA_VERSION = 1;
const MAX_EVIDENCE_IDS = 12;
const require = createRequire(import.meta.url);
const FEEDBACK_TYPES = new Set([
  MemoryEventType.MARKED_KNOWN,
  MemoryEventType.MARKED_CONFUSING,
  MemoryEventType.MARKED_WRONG,
  MemoryEventType.REQUESTED_REGENERATION,
  MemoryEventType.REQUESTED_SIMPLER,
  MemoryEventType.REQUESTED_MORE_CONTEXT,
  MemoryEventType.MUTED_OBJECT,
  MemoryEventType.MUTED_CATEGORY
]);

export function createLocalMemoryStore({
  schemaVersion = DEFAULT_CONFIG.memory.schemaVersion,
  config = DEFAULT_CONFIG,
  now = () => Date.now(),
  persistence = null,
  autoProcessBacklog = true
} = {}) {
  config = mergeConfig(DEFAULT_CONFIG, config);
  const directory = persistence?.directory ? resolve(String(persistence.directory)) : "";
  const storeMode = directory ? LocalMemoryStoreMode.SQLITE : LocalMemoryStoreMode.MEMORY;
  const loaded = directory
    ? loadSQLiteBackedData({ directory, schemaVersion, now })
    : { data: createEmptyStoreData({ schemaVersion }) };
  const data = normalizeStoreData(loaded.data, schemaVersion);
  const runtime = {
    available: !loaded.unavailableReason,
    reason: loaded.unavailableReason ?? null,
    scheduled: false,
    sqlite: loaded.sqlite ?? null,
    sqliteDriver: loaded.sqliteDriver ?? null,
    databasePath: loaded.databasePath ?? null,
    ftsAvailable: Boolean(loaded.ftsAvailable),
    migrationError: loaded.migrationError ?? null,
    closed: false,
    profileRefreshTimer: null
  };

  initializeStaleTargets(data);
  if (autoProcessBacklog && runtime.available) {
    scheduleSummarization();
    scheduleProfileRefresh();
  }

  return {
    mode: MemoryRepositoryMode.LOCAL_GATEWAY,
    shared: true,
    storeMode,
    persistent: storeMode === LocalMemoryStoreMode.SQLITE,
    data,
    updateConfig(nextConfig = {}) {
      config = mergeConfig(config, nextConfig);
      return { status: AgentResultStatus.AVAILABLE };
    },
    readConceptProjection(canonicalName = "") {
      const target = normalizeKnowledgeObjectName(canonicalName);
      return data.cognitiveMemory.conceptProjections[target] ?? rebuildConceptProjection(target);
    },
    readProfileSummary() {
      return data.profileSummary ?? rebuildProfileSummary();
    },
    refreshProfileSummary({ force = true } = {}) {
      return refreshProfileSummary({ force });
    },
    writeDailySummary(summary = {}) {
      if (!runtime.available) return unavailableMemory(runtime.reason, { capabilityKind: "memory_event_write" });
      const stored = normalizeDailySummaryRecord(summary, { now });
      data.cognitiveMemory.dailySummaries[stored.date] = stored;
      data.cognitiveMemory.staleDates = (data.cognitiveMemory.staleDates ?? []).filter((date) => date !== stored.date);
      persistSqliteDailySummary(stored);
      return stored;
    },
    readDailySummary(date = "") {
      return data.cognitiveMemory.dailySummaries[date] ?? null;
    },
    listDailySummaries({ limit = Infinity } = {}) {
      return Object.values(data.cognitiveMemory.dailySummaries)
        .sort((left, right) => String(right.date).localeCompare(String(left.date)))
        .slice(0, limit);
    },
    generateDailySummary({ date = toMemoryDate(now()) } = {}) {
      if (!runtime.available) return unavailableMemory(runtime.reason, { capabilityKind: "memory_query" });
      return rebuildDailySummary(date);
    },
    selectRelevantDays(query = {}) {
      const target = normalizeKnowledgeObjectName(query.canonicalName ?? query.target?.canonicalName ?? query.targetConcept ?? "");
      return selectRelevantDays({
        targetConcept: target,
        dailySummaries: Object.values(data.cognitiveMemory.dailySummaries),
        limit: query.limit ?? config.memory?.cognitive?.selectedDayLimit
      });
    },
    loadDayConceptBlocks({ dates = [] } = {}) {
      return buildDayConceptBlocks({
        dates,
        dailySummaries: Object.values(data.cognitiveMemory.dailySummaries),
        conceptProjections: data.cognitiveMemory.conceptProjections,
        relations: data.cognitiveMemory.relationProposals
      });
    },
    gateRelationProposal(proposal = {}, options = {}) {
      if (!runtime.available) return unavailableMemory(runtime.reason, { capabilityKind: "memory_event_write" });
      const dayBlocks = options.dayBlocks ?? buildDayConceptBlocks({
        dates: [proposal.sourceDate].filter(Boolean),
        dailySummaries: Object.values(data.cognitiveMemory.dailySummaries),
        conceptProjections: data.cognitiveMemory.conceptProjections,
        relations: data.cognitiveMemory.relationProposals
      });
      const gated = gateRelationProposal(proposal, {
        dayBlocks,
        existingRelations: data.cognitiveMemory.relationProposals,
        timestamp: options.timestamp ?? now(),
        targetConcept: options.targetConcept ?? options.canonicalName ?? "",
        config
      });
      return upsertRelationProposal(gated);
    },
    queryActiveRelations(canonicalName = "", options = {}) {
      const target = normalizeKnowledgeObjectName(canonicalName);
      return selectActiveRelations(target, options);
    },
    planOverlayRecall(query = {}) {
      return planOverlayRecall(query);
    },
    scheduleRelationDiscovery({ target = null, relationProposer = null, explanationVersion = null, currentContext = null } = {}) {
      const canonicalName = normalizeKnowledgeObjectName(target?.canonicalName ?? target ?? "");
      if (!canonicalName) return null;
      data.cognitiveMemory.relationDiscovery.backlogTargets = unique([
        ...(data.cognitiveMemory.relationDiscovery.backlogTargets ?? []),
        canonicalName
      ]);
      const scheduler = globalThis.queueMicrotask ?? ((task) => Promise.resolve().then(task));
      scheduler(() => {
        if (runtime.closed) return;
        Promise.resolve(runRelationDiscovery({
          canonicalName,
          relationProposer,
          explanationVersion,
          currentContext
        })).catch((error) => {
          data.cognitiveMemory.relationDiscovery.status = "degraded";
          data.cognitiveMemory.relationDiscovery.lastError = error?.message ?? String(error);
        });
      });
      return { status: "scheduled", canonicalName };
    },
    async discoverPreRecallMemoryBridges({
      canonicalName = "",
      target = null,
      currentContext = null,
      relationProposer = null,
      limit = 20,
      maxBridgeCount = null,
      timestamp = now(),
      goal = "micro"
    } = {}) {
      return discoverPreRecallMemoryBridges({
        canonicalName,
        target,
        currentContext,
        relationProposer,
        limit,
        maxBridgeCount,
        timestamp,
        goal
      });
    },
    commitPreRecallRelations({ relations = [] } = {}) {
      const stored = relations
        .filter((relation) => relation?.id)
        .map((relation) => upsertRelationProposal(relation));
      return {
        status: AgentResultStatus.AVAILABLE,
        relationCandidates: stored
      };
    },
    writeRelatedConceptHints(payload = {}) {
      return writeRelatedConceptHints(payload);
    },
    runRelationDiscovery({ canonicalName = "", relationProposer = null, daySelector = null, explanationVersion = null, currentContext = null } = {}) {
      return runRelationDiscovery({ canonicalName, relationProposer, daySelector, explanationVersion, currentContext });
    },
    generateDailyReport({ date = toMemoryDate(now()) } = {}) {
      if (!runtime.available) return unavailableMemory(runtime.reason, { capabilityKind: "memory_query" });
      const summary = data.cognitiveMemory.dailySummaries[date] ?? rebuildDailySummary(date);
      const report = buildReflectionReport({
        kind: "daily",
        date: summary.date,
        dailySummaries: Object.values(data.cognitiveMemory.dailySummaries),
        conceptProjections: data.cognitiveMemory.conceptProjections,
        relations: data.cognitiveMemory.relationProposals,
        timestamp: now(),
        config
      });
      return persistReflectionReport(report);
    },
    generateWeeklyReport({ startDate, endDate } = {}) {
      if (!runtime.available) return unavailableMemory(runtime.reason, { capabilityKind: "memory_query" });
      const report = buildReflectionReport({
        kind: "weekly",
        startDate,
        endDate,
        dailySummaries: Object.values(data.cognitiveMemory.dailySummaries),
        conceptProjections: data.cognitiveMemory.conceptProjections,
        relations: data.cognitiveMemory.relationProposals,
        timestamp: now(),
        config
      });
      return persistReflectionReport(report);
    },
    writeEvent(payload = {}) {
      if (!runtime.available) return unavailableMemory(runtime.reason, { capabilityKind: "memory_event_write" });
      const repository = payload.repository ?? "learning";
      const event = payload.event ?? payload;
      const stored = normalizeMemoryEvent(event, {
        repository,
        config,
        now,
        index: data.events.length + data.profileEvents.length
      });
      if (repository === "profile") data.profileEvents.push(stored);
      else data.events.push(stored);
      writeSqliteRawEvent(stored);
      const candidate = createCandidateFromEvent(stored);
      if (candidate) {
        const storedCandidate = normalizeMemoryCandidate(candidate, { config, now, index: data.memoryCandidates.length });
        data.memoryCandidates.push(storedCandidate);
        writeSqliteMemoryCandidate(storedCandidate);
      }
      markTargetStale(stored.canonicalName);
      markCognitiveMemoryStale(stored.canonicalName, stored.timestamp);
      scheduleSummarization();
      return stored;
    },
    writeExplanationVersion(version = {}) {
      if (!runtime.available) return unavailableMemory(runtime.reason, { capabilityKind: "memory_event_write" });
      const stored = normalizeExplanation(version, { config, now, index: data.explanationVersions.length });
      data.explanationVersions.push(stored);
      writeSqliteExplanationVersion(stored);
      markTargetStale(stored.target);
      markCognitiveMemoryStale(stored.target, stored.timestamp);
      scheduleSummarization();
      return stored;
    },
    writeMemoryCandidate(candidate = {}) {
      if (!runtime.available) return unavailableMemory(runtime.reason, { capabilityKind: "memory_event_write" });
      const stored = normalizeMemoryCandidate(candidate, { config, now, index: data.memoryCandidates.length });
      data.memoryCandidates.push(stored);
      writeSqliteMemoryCandidate(stored);
      markTargetStale(stored.canonicalName);
      markCognitiveMemoryStale(stored.canonicalName, stored.timestamp);
      scheduleSummarization();
      return stored;
    },
    readTargetEvidence(canonicalName = "") {
      const target = normalizeKnowledgeObjectName(canonicalName);
      return {
        canonicalName: target,
        events: data.events.filter((event) => event.canonicalName === target),
        profileEvents: data.profileEvents.filter((event) => event.canonicalName === target),
        explanationVersions: data.explanationVersions.filter((version) => version.target === target),
        memoryCandidates: data.memoryCandidates.filter((candidate) => candidate.canonicalName === target),
        derivedSummary: data.derivedSummaries[target] ?? null
      };
    },
    readDerivedSummary(canonicalName = "") {
      return data.derivedSummaries[normalizeKnowledgeObjectName(canonicalName)] ?? null;
    },
    writeDerivedSummary(summary = {}) {
      if (!runtime.available) return unavailableMemory(runtime.reason, { capabilityKind: "memory_query" });
      const canonicalName = normalizeKnowledgeObjectName(summary.canonicalName ?? "");
      if (!canonicalName) return null;
      const stored = normalizeDerivedSummary({ ...summary, canonicalName }, now());
      data.derivedSummaries[canonicalName] = stored;
      upsertAgentSummary(stored);
      removeStaleTarget(canonicalName);
      data.summarizer.lastRunAt = stored.timestamp;
      data.summarizer.lastError = null;
      data.summarizer.processedEventCount = data.events.length + data.profileEvents.length;
      persistSqliteDerivedSummary(stored);
      return stored;
    },
    listStaleTargets() {
      return unique([
        ...(data.summarizer.backlogTargets ?? []),
        ...(data.summarizer.staleTargets ?? [])
      ]);
    },
    processBacklog({ limit = Infinity } = {}) {
      if (!runtime.available) return unavailableMemory(runtime.reason, { capabilityKind: "memory_query" });
      return processStaleTargets({ limit, includeSummaries: true });
    },
    queryMemory(query = {}) {
      if (!runtime.available) return unavailableMemory(runtime.reason, { capabilityKind: "memory_query", memoryPacket: null });
      const timestamp = query.timestamp ?? now();
      const canonicalName = normalizeKnowledgeObjectName(query.canonicalName || query.candidate?.canonicalName || query.target?.canonicalName || "");
      if (!canonicalName) {
        return unavailableMemory("memory_query_target_missing", { capabilityKind: "memory_query", memoryPacket: null });
      }
      const summary = query.allowSyncSummarize === false
        ? data.derivedSummaries[canonicalName] ?? null
        : ensureFreshSummary(canonicalName);
      const memoryCandidates = data.memoryCandidates
        .filter((candidate) => candidate.canonicalName === canonicalName && candidate.status !== "rejected")
        .slice(-MAX_EVIDENCE_IDS);
      const queryKnowledgeType = query.candidate?.knowledgeType ?? query.target?.knowledgeType ?? summary?.targetState?.knowledgeType ?? null;
      const mergedProfileHints = mergeProfileHintsForTarget(
        data.profileSummary?.hints ?? {},
        summary?.profileHints ?? {},
        { knowledgeType: queryKnowledgeType }
      );
      const packet = buildRetrievalPacket({
        canonicalName,
        candidate: query.candidate ?? query.target ?? null,
        events: data.events,
        explanationVersions: data.explanationVersions,
        derivedSignals: summary?.targetState?.derivedSignals ?? {},
        cooldowns: summary?.cooldowns ?? {},
        profileHints: mergedProfileHints,
        timestamp,
        maxRelatedObjects: query.maxRelatedObjects ?? config.knowledge?.maxRelatedObjects ?? 5
      });
      const freshness = summary
        ? {
            status: isSummaryStale(canonicalName, summary) ? "stale" : "fresh",
            lastSummarizedAt: summary.timestamp,
            summarizerVersion: summary.summarizerVersion
          }
        : {
            status: "raw_fallback",
            lastSummarizedAt: null,
            summarizerVersion: LOCAL_MEMORY_SUMMARIZER_VERSION
          };
      const conceptProjection = data.cognitiveMemory.conceptProjections[canonicalName] ?? rebuildConceptProjection(canonicalName);
      const recallPlan = planOverlayRecall({
        canonicalName,
        goal: query.goal ?? query.requestGoal ?? "micro",
        timestamp,
        maxBridgeCount: query.maxBridgeCount
      });

      return {
        ...packet,
        status: AgentResultStatus.AVAILABLE,
        repositoryStatus: freshness.status === "fresh" ? "local_gateway" : "local_gateway_degraded",
        repositoryMode: MemoryRepositoryMode.LOCAL_GATEWAY,
        shared: true,
        localMemoryRole: "learning_state",
        derivedSignals: summary?.targetState?.derivedSignals ?? packet.derivedSignals,
        profileHints: mergedProfileHints,
        cooldowns: summary?.cooldowns ?? packet.cooldowns,
        relatedObjects: summary?.relatedObjects ?? packet.relatedObjects,
        memoryCandidates,
        conceptState: summary?.targetState ?? null,
        conceptProjection,
        memoryBridges: recallPlan.memoryBridges,
        recallPolicy: recallPlan.policy,
        relatedMemories: recallPlan.memoryBridges,
        relationDiscovery: {
          status: data.cognitiveMemory.relationDiscovery.status,
          backlogSize: data.cognitiveMemory.relationDiscovery.backlogTargets.length,
          lastRunAt: data.cognitiveMemory.relationDiscovery.lastRunAt,
          lastError: data.cognitiveMemory.relationDiscovery.lastError
        },
        profileSummary: data.profileSummary ? {
          timestamp: data.profileSummary.timestamp,
          summarizerVersion: data.profileSummary.summarizerVersion,
          hints: data.profileSummary.hints ?? {},
          uncertainty: data.profileSummary.uncertainty ?? null,
          sourceEventIds: data.profileSummary.sourceEventIds ?? []
        } : null,
        retrievalSummary: data.retrievalSummaries[canonicalName] ?? null,
        agentSummary: {
          ...packet.agentSummary,
          ...(summary?.agentSummary ?? {}),
          localMemoryOnly: true,
          sourceRole: "learning_state"
        },
        feedbackSummary: summary?.feedbackSummary ?? packet.agentSummary.feedbackSummary ?? {},
        explanationPreferences: summary?.explanationPreferences ?? null,
        memoryFreshness: freshness,
        summaryEvidenceEventIds: summary?.sourceEventIds ?? packet.agentSummary.evidenceEventIds ?? []
      };
    },
    getHealth() {
      return {
        mode: MemoryRepositoryMode.LOCAL_GATEWAY,
        status: runtime.available ? "available" : AgentResultStatus.UNAVAILABLE,
        reason: runtime.reason,
        shared: true,
        persistent: storeMode === LocalMemoryStoreMode.SQLITE,
        storeMode,
        pathConfigured: Boolean(directory),
        sqlite: {
          available: Boolean(runtime.sqlite),
          driver: runtime.sqliteDriver,
          databasePathConfigured: Boolean(runtime.databasePath),
          ftsAvailable: runtime.ftsAvailable
        },
        schemaVersion: data.schemaVersion,
        migrationStatus: summarizeMigrations(),
        summarizer: summarizeRuntimeState(),
        cognitiveMemory: summarizeCognitiveMemoryState()
      };
    },
    close() {
      runtime.closed = true;
      if (runtime.profileRefreshTimer && globalThis.clearInterval) {
        globalThis.clearInterval(runtime.profileRefreshTimer);
      }
      runtime.sqlite?.close?.();
      runtime.scheduled = false;
    }
  };

  function writeSqliteRawEvent(event) {
    if (!runtime.sqlite) return;
    runSqlite(runtime.sqlite, `
      INSERT OR REPLACE INTO raw_memory_events (
        id, repository, type, canonical_name, observed_alias, timestamp,
        knowledge_type, explanation_version_id, previous_explanation_version_id,
        requested_style, explanation_style, fact_sensitivity, feedback_event_id,
        context_json, source_event_ids_json, uncertainty_json, related_concepts_json, record_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      event.id,
      event.repository,
      event.type,
      event.canonicalName,
      event.observedAlias,
      event.timestamp,
      event.knowledgeType,
      event.explanationVersionId,
      event.previousExplanationVersionId,
      event.requestedStyle,
      event.explanationStyle,
      event.factSensitivity,
      event.feedbackEventId,
      JSON.stringify(event.context ?? {}),
      JSON.stringify(event.sourceEventIds ?? []),
      JSON.stringify(event.uncertainty ?? null),
      JSON.stringify(event.relatedConcepts ?? []),
      JSON.stringify(event)
    ]);
    insertRawEventFts(event);
  }

  function writeSqliteExplanationVersion(version) {
    if (!runtime.sqlite) return;
    runSqlite(runtime.sqlite, `
      INSERT OR REPLACE INTO explanation_versions (
        id, target, style, text, summary, confidence, timestamp,
        previous_version_id, feedback_event_id, fact_sensitivity,
        status, source, provider, model, schema_name, prompt_version,
        structured_response_json, context_summary_json, terms_json, actions_json, record_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      version.id,
      version.target,
      version.style,
      version.text,
      version.summary ?? "",
      version.confidence == null ? null : String(version.confidence),
      version.timestamp,
      version.previousVersionId,
      version.feedbackEventId,
      version.factSensitivity,
      version.status,
      version.source,
      version.provider,
      version.model,
      version.schema ?? version.versionMetadata?.schema ?? null,
      version.promptVersion ?? version.versionMetadata?.promptVersion ?? null,
      JSON.stringify(version.structuredResponse ?? version),
      JSON.stringify(version.contextSummary ?? {}),
      JSON.stringify(version.terms ?? []),
      JSON.stringify(version.actions ?? []),
      JSON.stringify(version)
    ]);
    insertExplanationFts(version);
  }

  function writeSqliteMemoryCandidate(candidate) {
    if (!runtime.sqlite) return;
    runSqlite(runtime.sqlite, `
      INSERT OR REPLACE INTO memory_candidates (
        id, canonical_name, kind, signal, status, uncertainty, timestamp,
        source_event_ids_json, source_candidate_ids_json, source_explanation_version_id,
        provider, model, metadata_json, record_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      candidate.id,
      candidate.canonicalName,
      candidate.kind,
      candidate.signal,
      candidate.status,
      candidate.uncertainty,
      candidate.timestamp,
      JSON.stringify(candidate.sourceEventIds ?? []),
      JSON.stringify(candidate.sourceCandidateIds ?? []),
      candidate.sourceExplanationVersionId,
      candidate.provider,
      candidate.model,
      JSON.stringify(candidate.metadata ?? {}),
      JSON.stringify(candidate)
    ]);
  }

  function persistSqliteConceptState(summary) {
    if (!runtime.sqlite || !summary?.canonicalName) return;
    runSqlite(runtime.sqlite, `
      INSERT OR REPLACE INTO concept_states (
        canonical_name, state_json, source_event_ids_json, source_candidate_ids_json,
        uncertainty_json, timestamp, summarizer_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      summary.canonicalName,
      JSON.stringify(summary.targetState ?? {}),
      JSON.stringify(summary.sourceEventIds ?? []),
      JSON.stringify(summary.targetState?.sourceCandidateIds ?? []),
      JSON.stringify(summary.uncertainty ?? null),
      summary.timestamp,
      summary.summarizerVersion
    ]);
  }

  function persistSqliteDerivedSummary(summary) {
    if (!runtime.sqlite || !summary?.canonicalName) return;
    runSqlite(runtime.sqlite, `
      INSERT OR REPLACE INTO retrieval_summaries (
        canonical_name, summary_json, text, source_event_ids_json,
        source_candidate_ids_json, timestamp, summarizer_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      summary.canonicalName,
      JSON.stringify(summary),
      clampText(JSON.stringify(summary.agentSummary ?? {}), config.privacy.maxContextChars),
      JSON.stringify(summary.sourceEventIds ?? []),
      JSON.stringify(summary.targetState?.sourceCandidateIds ?? []),
      summary.timestamp,
      summary.summarizerVersion
    ]);
    insertRetrievalFts(summary);
  }

  function persistSqliteRetrievalSummary(summary) {
    if (!runtime.sqlite || !summary?.canonicalName) return;
    runSqlite(runtime.sqlite, `
      INSERT OR REPLACE INTO retrieval_summaries (
        canonical_name, summary_json, text, source_event_ids_json,
        source_candidate_ids_json, timestamp, summarizer_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      summary.canonicalName,
      JSON.stringify(summary),
      summary.text ?? "",
      JSON.stringify(summary.sourceEventIds ?? []),
      JSON.stringify(summary.sourceCandidateIds ?? []),
      summary.timestamp,
      summary.summarizerVersion
    ]);
    insertRetrievalFts(summary);
  }

  function persistSqliteProfileSummary() {
    if (!runtime.sqlite || !data.profileSummary) return;
    runSqlite(runtime.sqlite, `
      INSERT OR REPLACE INTO profile_summary (
        id, summary_json, source_event_ids_json, source_candidate_ids_json,
        uncertainty_json, timestamp, summarizer_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      data.profileSummary.id ?? "profile_summary",
      JSON.stringify(data.profileSummary),
      JSON.stringify(data.profileSummary.sourceEventIds ?? []),
      JSON.stringify(data.profileSummary.sourceCandidateIds ?? []),
      JSON.stringify(data.profileSummary.uncertainty ?? null),
      data.profileSummary.timestamp,
      data.profileSummary.summarizerVersion
    ]);
  }

  function persistSqliteConceptProjection(projection) {
    if (!runtime.sqlite || !projection?.canonicalName) return;
    runSqlite(runtime.sqlite, `
      INSERT OR REPLACE INTO concept_projections (
        canonical_name, projection_json, source_event_ids_json, source_candidate_ids_json,
        timestamp, summarizer_version
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [
      projection.canonicalName,
      JSON.stringify(projection),
      JSON.stringify(projection.sourceEventIds ?? []),
      JSON.stringify(projection.sourceCandidateIds ?? []),
      projection.timestamp ?? now(),
      projection.summarizerVersion ?? COGNITIVE_MEMORY_VERSION
    ]);
  }

  function persistSqliteDailySummary(summary) {
    if (!runtime.sqlite || !summary?.date) return;
    runSqlite(runtime.sqlite, `
      INSERT OR REPLACE INTO daily_memory_summaries (
        date, summary_hash, summary_json, source_event_ids_json, created_at, summarizer_version
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [
      summary.date,
      summary.summaryHash,
      JSON.stringify(summary),
      JSON.stringify(summary.sourceEventIds ?? []),
      summary.createdAt ?? summary.timestamp ?? now(),
      summary.summaryVersion ?? DAILY_SUMMARY_VERSION
    ]);
  }

  function persistSqliteRelationProposal(relation) {
    if (!runtime.sqlite || !relation?.id) return;
    runSqlite(runtime.sqlite, `
      INSERT OR REPLACE INTO relation_proposals (
        id, source_canonical_name, relation_type, target_canonical_name, status,
        confidence, basis, source_dates_json, timestamp, record_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      relation.id,
      relation.sourceCanonicalName,
      relation.relationType,
      relation.targetCanonicalName,
      relation.status,
      relation.confidence,
      relation.basis,
      JSON.stringify(relation.sourceDates ?? []),
      relation.updatedAt ?? relation.timestamp ?? now(),
      JSON.stringify(relation)
    ]);
  }

  function persistSqliteRelatedConceptHint(hint) {
    if (!runtime.sqlite || !hint?.id) return;
    runSqlite(runtime.sqlite, `
      INSERT OR REPLACE INTO related_concept_hints (
        id, source_canonical_name, hint_canonical_name, rank, score, reason,
        source_explanation_version_id, provider, model, timestamp, record_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      hint.id,
      hint.sourceCanonicalName,
      hint.hintCanonicalName,
      hint.rank,
      hint.score,
      hint.reason,
      hint.sourceExplanationVersionId,
      hint.provider,
      hint.model,
      hint.timestamp,
      JSON.stringify(hint)
    ]);
  }

  function persistSqliteReflectionReport(report) {
    if (!runtime.sqlite || !report?.id) return;
    runSqlite(runtime.sqlite, `
      INSERT OR REPLACE INTO reflection_reports (
        id, kind, date, start_date, end_date, report_json, source_summary_ids_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      report.id,
      report.kind,
      report.date,
      report.startDate,
      report.endDate,
      JSON.stringify(report),
      JSON.stringify(report.sourceSummaryIds ?? []),
      report.createdAt ?? now()
    ]);
  }

  function persistSqliteSummarizerState() {
    if (!runtime.sqlite) return;
    const targets = unique([
      ...(data.summarizer.backlogTargets ?? []),
      ...(data.summarizer.staleTargets ?? [])
    ]);
    for (const target of targets) {
      runSqlite(runtime.sqlite, `
        INSERT OR REPLACE INTO summarizer_jobs (
          id, canonical_name, status, reason, attempts, created_at, updated_at, summarizer_version
        ) VALUES (?, ?, ?, ?, COALESCE((SELECT attempts FROM summarizer_jobs WHERE id = ?), 0), ?, ?, ?)
      `, [
        `summarize_${hashString(target)}`,
        target,
        data.summarizer.lastError ? "failed" : "pending",
        data.summarizer.lastError,
        `summarize_${hashString(target)}`,
        now(),
        now(),
        LOCAL_MEMORY_SUMMARIZER_VERSION
      ]);
    }
    const staleSet = new Set(targets);
    for (const row of allSqlite(runtime.sqlite, "SELECT id, canonical_name FROM summarizer_jobs")) {
      if (!staleSet.has(row.canonical_name) && row.status !== "done") {
        runSqlite(runtime.sqlite, "UPDATE summarizer_jobs SET status = ?, updated_at = ? WHERE id = ?", ["done", now(), row.id]);
      }
    }
  }

  function insertRawEventFts(event) {
    if (!runtime.ftsAvailable) return;
    runSqlite(runtime.sqlite, "INSERT INTO memory_fts(row_kind, record_id, canonical_name, text) VALUES (?, ?, ?, ?)", [
      "raw_event",
      event.id,
      event.canonicalName,
      expandFtsText([event.canonicalName, event.observedAlias, event.type, event.knowledgeType].filter(Boolean).join(" "))
    ]);
  }

  function insertExplanationFts(version) {
    if (!runtime.ftsAvailable) return;
    runSqlite(runtime.sqlite, "INSERT INTO memory_fts(row_kind, record_id, canonical_name, text) VALUES (?, ?, ?, ?)", [
      "explanation_version",
      version.id,
      version.target,
      expandFtsText([version.target, version.text, version.summary].filter(Boolean).join(" "))
    ]);
  }

  function insertRetrievalFts(summary) {
    if (!runtime.ftsAvailable) return;
    runSqlite(runtime.sqlite, "INSERT INTO memory_fts(row_kind, record_id, canonical_name, text) VALUES (?, ?, ?, ?)", [
      "retrieval_summary",
      summary.id ?? summary.canonicalName,
      summary.canonicalName,
      expandFtsText(summary.text ?? JSON.stringify(summary.agentSummary ?? summary))
    ]);
  }

  function scheduleSummarization() {
    if (!autoProcessBacklog || runtime.scheduled || !runtime.available) return;
    runtime.scheduled = true;
    const run = () => {
      if (runtime.closed) return;
      runtime.scheduled = false;
      const result = processStaleTargets({ limit: 20 });
      if (result.status === AgentResultStatus.UNAVAILABLE) {
        data.summarizer.lastError = result.reason;
        persistSqliteSummarizerState();
      }
    };
    const scheduler = globalThis.queueMicrotask ?? ((task) => Promise.resolve().then(task));
    scheduler(run);
  }

  function scheduleProfileRefresh() {
    if (!autoProcessBacklog || !runtime.available || runtime.profileRefreshTimer || !globalThis.setInterval) return;
    const intervalMs = Math.max(1000, Number(config.memory?.cognitive?.profileRefreshIntervalMs ?? 30 * 60 * 1000));
    runtime.profileRefreshTimer = globalThis.setInterval(() => {
      if (runtime.closed) return;
      refreshProfileSummary({ force: false });
    }, intervalMs);
    runtime.profileRefreshTimer?.unref?.();
  }

  function refreshProfileSummary({ force = false } = {}) {
    if (!runtime.available) return unavailableMemory(runtime.reason, { capabilityKind: "memory_query" });
    if (!force && !shouldRefreshProfileSummary()) {
      return {
        status: AgentResultStatus.AVAILABLE,
        refreshed: false,
        profileSummary: data.profileSummary ?? null
      };
    }
    const profileSummary = rebuildProfileSummary();
    persistSqliteProfileSummary();
    return {
      status: AgentResultStatus.AVAILABLE,
      refreshed: true,
      profileSummary
    };
  }

  function shouldRefreshProfileSummary() {
    if (!data.profileSummary) return true;
    const intervalMs = Number(config.memory?.cognitive?.profileRefreshIntervalMs ?? 30 * 60 * 1000);
    const minNewEvents = Number(config.memory?.cognitive?.profileRefreshMinNewEvents ?? 30);
    const allEvents = [...data.events, ...data.profileEvents];
    const eventCount = allEvents.length;
    const previousCount = Number(data.profileSummary.eventCount ?? 0);
    const enoughEvents = eventCount - previousCount >= minNewEvents;
    const oldEnough = now() - Number(data.profileSummary.timestamp ?? 0) >= intervalMs;
    return oldEnough && enoughEvents;
  }

  function processStaleTargets({ limit = Infinity, includeSummaries = false } = {}) {
    const targets = unique([
      ...(data.summarizer.backlogTargets ?? []),
      ...(data.summarizer.staleTargets ?? [])
    ]).slice(0, limit);
    const summaries = [];
    try {
      for (const target of targets) {
        summaries.push(summarizeTarget(target));
      }
      rebuildStaleDailySummaries();
      rebuildProfileSummary();
      persistSqliteProfileSummary();
      persistSqliteSummarizerState();
      return {
        status: AgentResultStatus.AVAILABLE,
        processedTargets: summaries.length,
        ...(includeSummaries ? { summaries } : {})
      };
    } catch (error) {
      data.summarizer.lastError = error?.message ?? String(error);
      persistSqliteSummarizerState();
      return unavailableMemory("memory_summarizer_failed", { details: { message: data.summarizer.lastError } });
    }
  }

  function markTargetStale(canonicalName = "") {
    const target = normalizeKnowledgeObjectName(canonicalName);
    if (!target) return;
    data.summarizer.backlogTargets = unique([...(data.summarizer.backlogTargets ?? []), target]);
    data.summarizer.staleTargets = unique([...(data.summarizer.staleTargets ?? []), target]);
  }

  function removeStaleTarget(canonicalName = "") {
    data.summarizer.backlogTargets = (data.summarizer.backlogTargets ?? []).filter((target) => target !== canonicalName);
    data.summarizer.staleTargets = (data.summarizer.staleTargets ?? []).filter((target) => target !== canonicalName);
  }

  function ensureFreshSummary(canonicalName) {
    const existing = data.derivedSummaries[canonicalName];
    if (!existing || isSummaryStale(canonicalName, existing)) {
      return summarizeTarget(canonicalName);
    }
    return existing;
  }

  function summarizeTarget(canonicalName = "") {
    const target = normalizeKnowledgeObjectName(canonicalName);
    if (!target) return null;
    const objectEvents = data.events.filter((event) => event.canonicalName === target);
    const profileEvents = data.profileEvents.filter((event) => event.canonicalName === target);
    const memoryCandidates = data.memoryCandidates.filter((candidate) => candidate.canonicalName === target);
    const sourceEvents = [...objectEvents, ...profileEvents];
    const sourceEventIds = sourceEvents.map((event) => event.id).filter(Boolean).slice(0, MAX_EVIDENCE_IDS);
    const sourceCandidateIds = memoryCandidates.map((candidate) => candidate.id).filter(Boolean).slice(0, MAX_EVIDENCE_IDS);
    const timestamp = now();
    const packet = buildRetrievalPacket({
      canonicalName: target,
      events: data.events,
      explanationVersions: data.explanationVersions,
      derivedSignals: deriveSignals(objectEvents, memoryCandidates, timestamp, config),
      cooldowns: deriveCooldowns(objectEvents, timestamp, config),
      profileHints: deriveProfileHints(objectEvents, profileEvents, config),
      timestamp,
      maxRelatedObjects: config.knowledge?.maxRelatedObjects ?? 5
    });
    const summary = normalizeDerivedSummary({
      id: `summary_${hashString(target)}`,
      kind: "target_memory_summary",
      canonicalName: target,
      sourceEventIds,
      timestamp,
      schemaVersion: data.schemaVersion,
      summarizerVersion: LOCAL_MEMORY_SUMMARIZER_VERSION,
      targetState: {
        canonicalName: target,
        derivedSignals: packet.derivedSignals,
        firstSeenAt: packet.agentSummary.firstSeenAt,
        recentlySeenAt: packet.agentSummary.recentlySeenAt,
        priorExplanationIds: packet.agentSummary.priorExplanationIds,
        sourceEventIds,
        sourceCandidateIds,
        uncertainty: packet.uncertainty
      },
      profileHints: packet.profileHints,
      feedbackSummary: packet.agentSummary.feedbackSummary,
      explanationPreferences: deriveExplanationPreferences(sourceEvents),
      relatedObjects: packet.relatedObjects,
      cooldowns: packet.cooldowns,
      agentSummary: {
        ...packet.agentSummary,
        sourceRole: "learning_state",
        localMemoryOnly: true
      },
      uncertainty: deriveUncertainty(sourceEvents)
    }, timestamp);
    data.derivedSummaries[target] = summary;
    data.retrievalSummaries[target] = {
      id: `retrieval_${hashString(target)}`,
      canonicalName: target,
      timestamp,
      summarizerVersion: LOCAL_MEMORY_SUMMARIZER_VERSION,
      sourceEventIds,
      sourceCandidateIds,
      text: clampText([
        target,
        packet.agentSummary?.feedbackSummary ? JSON.stringify(packet.agentSummary.feedbackSummary) : "",
        summary.explanationPreferences?.preferredStyle ?? ""
      ].filter(Boolean).join(" "), config.privacy.maxContextChars),
      memoryFreshness: "fresh"
    };
    upsertAgentSummary(summary);
    persistSqliteConceptState(summary);
    persistSqliteRetrievalSummary(data.retrievalSummaries[target]);
    persistSqliteDerivedSummary(summary);
    removeStaleTarget(target);
    data.summarizer.lastRunAt = timestamp;
    data.summarizer.lastError = null;
    data.summarizer.processedEventCount = data.events.length + data.profileEvents.length;
    rebuildConceptProjection(target, { summary });
    persistSqliteSummarizerState();
    return summary;
  }

  function markCognitiveMemoryStale(canonicalName = "", timestamp = now()) {
    const target = normalizeKnowledgeObjectName(canonicalName);
    if (target) {
      data.cognitiveMemory.relationDiscovery.backlogTargets = unique([
        ...(data.cognitiveMemory.relationDiscovery.backlogTargets ?? []),
        target
      ]);
    }
    const date = toMemoryDate(timestamp);
    data.cognitiveMemory.staleDates = unique([...(data.cognitiveMemory.staleDates ?? []), date]);
  }

  function rebuildConceptProjection(canonicalName = "", { summary = null } = {}) {
    const target = normalizeKnowledgeObjectName(canonicalName);
    if (!target) return null;
    const projection = buildConceptProjection({
      canonicalName: target,
      events: data.events,
      profileEvents: data.profileEvents,
      explanationVersions: data.explanationVersions,
      memoryCandidates: data.memoryCandidates,
      timestamp: now(),
      config,
      derivedSignals: summary?.targetState?.derivedSignals,
      uncertainty: summary?.uncertainty
    });
    data.cognitiveMemory.conceptProjections[target] = projection;
    persistSqliteConceptProjection(projection);
    return projection;
  }

  function rebuildDailySummary(date = toMemoryDate(now())) {
    const allNames = unique([
      ...data.events.map((event) => event.canonicalName).filter(Boolean),
      ...data.profileEvents.map((event) => event.canonicalName).filter(Boolean),
      ...data.explanationVersions.map((version) => version.target).filter(Boolean),
      ...data.memoryCandidates.map((candidate) => candidate.canonicalName).filter(Boolean)
    ]);
    for (const target of allNames) {
      if (!data.cognitiveMemory.conceptProjections[target]) rebuildConceptProjection(target);
    }
    const summary = buildDailyMemorySummary({
      date,
      events: data.events,
      profileEvents: data.profileEvents,
      conceptProjections: data.cognitiveMemory.conceptProjections,
      relations: data.cognitiveMemory.relationProposals,
      timestamp: now(),
      config
    });
    data.cognitiveMemory.dailySummaries[date] = summary;
    data.cognitiveMemory.staleDates = (data.cognitiveMemory.staleDates ?? []).filter((entry) => entry !== date);
    persistSqliteDailySummary(summary);
    return summary;
  }

  function rebuildStaleDailySummaries() {
    const dates = unique(data.cognitiveMemory.staleDates ?? []);
    for (const date of dates) rebuildDailySummary(date);
  }

  function normalizeDailySummaryRecord(summary = {}, { now }) {
    if (summary.date && summary.summaryHash) {
      return {
        ...summary,
        summaryVersion: summary.summaryVersion ?? DAILY_SUMMARY_VERSION,
        createdAt: summary.createdAt ?? summary.timestamp ?? now(),
        timestamp: summary.timestamp ?? summary.createdAt ?? now()
      };
    }
    return buildDailyMemorySummary({
      date: summary.date ?? toMemoryDate(summary.timestamp ?? now()),
      events: data.events,
      profileEvents: data.profileEvents,
      conceptProjections: data.cognitiveMemory.conceptProjections,
      relations: data.cognitiveMemory.relationProposals,
      timestamp: summary.timestamp ?? now(),
      config
    });
  }

  function upsertRelationProposal(relation) {
    const evidence = sanitizeRelationEvidence({
      sourceEventIds: relation.sourceEventIds,
      sourceExplanationVersionIds: relation.sourceExplanationVersionIds,
      sourceDates: relation.sourceDates,
      contextHash: relation.contextHash,
      evidenceTextHash: relation.evidenceTextHash,
      sourceKind: relation.sourceKind,
      proposerVersion: relation.proposerVersion,
      confidenceReason: relation.confidenceReason ?? relation.gateReason
    }, config);
    const stored = {
      ...relation,
      sourceEventIds: evidence.sourceEventIds,
      sourceExplanationVersionIds: evidence.sourceExplanationVersionIds,
      sourceDates: evidence.sourceDates,
      contextHash: evidence.contextHash,
      evidenceTextHash: evidence.evidenceTextHash,
      sourceKind: evidence.sourceKind,
      proposerVersion: evidence.proposerVersion,
      confidenceReason: evidence.confidenceReason
    };
    const index = data.cognitiveMemory.relationProposals.findIndex((entry) => entry.id === stored.id);
    if (index >= 0) data.cognitiveMemory.relationProposals[index] = stored;
    else data.cognitiveMemory.relationProposals.push(stored);
    persistSqliteRelationProposal(stored);
    for (const date of stored.sourceDates ?? []) {
      data.cognitiveMemory.staleDates = unique([...(data.cognitiveMemory.staleDates ?? []), date]);
    }
    return stored;
  }

  function writeRelatedConceptHints({
    sourceConcept = "",
    sourceCanonicalName = "",
    relatedConceptHints = [],
    explanationVersionId = null,
    provider = null,
    model = null,
    timestamp = now(),
    profileSummaryId = data.profileSummary?.id ?? null
  } = {}) {
    if (!runtime.available) return unavailableMemory(runtime.reason, { capabilityKind: "memory_event_write" });
    const source = normalizeKnowledgeObjectName(sourceCanonicalName || sourceConcept);
    if (!source || !Array.isArray(relatedConceptHints)) {
      return { status: AgentResultStatus.INVALID, reason: "invalid_related_concept_hints", relatedConceptHints: [] };
    }
    const limit = Math.max(0, Number(config.memory?.cognitive?.relatedConceptHintLimit ?? 20));
    const seen = new Set();
    const normalized = [];
    for (const [index, hint] of relatedConceptHints.entries()) {
      const name = normalizeKnowledgeObjectName(hint?.canonicalName ?? hint?.name ?? hint?.concept ?? hint);
      if (!name || name === source || seen.has(name)) continue;
      seen.add(name);
      normalized.push({
        id: hint?.id ?? `related_hint_${timestamp}_${index}_${hashString(`${source}:${name}:${explanationVersionId ?? ""}`)}`,
        sourceCanonicalName: source,
        hintCanonicalName: name,
        hintAlias: clampText(hint?.observedText ?? hint?.alias ?? name, config.privacy.maxStoredAliasChars),
        rank: normalized.length + 1,
        score: Number.isFinite(Number(hint?.score)) ? Number(Number(hint.score).toFixed(3)) : null,
        reason: clampText(hint?.reason ?? "", 240),
        sourceExplanationVersionId: explanationVersionId,
        sourceEventIds: Array.isArray(hint?.sourceEventIds) ? hint.sourceEventIds.slice(0, MAX_EVIDENCE_IDS) : [],
        provider,
        model,
        profileSummaryId,
        timestamp,
        status: "hint_only"
      });
      if (normalized.length >= limit) break;
    }
    for (const hint of normalized) {
      const existingIndex = data.cognitiveMemory.relatedConceptHints.findIndex((entry) => entry.id === hint.id);
      if (existingIndex >= 0) data.cognitiveMemory.relatedConceptHints[existingIndex] = hint;
      else data.cognitiveMemory.relatedConceptHints.push(hint);
      persistSqliteRelatedConceptHint(hint);
    }
    return {
      status: AgentResultStatus.AVAILABLE,
      relatedConceptHints: normalized
    };
  }

  function selectActiveRelations(canonicalName = "", { limit = config.memory?.cognitive?.maxActiveRelationsPerConcept ?? 20 } = {}) {
    const target = normalizeKnowledgeObjectName(canonicalName);
    return data.cognitiveMemory.relationProposals
      .filter(isRelationUsableForOverlay)
      .filter((relation) => relation.sourceCanonicalName === target || relation.targetCanonicalName === target)
      .sort((left, right) => Number(right.lastSeenAt ?? right.updatedAt ?? 0) - Number(left.lastSeenAt ?? left.updatedAt ?? 0))
      .slice(0, limit);
  }

  function planOverlayRecall(query = {}) {
    const canonicalName = normalizeKnowledgeObjectName(query.canonicalName ?? query.target?.canonicalName ?? "");
    const timestamp = query.timestamp ?? now();
    const goal = query.goal ?? query.requestGoal ?? "micro";
    const relations = selectActiveRelations(canonicalName, {
      limit: config.memory?.cognitive?.maxActiveRelationsPerConcept ?? 20
    });
    const bridges = rankMemoryBridges({
      targetConcept: canonicalName,
      relations,
      conceptProjections: data.cognitiveMemory.conceptProjections,
      timestamp,
      config,
      goal
    });
    const maxBridgeCount = query.maxBridgeCount ?? (goal === "micro"
      ? config.memory?.cognitive?.microBridgeLimit ?? 1
      : config.memory?.cognitive?.expandedBridgeLimit ?? 3);
    return {
      target: canonicalName,
      memoryBridges: bridges.slice(0, maxBridgeCount),
      policy: {
        name: "OverlayRecallPolicy",
        relationDepth: config.memory?.cognitive?.relationDepth ?? 1,
        maxBridgeCount,
        currentExplanationFirst: true,
        memorySourceRole: "local_learning_context",
        caution: "not_fact_source"
      }
    };
  }

  async function discoverPreRecallMemoryBridges({
    canonicalName = "",
    target = null,
    currentContext = null,
    relationProposer = null,
    limit = 20,
    maxBridgeCount = null,
    timestamp = now(),
    goal = "micro"
  } = {}) {
    const targetName = normalizeKnowledgeObjectName(canonicalName || target?.canonicalName || target?.target || "");
    if (!targetName) return { status: AgentResultStatus.INVALID, reason: "missing_target", memoryBridges: [] };
    const candidateBlocks = buildPreRecallCandidateBlocks({
      target: targetName,
      currentContext,
      limit,
      timestamp
    });
    if (!relationProposer || candidateBlocks.length === 0) {
      return {
        status: AgentResultStatus.AVAILABLE,
        target: targetName,
        dailyMemoryBlocks: candidateBlocks,
        relationCandidates: [],
        memoryBridges: [],
        reason: relationProposer ? "no_recall_candidates" : "relation_proposer_unavailable"
      };
    }

    const proposalOutput = await relationProposer({
      targetConcept: { canonicalName: targetName },
      targetConceptName: targetName,
      dayBlocks: candidateBlocks,
      dailyMemoryBlocks: candidateBlocks,
      currentContext,
      contextHash: currentContext?.contextHash ?? null,
      mode: "pre_recall"
    });
    if (proposalOutput?.status && proposalOutput.status !== AgentResultStatus.AVAILABLE) {
      return {
        status: AgentResultStatus.AVAILABLE,
        target: targetName,
        dailyMemoryBlocks: candidateBlocks,
        relationCandidates: [],
        memoryBridges: [],
        proposerStatus: proposalOutput.status,
        proposerReason: proposalOutput.reason ?? proposalOutput.unavailableReason ?? "relation_proposer_unavailable"
      };
    }

    const proposedRelations = (proposalOutput?.relationCandidates ?? []).map((candidate) => {
      const sourceDate = candidate.sourceDate ?? candidateBlocks[0]?.date ?? toMemoryDate(timestamp);
      return gateRelationProposal({
        ...candidate,
        sourceCanonicalName: candidate.sourceCanonicalName ?? targetName,
        sourceDate,
        usableForOverlay: true,
        overlayDisabledExplicitly: false
      }, {
        dayBlocks: candidateBlocks,
        existingRelations: data.cognitiveMemory.relationProposals,
        timestamp,
        targetConcept: targetName,
        config
      });
    });
    const bridgeRelations = proposedRelations.filter(isRelationUsableForOverlay);
    const memoryBridges = rankMemoryBridges({
      targetConcept: targetName,
      relations: bridgeRelations,
      conceptProjections: data.cognitiveMemory.conceptProjections,
      timestamp,
      config,
      goal
    }).slice(0, maxBridgeCount ?? config.memory?.cognitive?.expandedBridgeLimit ?? 3);
    return {
      status: AgentResultStatus.AVAILABLE,
      target: targetName,
      dailyMemoryBlocks: candidateBlocks,
      relationCandidates: proposedRelations,
      memoryBridges,
      recallPolicy: {
        name: "PreRecallTopKPolicy",
        candidateLimit: limit,
        maxBridgeCount: maxBridgeCount ?? config.memory?.cognitive?.expandedBridgeLimit ?? 3,
        memorySourceRole: "local_learning_context",
        caution: "not_fact_source"
      }
    };
  }

  function buildPreRecallCandidateBlocks({ target = "", currentContext = null, limit = 20, timestamp = now() } = {}) {
    const candidates = selectTopKRecallCandidates({ target, currentContext, limit, timestamp });
    const byDate = new Map();
    for (const candidate of candidates) {
      const date = candidate.date || toMemoryDate(candidate.timestamp ?? timestamp);
      const block = byDate.get(date) ?? {
        date,
        summaryHash: `pre_recall_${hashString(date)}`,
        topics: [],
        concepts: [],
        relations: []
      };
      if (!block.concepts.some((concept) => concept.canonicalName === candidate.canonicalName)) {
        block.concepts.push({
          canonicalName: candidate.canonicalName,
          sourceRole: candidate.sourceRole ?? "learned_concept",
          projection: data.cognitiveMemory.conceptProjections[candidate.canonicalName] ?? null,
          recallReason: candidate.reason,
          score: Number(Number(candidate.score ?? 0).toFixed(3))
        });
      }
      byDate.set(date, block);
    }
    return [...byDate.values()];
  }

  function selectTopKRecallCandidates({ target = "", currentContext = null, limit = 20, timestamp = now() } = {}) {
    const targetName = normalizeKnowledgeObjectName(target);
    const scored = new Map();
    const addCandidate = (canonicalName, score, meta = {}) => {
      const name = normalizeKnowledgeObjectName(canonicalName);
      if (!name || name === targetName) return;
      const previous = scored.get(name);
      const profilePriority = recallProfilePriorityForConcept(name);
      if (profilePriority.suppressed) return;
      const nextScore = Number(score ?? 0) + profilePriority.score;
      const timestampValue = meta.timestamp ?? previous?.timestamp ?? timestamp;
      if (!previous || nextScore > previous.score) {
        scored.set(name, {
          canonicalName: name,
          score: nextScore,
          reason: meta.reason ?? previous?.reason ?? "candidate",
          timestamp: timestampValue,
          date: meta.date ?? previous?.date ?? toMemoryDate(timestampValue),
          sourceRole: meta.sourceRole ?? previous?.sourceRole ?? "learned_concept",
          profilePriorityReason: profilePriority.reason
        });
      }
    };

    for (const [index, event] of [...data.events, ...data.profileEvents]
      .filter((event) => event.canonicalName)
      .sort((left, right) => Number(right.timestamp ?? 0) - Number(left.timestamp ?? 0))
      .slice(0, Math.max(limit * 2, 20))
      .entries()) {
      addCandidate(event.canonicalName, 70 - index, {
        reason: "recent_memory_event",
        timestamp: event.timestamp
      });
    }

    for (const [index, version] of data.explanationVersions
      .filter((version) => version.target)
      .sort((left, right) => Number(right.timestamp ?? 0) - Number(left.timestamp ?? 0))
      .slice(0, Math.max(limit, 10))
      .entries()) {
      addCandidate(version.target, 62 - index, {
        reason: "recent_explanation",
        timestamp: version.timestamp
      });
    }

    for (const [index, projection] of Object.values(data.cognitiveMemory.conceptProjections ?? {})
      .sort((left, right) => Number(right.lastSeenAt ?? right.timestamp ?? 0) - Number(left.lastSeenAt ?? left.timestamp ?? 0))
      .slice(0, Math.max(limit * 2, 20))
      .entries()) {
      addCandidate(projection.canonicalName, 45 - index + Math.min(Number(projection.seenCount ?? 0), 10), {
        reason: "concept_projection",
        timestamp: projection.lastSeenAt ?? projection.timestamp
      });
    }

    for (const [index, summary] of Object.values(data.cognitiveMemory.dailySummaries ?? {})
      .sort((left, right) => String(right.date).localeCompare(String(left.date)))
      .slice(0, config.memory?.cognitive?.selectedDayLimit ?? 8)
      .flatMap((summary) => (summary.conceptRefs ?? []).map((concept) => ({ summary, concept })))
      .entries()) {
      addCandidate(summaryConceptName(summary, summary.concept), 35 - index, {
        reason: "daily_summary",
        date: summary.summary.date,
        timestamp: summary.summary.timestamp ?? summary.summary.createdAt ?? timestamp
      });
    }

    for (const [index, row] of queryFtsRecallCandidates({ target: targetName, currentContext, limit }).entries()) {
      addCandidate(row.canonicalName, 100 - index, {
        reason: "fts_top_k",
        timestamp: row.timestamp ?? timestamp
      });
    }

    for (const [index, hint] of selectRelatedConceptHintCandidates({ target: targetName, limit }).entries()) {
      addCandidate(hint.sourceCanonicalName, 88 - index + Number(hint.score ?? 0), {
        reason: "related_concept_hint",
        timestamp: hint.timestamp ?? timestamp,
        sourceRole: "related_concept_hint"
      });
    }

    return [...scored.values()]
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }

  function recallProfilePriorityForConcept(canonicalName = "") {
    const name = normalizeKnowledgeObjectName(canonicalName);
    if (!name) return { score: 0, reason: null, suppressed: false };
    const events = [...data.events, ...data.profileEvents].filter((event) => event.canonicalName === name);
    const knowledgeType = latestKnowledgeTypeForConcept(name, events);
    const summaryHints = data.derivedSummaries[name]?.profileHints ?? {};
    const profileHints = mergeProfileHintsForTarget(data.profileSummary?.hints ?? {}, summaryHints, { knowledgeType });
    const projection = data.cognitiveMemory.conceptProjections[name] ?? null;
    if (profileHints.objectMuted || profileHints.categoryMuted || projection?.derivedSignals?.[DerivedSignal.OBJECT_MUTED]) {
      return { score: 0, reason: "profile_muted", suppressed: true };
    }
    const highDifficulty = projection?.estimatedDifficulty === "high";
    const mediumDifficulty = projection?.estimatedDifficulty === "medium";
    if (profileHints.difficultObject || profileHints.categoryDifficulty || highDifficulty) {
      return { score: highDifficulty ? 22 : 18, reason: "profile_difficulty", suppressed: false };
    }
    if (mediumDifficulty || profileHints.explanationDetail === "more_detailed") {
      return { score: 10, reason: "profile_review", suppressed: false };
    }
    return { score: 0, reason: null, suppressed: false };
  }

  function selectRelatedConceptHintCandidates({ target = "", limit = 20 } = {}) {
    const hintTarget = normalizeKnowledgeObjectName(target);
    if (!hintTarget) return [];
    const max = Math.max(0, Number(config.memory?.cognitive?.relatedConceptHintCandidateLimit ?? 8));
    return data.cognitiveMemory.relatedConceptHints
      .filter((hint) => hint?.status === "hint_only" && hint.hintCanonicalName === hintTarget && hint.sourceCanonicalName !== hintTarget)
      .sort((left, right) =>
        Number(right.score ?? 0) - Number(left.score ?? 0) ||
        Number(right.timestamp ?? 0) - Number(left.timestamp ?? 0))
      .slice(0, Math.min(limit, max));
  }

  function queryFtsRecallCandidates({ target = "", currentContext = null, limit = 20 } = {}) {
    if (!runtime.sqlite || !runtime.ftsAvailable) return [];
    const match = buildFtsMatchExpression([
      target,
      currentContext?.text,
      currentContext?.title
    ]);
    const rows = [];
    try {
      if (match) {
        rows.push(...allSqlite(runtime.sqlite, `
          SELECT canonical_name AS canonicalName, row_kind AS rowKind, record_id AS recordId
          FROM memory_fts
          WHERE memory_fts MATCH ?
          GROUP BY canonical_name
          ORDER BY bm25(memory_fts)
          LIMIT ?
        `, [match, limit]).filter((row) => row.canonicalName));
      }
    } catch {
      // FTS5 tokenization differs across runtimes; fall back to indexed text below.
    }
    if (rows.length > 0) return rows;
    const terms = buildFtsLikeTerms([target, currentContext?.text, currentContext?.title]);
    const seen = new Set();
    for (const term of terms) {
      const pattern = `%${term}%`;
      for (const row of allSqlite(runtime.sqlite, `
        SELECT canonical_name AS canonicalName, row_kind AS rowKind, record_id AS recordId
        FROM memory_fts
        WHERE canonical_name LIKE ? OR text LIKE ?
        GROUP BY canonical_name
        LIMIT ?
      `, [pattern, pattern, limit])) {
        if (!row.canonicalName || seen.has(row.canonicalName)) continue;
        seen.add(row.canonicalName);
        rows.push(row);
        if (rows.length >= limit) return rows;
      }
    }
    return rows;
  }

  function summaryConceptName(summary, concept) {
    return concept?.canonicalName ?? concept?.name ?? concept?.target ?? "";
  }

  async function runRelationDiscovery({
    canonicalName = "",
    relationProposer = null,
    daySelector = null,
    explanationVersion = null,
    currentContext = null
  } = {}) {
    const target = normalizeKnowledgeObjectName(canonicalName);
    if (!target) return { status: AgentResultStatus.INVALID, reason: "missing_target" };
    data.cognitiveMemory.relationDiscovery.status = "running";
    data.cognitiveMemory.relationDiscovery.lastRunAt = now();
    try {
      rebuildStaleDailySummaries();
      const summaries = Object.values(data.cognitiveMemory.dailySummaries)
        .sort((left, right) => String(right.date).localeCompare(String(left.date)))
        .slice(0, config.memory?.cognitive?.dailySummaryWindowDays ?? 30);
      const relevantDays = daySelector
        ? daySelector({ targetConcept: target, dailySummaries: summaries })
        : selectRelevantDays({
            targetConcept: target,
            dailySummaries: summaries,
            limit: config.memory?.cognitive?.selectedDayLimit ?? 8
          });
      const dayBlocks = buildDayConceptBlocks({
        dates: relevantDays,
        dailySummaries: summaries,
        conceptProjections: data.cognitiveMemory.conceptProjections,
        relations: data.cognitiveMemory.relationProposals
      });
      const cacheKey = hashString(JSON.stringify({
        target,
        days: dayBlocks.map((block) => [block.date, block.summaryHash]),
        version: config.memory?.cognitive?.relationProposalCacheVersion
      }));
      let proposalOutput = relationProposer ? data.cognitiveMemory.relationProposalCache[cacheKey] : null;
      if (proposalOutput) {
        data.cognitiveMemory.relationDiscovery.cacheHits += 1;
      } else {
        data.cognitiveMemory.relationDiscovery.cacheMisses += 1;
        proposalOutput = relationProposer
          ? await relationProposer({
              targetConcept: { canonicalName: target },
              targetConceptName: target,
              dayBlocks,
              dailyMemoryBlocks: dayBlocks,
              explanationVersion,
              currentContext,
              contextHash: currentContext?.contextHash ?? null
            })
          : { relationCandidates: [], rejectedCandidates: [], skippedReason: "relation_proposer_unavailable" };
        if (relationProposer && (!proposalOutput?.status || proposalOutput.status === AgentResultStatus.AVAILABLE)) {
          data.cognitiveMemory.relationProposalCache[cacheKey] = proposalOutput;
        }
      }
      if (proposalOutput?.status && proposalOutput.status !== AgentResultStatus.AVAILABLE) {
        data.cognitiveMemory.relationDiscovery.status = "degraded";
        data.cognitiveMemory.relationDiscovery.lastError = proposalOutput.reason ?? proposalOutput.unavailableReason ?? "relation_proposer_unavailable";
        data.cognitiveMemory.relationDiscovery.backlogTargets = (data.cognitiveMemory.relationDiscovery.backlogTargets ?? []).filter((entry) => entry !== target);
        return {
          status: AgentResultStatus.AVAILABLE,
          target,
          relevantDays,
          dayBlocks,
          relationCandidates: [],
          rejectedCandidates: [],
          proposerStatus: proposalOutput.status,
          proposerReason: data.cognitiveMemory.relationDiscovery.lastError,
          concurrencyLimit: config.memory?.cognitive?.relationProposalConcurrency ?? 3,
          cacheKey
        };
      }
      const candidates = Array.isArray(proposalOutput?.relationCandidates) ? proposalOutput.relationCandidates : [];
      const stored = candidates.map((candidate) => {
        const sourceDate = candidate.sourceDate ?? dayBlocks[0]?.date ?? "";
        return upsertRelationProposal(gateRelationProposal({
          ...candidate,
          sourceCanonicalName: candidate.sourceCanonicalName ?? target,
          sourceDate,
          usableForOverlay: true,
          overlayDisabledExplicitly: false
        }, {
          dayBlocks,
          existingRelations: data.cognitiveMemory.relationProposals,
          timestamp: now(),
          targetConcept: target,
          config
        }));
      });
      data.cognitiveMemory.relationDiscovery.status = "idle";
      data.cognitiveMemory.relationDiscovery.lastError = null;
      data.cognitiveMemory.relationDiscovery.backlogTargets = (data.cognitiveMemory.relationDiscovery.backlogTargets ?? []).filter((entry) => entry !== target);
      return {
        status: AgentResultStatus.AVAILABLE,
        target,
        relevantDays,
        dayBlocks,
        relationCandidates: stored,
        rejectedCandidates: proposalOutput?.rejectedCandidates ?? [],
        concurrencyLimit: config.memory?.cognitive?.relationProposalConcurrency ?? 3,
        cacheKey
      };
    } catch (error) {
      data.cognitiveMemory.relationDiscovery.status = "degraded";
      data.cognitiveMemory.relationDiscovery.lastError = error?.message ?? String(error);
      return unavailableMemory("relation_discovery_failed", { details: { message: data.cognitiveMemory.relationDiscovery.lastError } });
    }
  }

  function persistReflectionReport(report) {
    const index = data.cognitiveMemory.reflectionReports.findIndex((entry) => entry.id === report.id);
    if (index >= 0) data.cognitiveMemory.reflectionReports[index] = report;
    else data.cognitiveMemory.reflectionReports.push(report);
    persistSqliteReflectionReport(report);
    return report;
  }

  function rebuildProfileSummary() {
    const allEvents = [...data.events, ...data.profileEvents];
    const promotableCandidates = data.memoryCandidates.filter((candidate) => candidate.status !== "rejected");
    const timestamp = now();
    data.profileSummary = {
      id: "profile_summary",
      kind: "profile_memory_summary",
      sourceEventIds: allEvents.map((event) => event.id).filter(Boolean).slice(-MAX_EVIDENCE_IDS),
      sourceCandidateIds: promotableCandidates.map((candidate) => candidate.id).filter(Boolean).slice(-MAX_EVIDENCE_IDS),
      timestamp,
      eventCount: allEvents.length,
      lastEventAt: Math.max(...allEvents.map((event) => Number(event.timestamp ?? 0)), 0) || null,
      summarizerVersion: LOCAL_MEMORY_SUMMARIZER_VERSION,
      hints: deriveProfileHints(allEvents, [], config),
      interests: deriveInterestProfile(allEvents, data.cognitiveMemory.conceptProjections, config),
      explanationPreferences: deriveExplanationPreferences(allEvents),
      uncertainty: deriveUncertainty(allEvents)
    };
    return data.profileSummary;
  }

  function upsertAgentSummary(summary) {
    const agentSummary = {
      id: summary.id,
      canonicalName: summary.canonicalName,
      sourceEventIds: summary.sourceEventIds,
      uncertainty: summary.uncertainty?.confidence ?? "low",
      timestamp: summary.timestamp,
      summary: summary.agentSummary
    };
    const index = data.agentSummaries.findIndex((entry) => entry.id === agentSummary.id);
    if (index >= 0) data.agentSummaries[index] = agentSummary;
    else data.agentSummaries.push(agentSummary);
  }

  function summarizeMigrations() {
    const latest = data.migrations.at(-1) ?? null;
    return {
      schemaVersion: data.schemaVersion,
      latest,
      count: data.migrations.length
    };
  }

  function summarizeRuntimeState() {
    const staleTargets = unique([
      ...(data.summarizer.backlogTargets ?? []),
      ...(data.summarizer.staleTargets ?? [])
    ]);
    return {
      enabled: true,
      version: LOCAL_MEMORY_SUMMARIZER_VERSION,
      status: data.summarizer.lastError ? "degraded" : "available",
      reason: data.summarizer.lastError ?? null,
      backlogSize: staleTargets.length,
      staleTargets: staleTargets.length,
      lastRunAt: data.summarizer.lastRunAt ?? null,
      processedEventCount: data.summarizer.processedEventCount ?? 0
    };
  }

  function summarizeCognitiveMemoryState() {
    return {
      version: COGNITIVE_MEMORY_VERSION,
      dailySummaryCount: Object.keys(data.cognitiveMemory.dailySummaries ?? {}).length,
      conceptProjectionCount: Object.keys(data.cognitiveMemory.conceptProjections ?? {}).length,
      relationProposalCount: data.cognitiveMemory.relationProposals?.length ?? 0,
      activeRelationCount: (data.cognitiveMemory.relationProposals ?? []).filter((relation) => relation.status === "active").length,
      relatedConceptHintCount: data.cognitiveMemory.relatedConceptHints?.length ?? 0,
      reflectionReportCount: data.cognitiveMemory.reflectionReports?.length ?? 0,
      staleDateCount: data.cognitiveMemory.staleDates?.length ?? 0,
      relationDiscovery: {
        status: data.cognitiveMemory.relationDiscovery.status,
        backlogSize: data.cognitiveMemory.relationDiscovery.backlogTargets?.length ?? 0,
        lastRunAt: data.cognitiveMemory.relationDiscovery.lastRunAt,
        lastError: data.cognitiveMemory.relationDiscovery.lastError,
        cacheHits: data.cognitiveMemory.relationDiscovery.cacheHits ?? 0,
        cacheMisses: data.cognitiveMemory.relationDiscovery.cacheMisses ?? 0,
        concurrencyLimit: config.memory?.cognitive?.relationProposalConcurrency ?? 3
      },
      reportVersions: {
        dailySummary: DAILY_SUMMARY_VERSION,
        reflectionReport: REFLECTION_REPORT_VERSION
      }
    };
  }

  function isSummaryStale(canonicalName, summary = null) {
    if (!summary) return true;
    if (summary.summarizerVersion !== LOCAL_MEMORY_SUMMARIZER_VERSION) return true;
    if (summary.schemaVersion !== data.schemaVersion) return true;
    return (data.summarizer.staleTargets ?? []).includes(canonicalName);
  }
}

export function createPersistentLocalMemoryStore({ directory, ...options } = {}) {
  return createLocalMemoryStore({ ...options, persistence: { directory } });
}

export function resolveDefaultLocalMemoryStorePath({ env = globalThis.process?.env ?? {}, cwd = globalThis.process?.cwd?.() ?? "." } = {}) {
  if (env.BCO_GATEWAY_MEMORY_DIR) return resolve(env.BCO_GATEWAY_MEMORY_DIR);
  return resolve(cwd, ".bco-memory");
}

function createEmptyStoreData({ schemaVersion }) {
  return {
    schemaVersion,
    events: [],
    profileEvents: [],
    explanationVersions: [],
    memoryCandidates: [],
    agentSummaries: [],
    graphEdges: [],
    vectors: [],
    migrations: [],
    derivedSummaries: {},
    profileSummary: null,
    retrievalSummaries: {},
    cognitiveMemory: createEmptyCognitiveMemoryState(),
    summarizer: {
      version: LOCAL_MEMORY_SUMMARIZER_VERSION,
      backlogTargets: [],
      staleTargets: [],
      lastRunAt: null,
      lastError: null,
      processedEventCount: 0
    }
  };
}

function loadSQLiteBackedData({ directory, schemaVersion, now }) {
  mkdirSync(directory, { recursive: true });
  const databasePath = join(directory, SQLITE_FILE);
  try {
    const opened = openSQLiteDatabase(databasePath);
    const currentVersion = readSqliteUserVersion(opened.db);
    if (currentVersion > schemaVersion) {
      opened.db.close?.();
      return {
        data: createEmptyStoreData({ schemaVersion: currentVersion }),
        unavailableReason: "memory_schema_unsupported",
        databasePath,
        sqliteDriver: opened.driver
      };
    }
    initializeSQLiteSchema(opened.db, { schemaVersion, now });
    const storeSchemaVersion = readSQLiteSchemaVersion(opened.db);
    const data = readSQLiteStoreData(opened.db, schemaVersion);
    return {
      data,
      sqlite: opened.db,
      sqliteDriver: opened.driver,
      databasePath,
      ftsAvailable: detectSQLiteFts(opened.db)
    };
  } catch (error) {
    return {
      data: createEmptyStoreData({ schemaVersion }),
      unavailableReason: "memory_sqlite_unavailable",
      migrationError: error?.message ?? String(error),
      databasePath,
      sqliteDriver: null,
      ftsAvailable: false
    };
  }
}

function openSQLiteDatabase(databasePath) {
  try {
    const BetterSqlite3 = require("better-sqlite3");
    return { db: new BetterSqlite3(databasePath), driver: "better-sqlite3" };
  } catch {
    const { DatabaseSync } = require("node:sqlite");
    return { db: new DatabaseSync(databasePath), driver: "node:sqlite" };
  }
}

function initializeSQLiteSchema(db, { schemaVersion, now }) {
  db.exec("PRAGMA journal_mode = DELETE");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      from_version INTEGER,
      to_version INTEGER NOT NULL,
      status TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      type TEXT,
      details_json TEXT
    );
    CREATE TABLE IF NOT EXISTS raw_memory_events (
      id TEXT PRIMARY KEY,
      repository TEXT NOT NULL,
      type TEXT NOT NULL,
      canonical_name TEXT NOT NULL,
      observed_alias TEXT,
      timestamp INTEGER NOT NULL,
      knowledge_type TEXT,
      explanation_version_id TEXT,
      previous_explanation_version_id TEXT,
      requested_style TEXT,
      explanation_style TEXT,
      fact_sensitivity TEXT,
      feedback_event_id TEXT,
      context_json TEXT NOT NULL,
      source_event_ids_json TEXT NOT NULL,
      uncertainty_json TEXT,
      related_concepts_json TEXT NOT NULL,
      record_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_raw_memory_events_target_time ON raw_memory_events(canonical_name, timestamp);
    CREATE TABLE IF NOT EXISTS explanation_versions (
      id TEXT PRIMARY KEY,
      target TEXT NOT NULL,
      style TEXT,
      text TEXT NOT NULL,
      summary TEXT,
      confidence TEXT,
      timestamp INTEGER NOT NULL,
      previous_version_id TEXT,
      feedback_event_id TEXT,
      fact_sensitivity TEXT,
      status TEXT,
      source TEXT,
      provider TEXT,
      model TEXT,
      schema_name TEXT,
      prompt_version TEXT,
      structured_response_json TEXT NOT NULL,
      context_summary_json TEXT NOT NULL,
      terms_json TEXT NOT NULL,
      actions_json TEXT NOT NULL,
      record_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_explanation_versions_target_time ON explanation_versions(target, timestamp);
    CREATE TABLE IF NOT EXISTS memory_candidates (
      id TEXT PRIMARY KEY,
      canonical_name TEXT NOT NULL,
      kind TEXT NOT NULL,
      signal TEXT NOT NULL,
      status TEXT NOT NULL,
      uncertainty TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      source_event_ids_json TEXT NOT NULL,
      source_candidate_ids_json TEXT NOT NULL,
      source_explanation_version_id TEXT,
      provider TEXT,
      model TEXT,
      metadata_json TEXT NOT NULL,
      record_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_memory_candidates_target_status ON memory_candidates(canonical_name, status);
    CREATE TABLE IF NOT EXISTS concept_states (
      canonical_name TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      source_event_ids_json TEXT NOT NULL,
      source_candidate_ids_json TEXT NOT NULL,
      uncertainty_json TEXT,
      timestamp INTEGER NOT NULL,
      summarizer_version TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS profile_summary (
      id TEXT PRIMARY KEY,
      summary_json TEXT NOT NULL,
      source_event_ids_json TEXT NOT NULL,
      source_candidate_ids_json TEXT NOT NULL,
      uncertainty_json TEXT,
      timestamp INTEGER NOT NULL,
      summarizer_version TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS retrieval_summaries (
      canonical_name TEXT PRIMARY KEY,
      summary_json TEXT NOT NULL,
      text TEXT NOT NULL,
      source_event_ids_json TEXT NOT NULL,
      source_candidate_ids_json TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      summarizer_version TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS summarizer_jobs (
      id TEXT PRIMARY KEY,
      canonical_name TEXT NOT NULL,
      status TEXT NOT NULL,
      reason TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      summarizer_version TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_summarizer_jobs_status ON summarizer_jobs(status, canonical_name);
    CREATE TABLE IF NOT EXISTS daily_memory_summaries (
      date TEXT PRIMARY KEY,
      summary_hash TEXT NOT NULL,
      summary_json TEXT NOT NULL,
      source_event_ids_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      summarizer_version TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_daily_memory_summaries_created ON daily_memory_summaries(created_at);
    CREATE TABLE IF NOT EXISTS concept_projections (
      canonical_name TEXT PRIMARY KEY,
      projection_json TEXT NOT NULL,
      source_event_ids_json TEXT NOT NULL,
      source_candidate_ids_json TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      summarizer_version TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_concept_projections_timestamp ON concept_projections(timestamp);
    CREATE TABLE IF NOT EXISTS relation_proposals (
      id TEXT PRIMARY KEY,
      source_canonical_name TEXT NOT NULL,
      relation_type TEXT NOT NULL,
      target_canonical_name TEXT NOT NULL,
      status TEXT NOT NULL,
      confidence TEXT NOT NULL,
      basis TEXT NOT NULL,
      source_dates_json TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      record_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_relation_proposals_source ON relation_proposals(source_canonical_name, status);
    CREATE INDEX IF NOT EXISTS idx_relation_proposals_target ON relation_proposals(target_canonical_name, status);
    CREATE TABLE IF NOT EXISTS related_concept_hints (
      id TEXT PRIMARY KEY,
      source_canonical_name TEXT NOT NULL,
      hint_canonical_name TEXT NOT NULL,
      rank INTEGER NOT NULL,
      score REAL,
      reason TEXT,
      source_explanation_version_id TEXT,
      provider TEXT,
      model TEXT,
      timestamp INTEGER NOT NULL,
      record_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_related_concept_hints_hint ON related_concept_hints(hint_canonical_name, timestamp);
    CREATE INDEX IF NOT EXISTS idx_related_concept_hints_source ON related_concept_hints(source_canonical_name, timestamp);
    CREATE TABLE IF NOT EXISTS reflection_reports (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      date TEXT,
      start_date TEXT,
      end_date TEXT,
      report_json TEXT NOT NULL,
      source_summary_ids_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reflection_reports_range ON reflection_reports(kind, date, start_date, end_date);
  `);
  try {
    db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(row_kind, record_id UNINDEXED, canonical_name, text)");
  } catch {
    // FTS5 is optional; exact and recency retrieval still work.
  }
  const currentVersion = readSqliteUserVersion(db);
  if (currentVersion < schemaVersion) {
    runSqlite(db, `
      INSERT OR REPLACE INTO schema_migrations (
        id, from_version, to_version, status, timestamp, type, details_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      `sqlite_schema_${now()}`,
      currentVersion,
      schemaVersion,
      "completed",
      now(),
      "schema_migration",
      JSON.stringify({ sqliteSchemaVersion: SQLITE_SCHEMA_VERSION })
    ]);
    db.exec(`PRAGMA user_version = ${Number(schemaVersion)}`);
  }
}

function readSqliteUserVersion(db) {
  const row = getSqlite(db, "PRAGMA user_version");
  return Number(row?.user_version ?? 0);
}

function readSQLiteSchemaVersion(db) {
  return readSqliteUserVersion(db);
}

function readSQLiteStoreData(db, schemaVersion) {
  const data = createEmptyStoreData({ schemaVersion });
  const rawEvents = allSqlite(db, "SELECT record_json FROM raw_memory_events ORDER BY timestamp ASC");
  for (const row of rawEvents) {
    const event = parseJson(row.record_json, null);
    if (!event) continue;
    if (event.repository === "profile") data.profileEvents.push(event);
    else data.events.push(event);
  }
  data.explanationVersions = allSqlite(db, "SELECT record_json FROM explanation_versions ORDER BY timestamp ASC")
    .map((row) => parseJson(row.record_json, null))
    .filter(Boolean);
  data.memoryCandidates = allSqlite(db, "SELECT record_json FROM memory_candidates ORDER BY timestamp ASC")
    .map((row) => parseJson(row.record_json, null))
    .filter(Boolean);
  data.migrations = allSqlite(db, "SELECT * FROM schema_migrations ORDER BY timestamp ASC").map((row) => ({
    id: row.id,
    fromVersion: row.from_version,
    toVersion: row.to_version,
    status: row.status,
    timestamp: row.timestamp,
    type: row.type,
    details: parseJson(row.details_json, null)
  }));
  const profile = getSqlite(db, "SELECT summary_json FROM profile_summary WHERE id = ?", ["profile_summary"]);
  data.profileSummary = profile ? parseJson(profile.summary_json, null) : null;
  const retrievalRows = allSqlite(db, "SELECT canonical_name, summary_json FROM retrieval_summaries");
  for (const row of retrievalRows) {
    const summary = parseJson(row.summary_json, null);
    if (!summary) continue;
    data.retrievalSummaries[row.canonical_name] = summary;
    if (summary.kind === "target_memory_summary" || summary.targetState) {
      data.derivedSummaries[row.canonical_name] = summary;
      data.agentSummaries.push({
        id: summary.id,
        canonicalName: summary.canonicalName,
        sourceEventIds: summary.sourceEventIds ?? [],
        uncertainty: summary.uncertainty?.confidence ?? "low",
        timestamp: summary.timestamp,
        summary: summary.agentSummary ?? {}
      });
    }
  }
  for (const row of allSqlite(db, "SELECT date, summary_json FROM daily_memory_summaries")) {
    const summary = parseJson(row.summary_json, null);
    if (summary) data.cognitiveMemory.dailySummaries[row.date] = summary;
  }
  for (const row of allSqlite(db, "SELECT canonical_name, projection_json FROM concept_projections")) {
    const projection = parseJson(row.projection_json, null);
    if (projection) data.cognitiveMemory.conceptProjections[row.canonical_name] = projection;
  }
  data.cognitiveMemory.relationProposals = allSqlite(db, "SELECT record_json FROM relation_proposals ORDER BY timestamp ASC")
    .map((row) => parseJson(row.record_json, null))
    .filter(Boolean);
  data.cognitiveMemory.relatedConceptHints = allSqlite(db, "SELECT record_json FROM related_concept_hints ORDER BY timestamp ASC")
    .map((row) => parseJson(row.record_json, null))
    .filter(Boolean);
  data.cognitiveMemory.reflectionReports = allSqlite(db, "SELECT report_json FROM reflection_reports ORDER BY created_at ASC")
    .map((row) => parseJson(row.report_json, null))
    .filter(Boolean);
  const jobs = allSqlite(db, "SELECT * FROM summarizer_jobs WHERE status != 'done'");
  data.summarizer.backlogTargets = unique(jobs.map((job) => job.canonical_name));
  data.summarizer.staleTargets = [...data.summarizer.backlogTargets];
  const failed = jobs.find((job) => job.status === "failed");
  data.summarizer.lastError = failed?.reason ?? null;
  const latestDone = getSqlite(db, "SELECT updated_at FROM summarizer_jobs WHERE status = 'done' ORDER BY updated_at DESC LIMIT 1");
  data.summarizer.lastRunAt = latestDone?.updated_at ?? null;
  data.summarizer.processedEventCount = data.events.length + data.profileEvents.length;
  return data;
}

function detectSQLiteFts(db) {
  try {
    allSqlite(db, "SELECT rowid FROM memory_fts LIMIT 1");
    return true;
  } catch {
    return false;
  }
}

function runSqlite(db, sql, params = []) {
  const statement = db.prepare(sql);
  try {
    return statement.run(...params);
  } finally {
    disposeStatement(statement);
  }
}

function getSqlite(db, sql, params = []) {
  const statement = db.prepare(sql);
  try {
    return statement.get(...params);
  } finally {
    disposeStatement(statement);
  }
}

function allSqlite(db, sql, params = []) {
  const statement = db.prepare(sql);
  try {
    return statement.all(...params);
  } finally {
    disposeStatement(statement);
  }
}

function buildFtsMatchExpression(values = []) {
  const terms = unique(values
    .flatMap((value) => String(value ?? "").split(/[\s,.;:!?()[\]{}"'，。；：！？、（）【】《》]+/u))
    .map((term) => term.replace(/[^\p{L}\p{N}_-]+/gu, "").trim())
    .filter((term) => term.length >= 2)
    .slice(0, 8));
  return terms.map((term) => `"${term.replaceAll('"', '""')}"`).join(" OR ");
}

function buildFtsLikeTerms(values = []) {
  return unique(values
    .flatMap((value) => [
      String(value ?? ""),
      ...String(value ?? "").split(/[\s,.;:!?()[\]{}"'，。；：！？、（）【】《》]+/u)
    ])
    .map((term) => term.replace(/[^\p{L}\p{N}_-]+/gu, "").trim())
    .filter((term) => term.length >= 2)
    .slice(0, 8));
}

function expandFtsText(value = "") {
  const text = String(value ?? "");
  const grams = [];
  for (const match of text.matchAll(/\p{Script=Han}+/gu)) {
    const run = match[0];
    for (let size = 2; size <= 4; size += 1) {
      for (let index = 0; index <= run.length - size; index += 1) {
        grams.push(run.slice(index, index + size));
      }
    }
  }
  return unique([text, ...grams]).join(" ");
}

function disposeStatement(statement) {
  try {
    statement?.[Symbol.dispose]?.();
  } catch {
    // better-sqlite3 statements do not need disposal; node:sqlite statements do.
  }
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeStoreData(data = {}, schemaVersion) {
  return {
    ...createEmptyStoreData({ schemaVersion }),
    ...data,
    schemaVersion: Number(data.schemaVersion ?? schemaVersion),
    events: Array.isArray(data.events) ? data.events : [],
    profileEvents: Array.isArray(data.profileEvents) ? data.profileEvents : [],
    explanationVersions: Array.isArray(data.explanationVersions) ? data.explanationVersions : [],
    memoryCandidates: Array.isArray(data.memoryCandidates) ? data.memoryCandidates : [],
    agentSummaries: Array.isArray(data.agentSummaries) ? data.agentSummaries : [],
    graphEdges: Array.isArray(data.graphEdges) ? data.graphEdges : [],
    vectors: Array.isArray(data.vectors) ? data.vectors : [],
    migrations: Array.isArray(data.migrations) ? data.migrations : [],
    derivedSummaries: data.derivedSummaries && typeof data.derivedSummaries === "object" ? data.derivedSummaries : {},
    retrievalSummaries: data.retrievalSummaries && typeof data.retrievalSummaries === "object" ? data.retrievalSummaries : {},
    cognitiveMemory: normalizeCognitiveMemoryState(data.cognitiveMemory),
    profileSummary: data.profileSummary ?? null,
    summarizer: {
      ...createEmptyStoreData({ schemaVersion }).summarizer,
      ...(data.summarizer ?? {}),
      version: LOCAL_MEMORY_SUMMARIZER_VERSION
    }
  };
}

function initializeStaleTargets(data) {
  const targets = unique([
    ...data.events.map((event) => event.canonicalName).filter(Boolean),
    ...data.profileEvents.map((event) => event.canonicalName).filter(Boolean),
    ...data.explanationVersions.map((version) => version.target).filter(Boolean),
    ...data.memoryCandidates.map((candidate) => candidate.canonicalName).filter(Boolean)
  ]);
  const stale = targets.filter((target) => {
    const summary = data.derivedSummaries[target];
    return !summary ||
      summary.summarizerVersion !== LOCAL_MEMORY_SUMMARIZER_VERSION ||
      summary.schemaVersion !== data.schemaVersion;
  });
  data.summarizer.backlogTargets = unique([...(data.summarizer.backlogTargets ?? []), ...stale]);
  data.summarizer.staleTargets = unique([...(data.summarizer.staleTargets ?? []), ...stale]);
  const dates = unique([
    ...data.events.map((event) => toMemoryDate(event.timestamp)),
    ...data.profileEvents.map((event) => toMemoryDate(event.timestamp)),
    ...data.explanationVersions.map((version) => toMemoryDate(version.timestamp))
  ]);
  const staleDates = dates.filter((date) => !data.cognitiveMemory.dailySummaries[date]);
  data.cognitiveMemory.staleDates = unique([...(data.cognitiveMemory.staleDates ?? []), ...staleDates]);
}

function normalizeMemoryEvent(event = {}, { repository, config, now, index }) {
  const timestamp = event.timestamp ?? now();
  const canonicalName = normalizeKnowledgeObjectName(event.canonicalName ?? event.concept ?? "");
  const needsKnowledgeContext = event.knowledgeType ||
    event.explanationVersionId ||
    event.requestedStyle ||
    event.previousExplanationVersionId ||
    FEEDBACK_TYPES.has(event.type);
  const context = needsKnowledgeContext
    ? sanitizeKnowledgeContext({
        ...(event.context ?? {}),
        knowledgeType: event.knowledgeType ?? event.context?.knowledgeType,
        explanationVersionId: event.explanationVersionId,
        previousExplanationVersionId: event.previousExplanationVersionId,
        requestedStyle: event.requestedStyle,
        feedbackType: event.feedbackType ?? event.type
      }, config)
    : sanitizeEventContext(event.context ?? {}, config);

  return {
    id: event.id ?? `local_evt_${timestamp}_${index}`,
    type: event.type ?? "unknown",
    repository,
    canonicalName,
    observedAlias: clampText(event.observedAlias ?? event.concept ?? canonicalName, config.privacy.maxStoredAliasChars),
    timestamp,
    context,
    knowledgeType: event.knowledgeType ?? event.context?.knowledgeType ?? null,
    explanationVersionId: event.explanationVersionId ?? event.context?.explanationVersionId ?? null,
    previousExplanationVersionId: event.previousExplanationVersionId ?? event.context?.previousExplanationVersionId ?? null,
    requestedStyle: event.requestedStyle ?? event.context?.requestedStyle ?? null,
    explanationStyle: event.explanationStyle ?? null,
    factSensitivity: event.factSensitivity ?? null,
    feedbackEventId: event.feedbackEventId ?? null,
    relationId: event.relationId ?? null,
    bridgeConcept: event.bridgeConcept ? normalizeKnowledgeObjectName(event.bridgeConcept) : null,
    relationType: event.relationType ?? null,
    sourceRole: event.sourceRole ?? null,
    sourceEventIds: Array.isArray(event.sourceEventIds) ? event.sourceEventIds.slice(0, MAX_EVIDENCE_IDS) : [],
    uncertainty: event.uncertainty ?? null,
    relatedConcepts: Array.isArray(event.relatedConcepts ?? event.relatedObjects)
      ? (event.relatedConcepts ?? event.relatedObjects).slice(0, config.knowledge?.maxRelatedObjects ?? 5)
      : []
  };
}

function normalizeExplanation(version = {}, { config, now, index }) {
  const timestamp = version.timestamp ?? now();
  const safe = sanitizeExplanationVersion({
    ...version,
    timestamp,
    target: normalizeKnowledgeObjectName(version.target ?? version.canonicalName ?? version.concept ?? "")
  }, config);
  return {
    ...safe,
    id: safe.id ?? `local_ver_${timestamp}_${index}`,
    timestamp
  };
}

function normalizeMemoryCandidate(candidate = {}, { config, now, index }) {
  const timestamp = candidate.timestamp ?? now();
  const canonicalName = normalizeKnowledgeObjectName(candidate.canonicalName ?? candidate.target ?? candidate.concept ?? "");
  return {
    id: candidate.id ?? `local_candidate_${timestamp}_${index}`,
    canonicalName,
    kind: candidate.kind ?? "learning_signal",
    signal: clampText(candidate.signal ?? candidate.reason ?? candidate.type ?? "candidate", config.privacy.maxStoredAliasChars),
    status: candidate.status ?? "pending",
    uncertainty: candidate.uncertainty ?? "low",
    timestamp,
    sourceEventIds: Array.isArray(candidate.sourceEventIds) ? candidate.sourceEventIds.slice(0, MAX_EVIDENCE_IDS) : [],
    sourceCandidateIds: Array.isArray(candidate.sourceCandidateIds) ? candidate.sourceCandidateIds.slice(0, MAX_EVIDENCE_IDS) : [],
    sourceExplanationVersionId: candidate.sourceExplanationVersionId ?? candidate.explanationVersionId ?? null,
    provider: candidate.provider ?? candidate.versionMetadata?.provider ?? null,
    model: candidate.model ?? candidate.versionMetadata?.model ?? null,
    metadata: sanitizeCandidateMetadata(candidate.metadata ?? candidate)
  };
}

function createCandidateFromEvent(event = {}) {
  const signal = feedbackSignalForEvent(event);
  if (!signal) return null;
  return {
    canonicalName: event.canonicalName,
    kind: "feedback_signal",
    signal,
    status: "pending",
    uncertainty: "low",
    timestamp: event.timestamp,
    sourceEventIds: event.id ? [event.id] : [],
    sourceExplanationVersionId: event.explanationVersionId ?? null,
    metadata: {
      type: event.type,
      requestedStyle: event.requestedStyle,
      explanationVersionId: event.explanationVersionId
    }
  };
}

function feedbackSignalForEvent(event = {}) {
  if (event.type === MemoryEventType.MARKED_CONFUSING || event.type === MemoryEventType.REQUESTED_SIMPLER) return "too_hard";
  if (event.type === MemoryEventType.REQUESTED_MORE_CONTEXT || event.type === MemoryEventType.EXPANDED) return "needs_review";
  if (event.type === MemoryEventType.MARKED_WRONG) return "low_trust";
  if (event.type === MemoryEventType.MARKED_KNOWN) return "possibly_familiar";
  if (event.type === MemoryEventType.MUTED_OBJECT || event.type === MemoryEventType.MUTED_CATEGORY) return "muted";
  return null;
}

function normalizeDerivedSummary(summary = {}, timestamp) {
  return {
    ...summary,
    schemaVersion: summary.schemaVersion ?? DEFAULT_CONFIG.memory.schemaVersion,
    sourceEventIds: Array.isArray(summary.sourceEventIds) ? summary.sourceEventIds.slice(0, MAX_EVIDENCE_IDS) : [],
    timestamp: summary.timestamp ?? timestamp,
    summarizerVersion: summary.summarizerVersion ?? LOCAL_MEMORY_SUMMARIZER_VERSION,
    uncertainty: summary.uncertainty ?? { confidence: "low", reason: "limited_events" }
  };
}

function deriveSignals(events, candidates = [], timestamp, config) {
  const recent = (type, windowMs) => events.filter((event) => event.type === type && timestamp - event.timestamp <= windowMs);
  const repeatedConfusion = events.filter((event) => event.type === MemoryEventType.REPEATED_CONFUSION).length;
  const expansions = events.filter((event) => event.type === MemoryEventType.EXPANDED).length;
  const dismissals = recent(MemoryEventType.DISMISSED, 30 * 60 * 1000).length;
  const recentSeen = recent(MemoryEventType.RECENTLY_SEEN, 30 * 60 * 1000).length;
  const markedKnown = recent(MemoryEventType.MARKED_KNOWN, config.profile?.feedbackCooldownMs ?? 30 * 60 * 1000).length;
  const markedWrong = recent(MemoryEventType.MARKED_WRONG, config.profile?.feedbackCooldownMs ?? 30 * 60 * 1000).length;
  const markedConfusing = events.filter((event) => [
    MemoryEventType.MARKED_CONFUSING,
    MemoryEventType.REQUESTED_SIMPLER,
    MemoryEventType.REQUESTED_MORE_CONTEXT
  ].includes(event.type)).length;
  const pendingCandidates = candidates.filter((candidate) => candidate.status !== "rejected");
  const candidateSignals = new Set(pendingCandidates.map((candidate) => candidate.signal));
  return {
    [DerivedSignal.POSSIBLY_WEAK]: repeatedConfusion >= 2 || expansions >= 2 || candidateSignals.has("possible_unfamiliar"),
    [DerivedSignal.NEEDS_REVIEW]: repeatedConfusion >= 1 || expansions >= 2 || candidateSignals.has("needs_review"),
    [DerivedSignal.POSSIBLY_FAMILIAR]: recentSeen >= 2 && repeatedConfusion === 0,
    [DerivedSignal.RECENTLY_EXPLAINED]: recent(MemoryEventType.EXPLANATION_SHOWN, config.inference.recentlyExplainedCooldownMs).length > 0,
    [DerivedSignal.LOW_INTERVENTION_PREFERRED]: dismissals >= 2 || markedKnown > 0,
    [DerivedSignal.RECENTLY_MARKED_KNOWN]: markedKnown > 0,
    [DerivedSignal.POSSIBLY_CONFUSING]: markedConfusing >= 1 || candidateSignals.has("too_hard"),
    [DerivedSignal.CAUTION_REQUIRED]: markedWrong > 0 || candidateSignals.has("low_trust"),
    [DerivedSignal.OBJECT_MUTED]: events.some((event) => event.type === MemoryEventType.MUTED_OBJECT) || candidateSignals.has("muted")
  };
}

function deriveCooldowns(events, timestamp, config) {
  return {
    recentDismissal: hasRecentEvent(events, MemoryEventType.DISMISSED, timestamp, config.inference.dismissalCooldownMs),
    recentlyExplained: hasRecentEvent(events, MemoryEventType.EXPLANATION_SHOWN, timestamp, config.inference.recentlyExplainedCooldownMs),
    paragraph: false
  };
}

function deriveProfileHints(events, profileEvents, config) {
  const allEvents = [...events, ...profileEvents];
  const simpler = allEvents.filter((event) => event.type === MemoryEventType.REQUESTED_SIMPLER || event.requestedStyle === "simpler");
  const moreContext = allEvents.filter((event) => event.type === MemoryEventType.REQUESTED_MORE_CONTEXT || event.requestedStyle === "background");
  const confusing = allEvents.filter((event) => event.type === MemoryEventType.MARKED_CONFUSING || event.type === MemoryEventType.REQUESTED_MORE_CONTEXT);
  const known = allEvents.filter((event) => event.type === MemoryEventType.MARKED_KNOWN);
  const wrong = allEvents.filter((event) => event.type === MemoryEventType.MARKED_WRONG);
  const mutedObject = allEvents.some((event) => event.type === MemoryEventType.MUTED_OBJECT);
  const mutedKnowledgeTypes = unique(allEvents
    .filter((event) => event.type === MemoryEventType.MUTED_CATEGORY && event.knowledgeType)
    .map((event) => event.knowledgeType));
  const difficultKnowledgeTypes = unique(confusing
    .filter((event) => event.knowledgeType)
    .map((event) => event.knowledgeType));
  const preferredStyle = simpler.length >= (config.profile?.stylePreferenceThreshold ?? 2)
    ? ExplanationStyle.SIMPLER
    : (moreContext.length >= (config.profile?.stylePreferenceThreshold ?? 2) || confusing.length > 0)
      ? ExplanationStyle.BACKGROUND
      : null;
  const needsDetail = confusing.length > 0 || preferredStyle === ExplanationStyle.BACKGROUND;

  return {
    categoryInterest: 0,
    categoryMuted: allEvents.some((event) => event.type === MemoryEventType.MUTED_CATEGORY),
    objectMuted: mutedObject,
    familiarObject: known.length > 0,
    difficultObject: confusing.length > 0,
    categoryDifficulty: difficultKnowledgeTypes.length > 0,
    cautionRequired: wrong.length > 0,
    preferredStyle,
    explanationDetail: needsDetail ? "more_detailed" : "standard",
    mutedKnowledgeTypes,
    difficultKnowledgeTypes,
    uncertainty: deriveUncertainty(allEvents),
    evidenceEventIds: allEvents.map((event) => event.id).filter(Boolean).slice(0, MAX_EVIDENCE_IDS)
  };
}

function mergeProfileHintsForTarget(globalHints = {}, targetHints = {}, { knowledgeType = null } = {}) {
  const scopedGlobal = scopeProfileHintsToKnowledgeType(globalHints, { knowledgeType, global: true });
  const scopedTarget = scopeProfileHintsToKnowledgeType(targetHints, { knowledgeType, global: false });
  const mutedKnowledgeTypes = unique([
    ...(scopedGlobal.mutedKnowledgeTypes ?? []),
    ...(scopedTarget.mutedKnowledgeTypes ?? [])
  ]);
  const difficultKnowledgeTypes = unique([
    ...(scopedGlobal.difficultKnowledgeTypes ?? []),
    ...(scopedTarget.difficultKnowledgeTypes ?? [])
  ]);
  const categoryDifficulty = Boolean(scopedGlobal.categoryDifficulty || scopedTarget.categoryDifficulty);
  const difficultObject = Boolean(scopedGlobal.difficultObject || scopedTarget.difficultObject || categoryDifficulty);
  const preferredStyle = scopedTarget.preferredStyle ?? scopedGlobal.preferredStyle ??
    (difficultObject ? ExplanationStyle.BACKGROUND : null);
  const explanationDetail = scopedTarget.explanationDetail === "more_detailed" || scopedGlobal.explanationDetail === "more_detailed" ||
    difficultObject || preferredStyle === ExplanationStyle.BACKGROUND
    ? "more_detailed"
    : scopedTarget.explanationDetail ?? scopedGlobal.explanationDetail ?? "standard";

  return {
    ...scopedGlobal,
    ...scopedTarget,
    mutedKnowledgeTypes,
    difficultKnowledgeTypes,
    categoryMuted: Boolean(scopedGlobal.categoryMuted || scopedTarget.categoryMuted),
    objectMuted: Boolean(scopedGlobal.objectMuted || scopedTarget.objectMuted),
    categoryDifficulty,
    difficultObject,
    preferredStyle,
    explanationDetail
  };
}

function scopeProfileHintsToKnowledgeType(hints = {}, { knowledgeType = null, global = false } = {}) {
  const scoped = { ...(hints ?? {}) };
  const mutedKnowledgeTypes = Array.isArray(hints?.mutedKnowledgeTypes) ? hints.mutedKnowledgeTypes : [];
  const difficultKnowledgeTypes = Array.isArray(hints?.difficultKnowledgeTypes) ? hints.difficultKnowledgeTypes : [];
  if (mutedKnowledgeTypes.length > 0) {
    scoped.categoryMuted = knowledgeType ? mutedKnowledgeTypes.includes(knowledgeType) : Boolean(hints.categoryMuted);
  }
  if (difficultKnowledgeTypes.length > 0) {
    scoped.categoryDifficulty = knowledgeType ? difficultKnowledgeTypes.includes(knowledgeType) : Boolean(hints.categoryDifficulty);
  }
  if (global) {
    scoped.objectMuted = false;
    if (mutedKnowledgeTypes.length > 0 && knowledgeType) scoped.categoryMuted = mutedKnowledgeTypes.includes(knowledgeType);
    if (difficultKnowledgeTypes.length > 0 && knowledgeType) scoped.categoryDifficulty = difficultKnowledgeTypes.includes(knowledgeType);
    scoped.difficultObject = Boolean(scoped.categoryDifficulty);
  }
  if (scoped.categoryDifficulty) scoped.difficultObject = true;
  if ((scoped.difficultObject || scoped.categoryDifficulty) && !scoped.preferredStyle) {
    scoped.preferredStyle = ExplanationStyle.BACKGROUND;
  }
  if ((scoped.difficultObject || scoped.categoryDifficulty || scoped.preferredStyle === ExplanationStyle.BACKGROUND) && !scoped.explanationDetail) {
    scoped.explanationDetail = "more_detailed";
  }
  return scoped;
}

function latestKnowledgeTypeForConcept(canonicalName = "", events = []) {
  const target = normalizeKnowledgeObjectName(canonicalName);
  return [...events]
    .filter((event) => event.canonicalName === target && event.knowledgeType)
    .sort((left, right) => Number(right.timestamp ?? 0) - Number(left.timestamp ?? 0))[0]?.knowledgeType ?? null;
}

function deriveInterestProfile(events = [], conceptProjections = {}, config = DEFAULT_CONFIG) {
  const conceptLimit = Math.min(20, config.memory?.cognitive?.reportConceptLimit ?? 12);
  const recentConcepts = unique(events
    .filter((event) => event.canonicalName)
    .sort((left, right) => Number(right.timestamp ?? 0) - Number(left.timestamp ?? 0))
    .map((event) => event.canonicalName))
    .slice(0, conceptLimit);
  const knowledgeTypeCounts = new Map();
  for (const event of events) {
    if (!event.knowledgeType) continue;
    knowledgeTypeCounts.set(event.knowledgeType, (knowledgeTypeCounts.get(event.knowledgeType) ?? 0) + 1);
  }
  const difficultConcepts = Object.values(conceptProjections ?? {})
    .filter((projection) => projection.estimatedDifficulty === "high" || projection.repeatedConfusionCount > 0)
    .sort((left, right) => Number(right.lastSeenAt ?? 0) - Number(left.lastSeenAt ?? 0))
    .slice(0, conceptLimit)
    .map((projection) => projection.canonicalName);
  return {
    recentConcepts,
    knowledgeTypes: [...knowledgeTypeCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count })),
    difficultConcepts
  };
}

function deriveExplanationPreferences(events) {
  const styleCounts = {};
  const evidenceEventIds = [];
  for (const event of events) {
    const style = event.requestedStyle ||
      (event.type === MemoryEventType.REQUESTED_SIMPLER ? ExplanationStyle.SIMPLER : null) ||
      (event.type === MemoryEventType.REQUESTED_MORE_CONTEXT ? ExplanationStyle.BACKGROUND : null) ||
      (event.type === MemoryEventType.MARKED_CONFUSING ? ExplanationStyle.BACKGROUND : null);
    if (!style) continue;
    styleCounts[style] = (styleCounts[style] ?? 0) + 1;
    if (event.id) evidenceEventIds.push(event.id);
  }
  const preferredStyle = Object.entries(styleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    preferredStyle,
    styleCounts,
    evidenceEventIds: evidenceEventIds.slice(0, MAX_EVIDENCE_IDS),
    uncertainty: evidenceEventIds.length >= 2
      ? { confidence: "medium", reason: "repeated_style_feedback" }
      : { confidence: "low", reason: "limited_style_feedback" }
  };
}

function deriveUncertainty(events) {
  return {
    confidence: events.length >= 3 ? "medium" : "low",
    reason: events.length >= 3 ? "multiple_events" : "limited_events"
  };
}

function sanitizeCandidateMetadata(metadata = {}) {
  return {
    reason: metadata.reason ?? null,
    type: metadata.type ?? null,
    requestedStyle: metadata.requestedStyle ?? null,
    explanationVersionId: metadata.explanationVersionId ?? metadata.sourceExplanationVersionId ?? null,
    provider: metadata.provider ?? metadata.versionMetadata?.provider ?? null,
    model: metadata.model ?? metadata.versionMetadata?.model ?? null
  };
}

function hasRecentEvent(events, type, timestamp, windowMs) {
  return events.some((event) => event.type === type && timestamp - event.timestamp <= windowMs);
}

function unavailableMemory(reason, extra = {}) {
  return {
    status: AgentResultStatus.UNAVAILABLE,
    reason,
    unavailableReason: reason,
    mode: MemoryRepositoryMode.LOCAL_GATEWAY,
    shared: true,
    ...extra
  };
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}
