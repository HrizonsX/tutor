// @ts-nocheck
import { DEFAULT_CONFIG } from "../shared/config.js";
import { unique } from "../shared/collection-util.js";
import {
  AgentCapability,
  AgentRequestGoal,
  AgentResultStatus,
  AgentStreamProtocolVersion,
  DerivedSignal,
  ExplanationStyle,
  MemoryEventType,
  ProviderKind,
  StreamEventType,
  StreamLane
} from "../shared/contracts.js";
import { normalizeKnowledgeObjectName } from "../shared/concepts.js";
import { isRelationUsableForOverlay } from "./cognitive-memory.js";
import { clampText, hashString, safeUrlMetadata, sanitizeEventContext } from "../shared/privacy.js";

const MEMORY_FIELD_NAMES = new Set([
  "memoryPacket",
  "memorySummary",
  "profileHints",
  "priorExplanations",
  "feedbackEvents",
  "feedbackHistory",
  "conceptFamiliarity",
  "derivedSummaries",
  "preferenceSummaries",
  "retrievalSummary",
  "profileSummary",
  "conceptProjection",
  "conceptProjections",
  "dailySummary",
  "dailySummaries",
  "memoryBridges",
  "relationProposals",
  "relationCandidates",
  "reportContext",
  "reflectionReport"
]);

const NOISE_RE = /^[^\p{L}\p{N}]+$/u;

export function createRuntimeExplainPipeline({
  store,
  config = DEFAULT_CONFIG,
  relationProposer = null,
  relatedConceptHintProvider = null,
  now = () => Date.now(),
  duplicateWindowMs = 30 * 1000
} = {}) {
  const recentRequests = new Map();

  return {
    streamSession({
      request = {},
      directProviderStream = null,
      associationProviderStream = null,
      providerAvailable = true,
      signal = null
    } = {}) {
      const normalized = normalizeRuntimeRequest(request, {
        capabilityKind: AgentCapability.EXPLAIN,
        config,
        now
      });
      return createStreamSession({
        normalized,
        store,
        relationProposer,
        relatedConceptHintProvider,
        directProviderStream,
        associationProviderStream,
        providerAvailable,
        signal,
        config,
        now
      });
    },
    async handle({
      request = {},
      capabilityKind = AgentCapability.EXPLAIN,
      providerCall = null,
      providerAvailable = true
    } = {}) {
      const normalized = normalizeRuntimeRequest(request, { capabilityKind, config, now });
      const inputDecision = filterInput(normalized, { config });
      if (inputDecision) {
        const result = runtimeDecisionResult(inputDecision, normalized, {
          providerCallStatus: "skipped",
          memoryFreshness: null,
          now
        });
        await persistDecisionEvent(store, normalized, result, { now });
        return result;
      }

      const duplicateDecision = detectDuplicate(normalized, recentRequests, { duplicateWindowMs, now });
      if (duplicateDecision) {
        const result = runtimeDecisionResult(duplicateDecision, normalized, {
          providerCallStatus: "skipped",
          memoryFreshness: null,
          now
        });
        await persistDecisionEvent(store, normalized, result, { now });
        return result;
      }

      let memoryPacket = await queryRuntimeMemory(store, normalized, { now });
      const policyDecision = decideExplainPolicy(normalized, memoryPacket, { providerAvailable });
      if (policyDecision.kind !== "call_provider") {
        const result = policyDecision.kind === "return_existing_explanation"
          ? existingExplanationResult(normalized, policyDecision, memoryPacket, { now })
          : runtimeDecisionResult(policyDecision, normalized, {
              providerCallStatus: "skipped",
              memoryFreshness: memoryPacket?.memoryFreshness ?? null,
              now
            });
        await persistDecisionEvent(store, normalized, result, { now, memoryPacket });
        return result;
      }
      memoryPacket = await discoverPreRecallMemory(store, normalized, memoryPacket, { relationProposer, now });

      const providerRequest = applyProfileExplanationPreferences({
        ...normalized,
        memoryPacket: usableMemoryPacket(memoryPacket),
        memorySummary: memoryPacket?.agentSummary ?? {},
        profileHints: memoryPacket?.profileHints ?? {},
        memoryBridges: memoryPacket?.memoryBridges ?? [],
        constraints: {
          ...(normalized.constraints ?? {}),
          memoryStatus: memoryPacket?.repositoryStatus ?? memoryPacket?.memoryFreshness?.status ?? "local_gateway",
          relationDepth: memoryPacket?.recallPolicy?.relationDepth ?? 1,
          maxBridgeCount: memoryPacket?.recallPolicy?.maxBridgeCount ?? 0,
          memoryBridgeCaution: memoryPacket?.recallPolicy?.caution ?? "not_fact_source"
        }
      }, memoryPacket, { config });
      await persistDecisionEvent(store, normalized, {
        status: AgentResultStatus.AVAILABLE,
        runtimeDecision: {
          kind: "call_provider",
          reason: "provider_required",
          providerCallStatus: "started",
          memoryFreshness: memoryPacket?.memoryFreshness ?? null,
          timestamp: now()
        }
      }, { now, memoryPacket });

      const providerResult = providerCall
        ? await providerCall(providerRequest)
        : unavailableResult(normalized, "provider_capability_unsupported", {
            decisionKind: "return_degraded",
            providerCallStatus: "unavailable",
            memoryFreshness: memoryPacket?.memoryFreshness ?? null,
            now
          });
      const finalized = finalizeProviderResult(providerResult, normalized, memoryPacket, { now });
      await persistProviderResult(store, normalized, finalized, { now, memoryPacket, relationProposer });
      return finalized;
    }
  };
}

function createStreamSession({
  normalized,
  store,
  relationProposer = null,
  relatedConceptHintProvider = null,
  directProviderStream = null,
  associationProviderStream = null,
  providerAvailable = true,
  signal = null,
  config,
  now
} = {}) {
  return createAsyncEventStream(async ({ emit }) => {
    const sessionId = normalized.requestId ?? `stream_${now()}_${hashString(normalized.target?.canonicalName ?? "")}`;
    let sequence = 0;
    const emitEvent = (event = {}) => emit({
      schemaVersion: AgentStreamProtocolVersion,
      sessionId,
      sequence: sequence++,
      timestamp: now(),
      ...event
    });
    const inputDecision = filterInput(normalized, { config });

    emitEvent({
      type: StreamEventType.SESSION_START,
      target: normalized.target,
      requestId: normalized.requestId
    });

    if (inputDecision) {
      const result = runtimeDecisionResult(inputDecision, normalized, {
        providerCallStatus: "skipped",
        memoryFreshness: null,
        now
      });
      emitEvent({ type: StreamEventType.LANE_FINAL, lane: StreamLane.DIRECT, result });
      emitEvent({ type: StreamEventType.LANE_FINAL, lane: StreamLane.ASSOCIATION, result });
      emitEvent({ type: StreamEventType.SESSION_DONE, status: result.status });
      return;
    }

    const runDirect = runDirectStreamLane({
      normalized,
      store,
      providerStream: directProviderStream,
      relatedConceptHintProvider,
      providerAvailable,
      signal,
      emitEvent,
      config,
      now
    });
    const runAssociation = runAssociationStreamLane({
      normalized,
      store,
      relationProposer,
      providerStream: associationProviderStream,
      providerAvailable,
      signal,
      emitEvent,
      config,
      now
    });

    await Promise.allSettled([runDirect, runAssociation]);
    emitEvent({
      type: signal?.aborted ? StreamEventType.SESSION_CANCELLED : StreamEventType.SESSION_DONE,
      status: signal?.aborted ? AgentResultStatus.UNAVAILABLE : AgentResultStatus.AVAILABLE,
      reason: signal?.aborted ? "content_cancelled" : null
    });
  });
}

async function runDirectStreamLane({
  normalized,
  store,
  providerStream,
  relatedConceptHintProvider,
  providerAvailable,
  signal,
  emitEvent,
  config = DEFAULT_CONFIG,
  now
}) {
  emitEvent({ type: StreamEventType.LANE_START, lane: StreamLane.DIRECT });
  if (signal?.aborted) {
    emitEvent({
      type: StreamEventType.LANE_FINAL,
      lane: StreamLane.DIRECT,
      result: streamUnavailableResult(normalized, "content_cancelled", StreamLane.DIRECT, { providerCallStatus: "cancelled", now })
    });
    return;
  }
  if (!providerAvailable || !providerStream) {
    emitEvent({
      type: StreamEventType.LANE_FINAL,
      lane: StreamLane.DIRECT,
      result: streamUnavailableResult(normalized, "provider_capability_unsupported", StreamLane.DIRECT, { now })
    });
    return;
  }
  try {
    const profileContext = readProfileContextForRequest(store, normalized);
    const providerRequest = applyProfileExplanationPreferences({
      ...normalized,
      streamLane: StreamLane.DIRECT,
      requestGoal: normalized.requestGoal ?? AgentRequestGoal.MICRO,
      ...(profileContext.profileHints ? { profileHints: profileContext.profileHints } : {})
    }, profileContext, { config });
    const result = await providerStream(providerRequest, {
      lane: StreamLane.DIRECT,
      signal,
      onDelta: (delta = {}) => {
        if (signal?.aborted) return;
        const text = typeof delta === "string" ? delta : delta.text ?? "";
        if (!text) return;
        emitEvent({ type: StreamEventType.LANE_DELTA, lane: StreamLane.DIRECT, text });
      }
    });
    const enriched = await attachDirectRelatedConceptHints({
      result,
      request: providerRequest,
      store,
      relatedConceptHintProvider,
      now
    });
    emitEvent({
      type: StreamEventType.LANE_FINAL,
      lane: StreamLane.DIRECT,
      result: finalizeStreamLaneResult(enriched, normalized, null, StreamLane.DIRECT, { now })
    });
  } catch (error) {
    const result = streamUnavailableResult(
      normalized,
      error?.message === "agent_timeout" ? "agent_timeout" : "provider_unavailable",
      StreamLane.DIRECT,
      { providerCallStatus: "failed", now }
    );
    emitEvent({ type: StreamEventType.LANE_ERROR, lane: StreamLane.DIRECT, result });
    emitEvent({ type: StreamEventType.LANE_FINAL, lane: StreamLane.DIRECT, result });
  }
}

async function attachDirectRelatedConceptHints({
  result,
  request,
  store,
  relatedConceptHintProvider,
  now
} = {}) {
  if (result?.status !== AgentResultStatus.AVAILABLE || !relatedConceptHintProvider) return result;
  try {
    const profileSummary = store?.readProfileSummary?.() ?? null;
    const hintResult = await relatedConceptHintProvider({
      ...request,
      directExplanation: result.text ?? result.microExplanation ?? result.explanation ?? "",
      profileSummary,
      constraints: {
        ...(request.constraints ?? {}),
        relatedConceptHintLimit: request.constraints?.relatedConceptHintLimit ?? DEFAULT_CONFIG.memory.cognitive.relatedConceptHintLimit
      }
    });
    const hints = Array.isArray(hintResult?.relatedConceptHints) ? hintResult.relatedConceptHints : [];
    if (hintResult?.status !== AgentResultStatus.AVAILABLE || hints.length === 0) return result;
    const stored = store?.writeRelatedConceptHints?.({
      sourceConcept: request.target?.canonicalName,
      explanationVersionId: result.explanationVersion?.id ?? result.versionMetadata?.id ?? null,
      relatedConceptHints: hints,
      provider: hintResult.versionMetadata?.provider ?? result.versionMetadata?.provider ?? result.provider ?? null,
      model: hintResult.versionMetadata?.model ?? hintResult.modelName ?? result.versionMetadata?.model ?? result.modelName ?? null,
      profileSummaryId: profileSummary?.id ?? null,
      timestamp: now()
    });
    return {
      ...result,
      relatedConceptHints: hints,
      relatedConceptHintVersion: hintResult.versionMetadata ?? null,
      relatedConceptHintIds: stored?.relatedConceptHints?.map((hint) => hint.id).filter(Boolean) ?? []
    };
  } catch {
    return result;
  }
}

async function runAssociationStreamLane({
  normalized,
  store,
  relationProposer,
  providerStream,
  providerAvailable,
  signal,
  emitEvent,
  config = DEFAULT_CONFIG,
  now
}) {
  emitEvent({ type: StreamEventType.LANE_START, lane: StreamLane.ASSOCIATION });
  if (signal?.aborted) {
    emitEvent({
      type: StreamEventType.LANE_FINAL,
      lane: StreamLane.ASSOCIATION,
      result: streamUnavailableResult(normalized, "content_cancelled", StreamLane.ASSOCIATION, { providerCallStatus: "cancelled", now })
    });
    return;
  }

  let memoryPacket = await queryRuntimeMemory(store, normalized, { now });
  memoryPacket = await discoverPreRecallMemory(store, normalized, memoryPacket, { relationProposer, now });
  const memoryRecall = summarizeMemoryRecall(memoryPacket);
  emitEvent({
    type: StreamEventType.RECALL_STATUS,
    lane: StreamLane.ASSOCIATION,
    status: memoryPacket?.status ?? AgentResultStatus.AVAILABLE,
    memoryRecall,
    bridges: (memoryPacket?.memoryBridges ?? []).slice(0, 3).map(summarizeMemoryBridge)
  });

  const bridges = Array.isArray(memoryPacket?.memoryBridges) ? memoryPacket.memoryBridges : [];
  if (bridges.length === 0) {
    const reason = hasWeakAssociationCandidates(memoryPacket) ? "weak_candidates_only" : "no_memory_bridge";
    emitEvent({
      type: StreamEventType.LANE_FINAL,
      lane: StreamLane.ASSOCIATION,
      result: streamUnavailableResult(normalized, reason, StreamLane.ASSOCIATION, {
        providerCallStatus: "skipped",
        memoryPacket,
        now
      })
    });
    return;
  }

  if (!providerAvailable || !providerStream) {
    emitEvent({
      type: StreamEventType.LANE_FINAL,
      lane: StreamLane.ASSOCIATION,
      result: streamUnavailableResult(normalized, "provider_capability_unsupported", StreamLane.ASSOCIATION, {
        providerCallStatus: "unavailable",
        memoryPacket,
        now
      })
    });
    return;
  }

  try {
    const providerRequest = createAssociationProviderRequest(normalized, memoryPacket, { config });
    const result = await providerStream(providerRequest, {
      lane: StreamLane.ASSOCIATION,
      signal,
      onDelta: (delta = {}) => {
        if (signal?.aborted) return;
        const text = typeof delta === "string" ? delta : delta.text ?? "";
        if (!text) return;
        emitEvent({ type: StreamEventType.LANE_DELTA, lane: StreamLane.ASSOCIATION, text });
      }
    });
    emitEvent({
      type: StreamEventType.LANE_FINAL,
      lane: StreamLane.ASSOCIATION,
      result: finalizeStreamLaneResult(result, normalized, memoryPacket, StreamLane.ASSOCIATION, { now })
    });
  } catch (error) {
    const result = streamUnavailableResult(
      normalized,
      error?.message === "agent_timeout" ? "agent_timeout" : "provider_unavailable",
      StreamLane.ASSOCIATION,
      { providerCallStatus: "failed", memoryPacket, now }
    );
    emitEvent({ type: StreamEventType.LANE_ERROR, lane: StreamLane.ASSOCIATION, result });
    emitEvent({ type: StreamEventType.LANE_FINAL, lane: StreamLane.ASSOCIATION, result });
  }
}

function createAssociationProviderRequest(normalized, memoryPacket, { config = DEFAULT_CONFIG } = {}) {
  const bridges = Array.isArray(memoryPacket?.memoryBridges) ? memoryPacket.memoryBridges : [];
  const selectedBridges = bridges.slice(0, 3);
  return applyProfileExplanationPreferences({
    ...normalized,
    streamLane: StreamLane.ASSOCIATION,
    requestGoal: AgentRequestGoal.ASSOCIATION,
    memoryPacket: usableMemoryPacket(memoryPacket),
    memorySummary: memoryPacket?.agentSummary ?? {},
    profileHints: memoryPacket?.profileHints ?? {},
    memoryBridges: selectedBridges,
    association: {
      bridgeCount: bridges.length,
      selectedBridgeCount: selectedBridges.length,
      overflowBridgeCount: Math.max(0, bridges.length - selectedBridges.length),
      bridges: selectedBridges.map(summarizeMemoryBridge)
    },
    constraints: {
      ...(normalized.constraints ?? {}),
      memoryStatus: memoryPacket?.repositoryStatus ?? memoryPacket?.memoryFreshness?.status ?? "local_gateway",
      relationDepth: memoryPacket?.recallPolicy?.relationDepth ?? 1,
      maxBridgeCount: memoryPacket?.recallPolicy?.maxBridgeCount ?? bridges.length,
      memorySourceRole: memoryPacket?.recallPolicy?.memorySourceRole ?? "local_learning_context",
      memoryBridgeCaution: memoryPacket?.recallPolicy?.caution ?? "not_fact_source"
    }
  }, memoryPacket, { config });
}

function hasWeakAssociationCandidates(memoryPacket = {}) {
  const preRecall = memoryPacket?.preRecall ?? {};
  return Number(preRecall.relationCandidateCount ?? 0) > 0 ||
    Number(preRecall.rejectedCandidateCount ?? 0) > 0 ||
    Number(preRecall.candidateBlockCount ?? 0) > 0;
}

function finalizeStreamLaneResult(providerResult, normalized, memoryPacket, lane, { now }) {
  if (!providerResult || providerResult.status !== AgentResultStatus.AVAILABLE) {
    return streamUnavailableResult(
      normalized,
      providerResult?.reason ?? providerResult?.unavailableReason ?? "provider_unavailable",
      lane,
      { providerCallStatus: "failed", memoryPacket, now, providerResult }
    );
  }
  const text = providerResult.text ?? providerResult.microExplanation ?? providerResult.explanation ?? "";
  const versionMetadata = {
    ...(providerResult.versionMetadata ?? {}),
    id: providerResult.versionMetadata?.id ?? `stream_${lane}_${now()}_${hashString(text)}`,
    target: providerResult.versionMetadata?.target ?? normalized.target?.canonicalName ?? "",
    timestamp: providerResult.versionMetadata?.timestamp ?? now(),
    source: providerResult.versionMetadata?.source ?? "external_agent",
    schema: providerResult.versionMetadata?.schema ?? "bco.explanation.stream.v1",
    streamLane: lane
  };
  return {
    ...providerResult,
    status: AgentResultStatus.AVAILABLE,
    capabilityKind: providerResult.capabilityKind ?? AgentCapability.EXPLAIN,
    target: providerResult.target ?? normalized.target,
    text,
    microExplanation: providerResult.microExplanation ?? text,
    explanation: providerResult.explanation ?? text,
    versionMetadata,
    runtimeDecision: {
      kind: lane === StreamLane.ASSOCIATION ? "call_association_provider" : "call_direct_provider",
      reason: "provider_succeeded",
      providerCallStatus: "succeeded",
      ...(memoryPacket ? { memoryRecall: summarizeMemoryRecall(memoryPacket) } : {}),
      timestamp: now()
    }
  };
}

function streamUnavailableResult(normalized, reason, lane, {
  providerCallStatus = "skipped",
  memoryPacket = null,
  providerResult = null,
  now
} = {}) {
  return {
    ...(providerResult ?? {}),
    status: providerResult?.status ?? AgentResultStatus.UNAVAILABLE,
    reason,
    unavailableReason: reason,
    capabilityKind: AgentCapability.EXPLAIN,
    providerMode: providerResult?.providerMode ?? ProviderKind.LOCAL,
    target: normalized.target,
    text: providerResult?.text ?? "",
    microExplanation: providerResult?.microExplanation ?? "",
    versionMetadata: providerResult?.versionMetadata ?? null,
    runtimeDecision: {
      kind: lane === StreamLane.ASSOCIATION ? "association_unavailable" : "direct_unavailable",
      reason,
      providerCallStatus,
      ...(memoryPacket ? { memoryRecall: summarizeMemoryRecall(memoryPacket) } : {}),
      timestamp: now()
    }
  };
}

function createAsyncEventStream(producer) {
  const queue = [];
  const waiters = [];
  let closed = false;
  let failure = null;
  const emit = (event) => {
    if (closed) return;
    const waiter = waiters.shift();
    if (waiter) waiter.resolve({ value: event, done: false });
    else queue.push(event);
  };
  const close = () => {
    closed = true;
    while (waiters.length) waiters.shift().resolve({ value: undefined, done: true });
  };
  const fail = (error) => {
    failure = error;
    closed = true;
    while (waiters.length) waiters.shift().reject(error);
  };
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    Promise.resolve()
      .then(() => producer({ emit }))
      .then(close, fail);
  };
  return {
    [Symbol.asyncIterator]() {
      start();
      return {
        next() {
          if (queue.length) return Promise.resolve({ value: queue.shift(), done: false });
          if (failure) return Promise.reject(failure);
          if (closed) return Promise.resolve({ value: undefined, done: true });
          return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
        }
      };
    }
  };
}

export function normalizeRuntimeRequest(request = {}, { capabilityKind = AgentCapability.EXPLAIN, config = DEFAULT_CONFIG, now = () => Date.now() } = {}) {
  const stateless = {};
  for (const [key, value] of Object.entries(request ?? {})) {
    if (!MEMORY_FIELD_NAMES.has(key)) stateless[key] = value;
  }
  const rawTarget = stateless.target ?? stateless.targetObject ?? {};
  const canonicalName = normalizeKnowledgeObjectName(rawTarget.canonicalName ?? rawTarget.target ?? stateless.canonicalName ?? stateless.selectedText ?? "");
  const observedText = clampText(rawTarget.observedText ?? stateless.selectedText ?? canonicalName, 120);
  const timestamp = stateless.timestamp ?? now();
  return {
    ...stateless,
    requestId: stateless.requestId ?? `runtime_${timestamp}_${hashString(`${canonicalName}:${capabilityKind}:${observedText}`)}`,
    capabilityKind: stateless.capabilityKind ?? capabilityKind,
    kind: stateless.kind ?? capabilityKind,
    target: {
      canonicalName,
      observedText,
      knowledgeType: rawTarget.knowledgeType ?? "other",
      factSensitivity: rawTarget.factSensitivity ?? "stable"
    },
    selectedText: clampText(stateless.selectedText ?? observedText, 120),
    minimalContext: normalizeMinimalContextMetadata(stateless, config),
    constraints: {
      ...(stateless.constraints ?? {})
    },
    timestamp
  };
}

// Raw page URL and title stop at this normalization boundary: provider
// requests and diagnostics receive only origin + hashes, even when a gateway
// caller still sends raw url/title fields.
function normalizeMinimalContextMetadata(stateless = {}, config) {
  const provided = stateless.minimalContext ?? {};
  const rawUrl = provided.url ?? stateless.url ?? "";
  const rawTitle = provided.title ?? stateless.title ?? "";
  const urlMetadata = rawUrl ? safeUrlMetadata(rawUrl) : null;
  return {
    fragmentId: provided.fragmentId ?? stateless.fragment?.id ?? null,
    fragmentType: provided.fragmentType ?? stateless.fragment?.type ?? null,
    text: clampText(provided.text ?? stateless.fragment?.text ?? "", config.privacy.maxContextChars),
    pageOrigin: String(provided.pageOrigin ?? urlMetadata?.origin ?? "").slice(0, config.privacy.maxStoredUrlChars),
    pagePathHash: provided.pagePathHash ?? urlMetadata?.pathHash ?? null,
    titleHash: provided.titleHash ?? (rawTitle ? hashString(rawTitle) : null),
    language: provided.language ?? stateless.language ?? null
  };
}

function filterInput(request, { config }) {
  const target = request.target?.canonicalName ?? "";
  const observed = request.target?.observedText ?? "";
  const display = target || observed;
  if (!display.trim()) return { kind: "reject_invalid_input", reason: "reject_invalid_input", status: AgentResultStatus.INVALID };
  if (display.length < 2) return { kind: "reject_invalid_input", reason: "reject_invalid_input", status: AgentResultStatus.INVALID };
  if (display.length > (config.privacy?.maxStoredAliasChars ?? 120)) {
    return { kind: "reject_invalid_input", reason: "reject_invalid_input", status: AgentResultStatus.INVALID };
  }
  if (NOISE_RE.test(display) || display.toLowerCase() === "null" || display.toLowerCase() === "undefined") {
    return { kind: "reject_noise", reason: "reject_noise", status: AgentResultStatus.UNAVAILABLE };
  }
  return null;
}

function detectDuplicate(request, recentRequests, { duplicateWindowMs, now }) {
  const key = hashString(JSON.stringify({
    target: request.target?.canonicalName,
    fragmentId: request.minimalContext?.fragmentId,
    text: request.minimalContext?.text,
    capabilityKind: request.capabilityKind,
    style: request.requestedStyle
  }));
  const timestamp = now();
  const previous = recentRequests.get(key);
  recentRequests.set(key, timestamp);
  for (const [entryKey, seenAt] of recentRequests) {
    if (timestamp - seenAt > duplicateWindowMs) recentRequests.delete(entryKey);
  }
  if (previous && timestamp - previous <= duplicateWindowMs) {
    return { kind: "return_degraded", reason: "duplicate_trigger_suppressed", status: AgentResultStatus.UNAVAILABLE };
  }
  return null;
}

async function queryRuntimeMemory(store, request, { now }) {
  if (!store?.queryMemory) {
    return {
      status: AgentResultStatus.UNAVAILABLE,
      reason: "memory_query_unavailable",
      repositoryStatus: "local_gateway_degraded",
      memoryFreshness: { status: "unavailable", lastSummarizedAt: null }
    };
  }
  return await store.queryMemory({
    canonicalName: request.target.canonicalName,
    candidate: request.target,
    timestamp: request.timestamp ?? now(),
    allowSyncSummarize: false
  });
}

async function discoverPreRecallMemory(store, request, memoryPacket, { relationProposer = null, now }) {
  if (!relationProposer || !store?.discoverPreRecallMemoryBridges) return memoryPacket;
  const maxBridgeCount = Number(memoryPacket?.recallPolicy?.maxBridgeCount ?? 3);
  if ((memoryPacket?.memoryBridges?.length ?? 0) >= maxBridgeCount) return memoryPacket;
  const discovery = await store.discoverPreRecallMemoryBridges({
    canonicalName: request.target?.canonicalName,
    target: request.target,
    currentContext: {
      ...(request.minimalContext ?? {}),
      contextHash: hashString(JSON.stringify(request.minimalContext ?? {}))
    },
    relationProposer,
    limit: 20,
    maxBridgeCount,
    timestamp: request.timestamp ?? now(),
    goal: request.capabilityKind === AgentCapability.REWRITE ? "rewrite" : "micro"
  });
  const discoveredBridges = discovery?.memoryBridges ?? [];
  const preRecall = summarizePreRecallDiscovery(discovery, discoveredBridges);
  if (discoveredBridges.length === 0) {
    return {
      ...(memoryPacket ?? {}),
      preRecall
    };
  }
  const mergedBridges = mergeMemoryBridges(memoryPacket?.memoryBridges ?? [], discoveredBridges)
    .slice(0, maxBridgeCount);
  return {
    ...(memoryPacket ?? {}),
    memoryBridges: mergedBridges,
    relatedMemories: mergedBridges,
    preRecallRelations: discovery.relationCandidates ?? [],
    preRecall,
    recallPolicy: {
      ...(memoryPacket?.recallPolicy ?? {}),
      ...(discovery.recallPolicy ?? {}),
      maxBridgeCount
    }
  };
}

function summarizePreRecallDiscovery(discovery = {}, discoveredBridges = []) {
  const relations = Array.isArray(discovery?.relationCandidates) ? discovery.relationCandidates : [];
  const gateRejectReasons = unique(relations
    .filter((relation) => relation?.status !== "active")
    .map((relation) => relation?.gateReason)
    .filter(Boolean)).slice(0, 8);
  return {
    status: discovery?.status ?? AgentResultStatus.UNAVAILABLE,
    reason: discovery?.reason ?? discovery?.proposerReason ?? null,
    candidateBlockCount: discovery?.dailyMemoryBlocks?.length ?? 0,
    relationCandidateCount: relations.length,
    activeCandidateCount: relations.filter((relation) => relation?.status === "active").length,
    overlayEligibleCandidateCount: relations.filter(isRelationUsableForOverlay).length,
    rejectedCandidateCount: relations.filter((relation) => relation?.status === "rejected").length,
    gateRejectReasons,
    gateRejectReasonText: gateRejectReasons.join(","),
    bridgeCount: discoveredBridges.length
  };
}


function mergeMemoryBridges(existing = [], discovered = []) {
  const seen = new Set();
  return [...existing, ...discovered].filter((bridge) => {
    const key = bridge.relationId ?? `${bridge.relatedConcept}:${bridge.relationType}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readProfileContextForRequest(store, request) {
  const knowledgeType = request.target?.knowledgeType ?? null;
  let profileSummary = null;
  let targetSummary = null;
  try {
    profileSummary = store?.readProfileSummary?.() ?? null;
  } catch {
    profileSummary = null;
  }
  try {
    targetSummary = store?.readDerivedSummary?.(request.target?.canonicalName ?? "") ?? null;
  } catch {
    targetSummary = null;
  }
  if (!hasRuntimeProfileHints(profileSummary?.hints) && !hasRuntimeProfileHints(targetSummary?.profileHints)) {
    return {
      profileSummary,
      targetSummary,
      profileHints: null,
      explanationPreferences: targetSummary?.explanationPreferences ?? profileSummary?.explanationPreferences ?? null
    };
  }
  const profileHints = mergeRuntimeProfileHints(
    profileSummary?.hints ?? {},
    targetSummary?.profileHints ?? {},
    { knowledgeType }
  );
  const hasHints = Object.keys(profileHints).length > 0;
  return {
    profileSummary,
    targetSummary,
    profileHints: hasHints ? profileHints : null,
    explanationPreferences: targetSummary?.explanationPreferences ?? profileSummary?.explanationPreferences ?? null
  };
}

function applyProfileExplanationPreferences(request = {}, memoryContext = {}, { config = DEFAULT_CONFIG } = {}) {
  const profileHints = request.profileHints ?? memoryContext?.profileHints ?? null;
  const preferences = memoryContext?.explanationPreferences ?? null;
  const wantsDetail = Boolean(
    profileHints?.explanationDetail === "more_detailed" ||
    profileHints?.difficultObject ||
    profileHints?.categoryDifficulty ||
    memoryContext?.derivedSignals?.[DerivedSignal.POSSIBLY_CONFUSING] ||
    memoryContext?.conceptState?.derivedSignals?.[DerivedSignal.POSSIBLY_CONFUSING]
  );
  const preferredStyle = request.requestedStyle ??
    profileHints?.preferredStyle ??
    preferences?.preferredStyle ??
    (wantsDetail ? ExplanationStyle.BACKGROUND : null);
  const baseMaxChars = Number(request.constraints?.maxChars ?? config.composer?.maxMicroChars ?? 220);
  const detailedMaxChars = Math.round(Number(config.composer?.maxMicroChars ?? 220) * 1.6);
  const maxChars = wantsDetail ? Math.max(baseMaxChars, detailedMaxChars) : baseMaxChars;
  const constraints = {
    ...(request.constraints ?? {}),
    maxChars,
    explanationDetail: wantsDetail ? "more_detailed" : request.constraints?.explanationDetail ?? "standard"
  };
  return {
    ...request,
    ...(profileHints ? { profileHints } : {}),
    ...(preferredStyle ? { requestedStyle: preferredStyle } : {}),
    constraints
  };
}

function mergeRuntimeProfileHints(globalHints = {}, targetHints = {}, { knowledgeType = null } = {}) {
  const scopedGlobal = scopeRuntimeProfileHints(globalHints, { knowledgeType, global: true });
  const scopedTarget = scopeRuntimeProfileHints(targetHints, { knowledgeType, global: false });
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
    : scopedTarget.explanationDetail ?? scopedGlobal.explanationDetail;
  return Object.fromEntries(Object.entries({
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
  }).filter(([, value]) => value !== undefined && value !== null));
}

function scopeRuntimeProfileHints(hints = {}, { knowledgeType = null, global = false } = {}) {
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

function hasRuntimeProfileHints(hints = {}) {
  if (!hints || typeof hints !== "object") return false;
  return Object.entries(hints).some(([, value]) => {
    if (Array.isArray(value)) return value.length > 0;
    return Boolean(value);
  });
}

function decideExplainPolicy(request, memoryPacket, { providerAvailable }) {
  if (memoryPacket?.profileHints?.objectMuted || memoryPacket?.profileHints?.categoryMuted ||
      memoryPacket?.derivedSignals?.[DerivedSignal.OBJECT_MUTED] ||
      memoryPacket?.conceptState?.derivedSignals?.[DerivedSignal.OBJECT_MUTED]) {
    return { kind: "reject_muted", reason: "reject_muted", status: AgentResultStatus.UNAVAILABLE };
  }
  const prior = Array.isArray(memoryPacket?.priorExplanations) ? memoryPacket.priorExplanations.at(-1) : null;
  if (prior?.text && request.capabilityKind !== AgentCapability.REWRITE && !request.constraints?.forceRefresh) {
    return {
      kind: "return_existing_explanation",
      reason: "existing_explanation_available",
      status: AgentResultStatus.AVAILABLE,
      explanation: prior
    };
  }
  if (!providerAvailable) {
    return { kind: "return_degraded", reason: "provider_capability_unsupported", status: AgentResultStatus.UNAVAILABLE };
  }
  return { kind: "call_provider", reason: "provider_required", status: AgentResultStatus.AVAILABLE };
}

function existingExplanationResult(request, decision, memoryPacket, { now }) {
  const explanation = decision.explanation ?? {};
  const versionMetadata = {
    id: explanation.id,
    target: explanation.target ?? request.target.canonicalName,
    style: explanation.style ?? request.requestedStyle ?? null,
    timestamp: explanation.timestamp ?? now(),
    source: explanation.source ?? "runtime_memory",
    provider: explanation.provider ?? "runtime_memory",
    model: explanation.model ?? null,
    reused: true
  };
  return {
    status: AgentResultStatus.AVAILABLE,
    capabilityKind: request.capabilityKind,
    providerMode: ProviderKind.LOCAL,
    target: request.target,
    targetObject: request.target,
    text: explanation.text,
    microExplanation: explanation.text,
    explanation: explanation.text,
    summary: explanation.summary ?? "",
    confidence: explanation.confidence ?? null,
    terms: explanation.terms ?? [],
    actions: explanation.actions ?? [],
    style: explanation.style ?? request.requestedStyle ?? null,
    versionMetadata,
    explanationVersion: { ...explanation, ...versionMetadata, text: explanation.text },
    runtimeDecision: {
      kind: decision.kind,
      reason: decision.reason,
      providerCallStatus: "skipped",
      memoryFreshness: memoryPacket?.memoryFreshness ?? null,
      timestamp: now()
    }
  };
}

function runtimeDecisionResult(decision, request, { providerCallStatus, memoryFreshness, now }) {
  return unavailableResult(request, decision.reason, {
    status: decision.status,
    decisionKind: decision.kind,
    providerCallStatus,
    memoryFreshness,
    now
  });
}

function unavailableResult(request, reason, { status = AgentResultStatus.UNAVAILABLE, decisionKind = "return_degraded", providerCallStatus = "skipped", memoryFreshness = null, now }) {
  return {
    status,
    reason,
    unavailableReason: reason,
    capabilityKind: request.capabilityKind,
    providerMode: ProviderKind.LOCAL,
    target: request.target,
    text: "",
    microExplanation: "",
    versionMetadata: null,
    explanationVersion: null,
    runtimeDecision: {
      kind: decisionKind,
      reason,
      providerCallStatus,
      memoryFreshness,
      timestamp: now()
    }
  };
}

function finalizeProviderResult(providerResult, request, memoryPacket, { now }) {
  if (!providerResult || providerResult.status !== AgentResultStatus.AVAILABLE) {
    return {
      ...(providerResult ?? unavailableResult(request, "provider_unavailable", { now })),
      runtimeDecision: {
        kind: "call_provider",
        reason: providerResult?.reason ?? providerResult?.unavailableReason ?? "provider_unavailable",
        providerCallStatus: "failed",
        memoryFreshness: memoryPacket?.memoryFreshness ?? null,
        persistenceStatus: "not_persisted",
        timestamp: now()
      }
    };
  }
  return {
    ...providerResult,
    runtimeDecision: {
      kind: "call_provider",
      reason: "provider_succeeded",
      providerCallStatus: "succeeded",
      memoryFreshness: memoryPacket?.memoryFreshness ?? null,
      persistenceStatus: "pending",
      timestamp: now()
    }
  };
}

async function persistDecisionEvent(store, request, result, { now, memoryPacket = null } = {}) {
  if (!store?.writeEvent) return null;
  return await store.writeEvent({
    repository: "learning",
    event: {
      id: `runtime_decision_${now()}_${hashString(request.requestId ?? "")}`,
      type: "runtime_explain_decision",
      canonicalName: request.target?.canonicalName,
      observedAlias: request.target?.observedText,
      timestamp: now(),
      context: {
        ...request.minimalContext,
        decisionKind: result.runtimeDecision?.kind,
        decisionReason: result.runtimeDecision?.reason,
        providerCallStatus: result.runtimeDecision?.providerCallStatus,
        memoryStatus: memoryPacket?.repositoryStatus ?? memoryPacket?.reason ?? null
      },
      knowledgeType: request.target?.knowledgeType,
      factSensitivity: request.target?.factSensitivity,
      uncertainty: memoryPacket?.uncertainty ?? null
    }
  });
}

async function persistProviderResult(store, request, result, { now, memoryPacket, relationProposer = null }) {
  if (!store?.writeEvent) return result;
  const status = result.status === AgentResultStatus.AVAILABLE ? "provider_succeeded" : "provider_failed";
  const memoryRecall = summarizeMemoryRecall(memoryPacket);
  const event = await store.writeEvent({
    repository: "learning",
    event: {
      id: `runtime_provider_${now()}_${hashString(`${request.requestId}:${status}`)}`,
      type: status,
      canonicalName: request.target?.canonicalName,
      observedAlias: request.target?.observedText,
      timestamp: now(),
      context: sanitizeEventContext({
        ...request.minimalContext,
        explanationVersionId: result.explanationVersion?.id ?? result.versionMetadata?.id ?? null
      }),
      knowledgeType: request.target?.knowledgeType,
      explanationVersionId: result.explanationVersion?.id ?? result.versionMetadata?.id ?? null,
      factSensitivity: request.target?.factSensitivity,
      uncertainty: memoryPacket?.uncertainty ?? null
    }
  });

  if (result.status !== AgentResultStatus.AVAILABLE) {
    result.runtimeDecision = {
      ...(result.runtimeDecision ?? {}),
      ...(memoryRecall ? { memoryRecall } : {}),
      persistenceStatus: "failure_event_persisted",
      persistedEventId: event?.id ?? null
    };
    return result;
  }

  const version = {
    ...(result.explanationVersion ?? result.versionMetadata ?? {}),
    id: result.explanationVersion?.id ?? result.versionMetadata?.id ?? null,
    target: request.target?.canonicalName,
    style: result.style ?? result.versionMetadata?.style ?? request.requestedStyle ?? null,
    text: result.text ?? result.microExplanation ?? result.explanation ?? "",
    summary: result.summary ?? "",
    confidence: result.confidence ?? null,
    terms: result.terms ?? [],
    actions: result.actions ?? [],
    timestamp: result.versionMetadata?.timestamp ?? now(),
    previousVersionId: result.previousVersionId ?? result.versionMetadata?.previousVersionId ?? request.previousVersion?.id ?? null,
    feedbackEventId: result.feedbackEventId ?? result.versionMetadata?.feedbackEventId ?? request.feedbackEvent?.id ?? null,
    factSensitivity: request.target?.factSensitivity,
    source: result.versionMetadata?.source ?? "external_agent",
    provider: result.versionMetadata?.provider ?? result.provider ?? result.providerMode ?? null,
    model: result.versionMetadata?.model ?? result.model ?? result.modelName ?? null,
    schema: result.versionMetadata?.schema ?? null,
    structuredResponse: {
      explanation: result.explanation ?? result.text ?? "",
      summary: result.summary ?? "",
      confidence: result.confidence ?? null,
      terms: result.terms ?? [],
      actions: result.actions ?? []
    },
    contextSummary: request.minimalContext
  };
  const storedVersion = store.writeExplanationVersion
    ? await store.writeExplanationVersion(version)
    : null;
  const candidates = createCandidatesFromResult(result, request, event, storedVersion, { now });
  const storedCandidates = (await Promise.all(candidates.map((candidate) =>
    store.writeMemoryCandidate?.(candidate)
  ))).filter(Boolean);
  const committedPreRecallRelations = await commitPreRecallRelations(store, memoryPacket);
  const usedBridgeEvents = await recordUsedMemoryBridges(store, request, memoryPacket, storedVersion, { now });
  await store.scheduleRelationDiscovery?.({
    target: request.target,
    explanationVersion: storedVersion,
    relationProposer,
    currentContext: {
      ...(request.minimalContext ?? {}),
      contextHash: hashString(JSON.stringify(request.minimalContext ?? {}))
    }
  });
  result.runtimeDecision = {
    ...(result.runtimeDecision ?? {}),
    ...(memoryRecall ? { memoryRecall } : {}),
    persistenceStatus: "persisted",
    persistedEventId: event?.id ?? null,
    explanationVersionId: storedVersion?.id ?? null,
    memoryCandidateIds: storedCandidates.map((candidate) => candidate.id).filter(Boolean),
    preRecallRelationIds: committedPreRecallRelations.map((relation) => relation.id).filter(Boolean),
    usedMemoryBridgeEventIds: usedBridgeEvents.map((bridgeEvent) => bridgeEvent.id).filter(Boolean),
    summarizerEnqueued: storedCandidates.length > 0 || Boolean(storedVersion)
  };
  result.explanationVersion = {
    ...(result.explanationVersion ?? {}),
    ...(storedVersion?.id ? storedVersion : {}),
    text: result.text ?? result.microExplanation ?? result.explanation ?? ""
  };
  return result;
}

function summarizeMemoryRecall(memoryPacket = null) {
  const bridges = Array.isArray(memoryPacket?.memoryBridges) ? memoryPacket.memoryBridges : [];
  const preRecall = memoryPacket?.preRecall ?? null;
  if (bridges.length === 0 && !preRecall) return null;
  return {
    status: memoryPacket?.repositoryStatus ?? memoryPacket?.memoryFreshness?.status ?? null,
    bridgeCount: bridges.length,
    bridges: bridges.slice(0, 5).map(summarizeMemoryBridge),
    preRecall: preRecall ? {
      status: preRecall.status ?? null,
      reason: preRecall.reason ?? null,
      candidateBlockCount: Number(preRecall.candidateBlockCount ?? 0),
      relationCandidateCount: Number(preRecall.relationCandidateCount ?? 0),
      activeCandidateCount: Number(preRecall.activeCandidateCount ?? 0),
      overlayEligibleCandidateCount: Number(preRecall.overlayEligibleCandidateCount ?? 0),
      rejectedCandidateCount: Number(preRecall.rejectedCandidateCount ?? 0),
      gateRejectReasons: Array.isArray(preRecall.gateRejectReasons) ? preRecall.gateRejectReasons.slice(0, 8) : [],
      gateRejectReasonText: preRecall.gateRejectReasonText ?? "",
      bridgeCount: Number(preRecall.bridgeCount ?? 0)
    } : null,
    policy: memoryPacket?.recallPolicy ? {
      relationDepth: memoryPacket.recallPolicy.relationDepth ?? null,
      maxBridgeCount: memoryPacket.recallPolicy.maxBridgeCount ?? null,
      memorySourceRole: memoryPacket.recallPolicy.memorySourceRole ?? null,
      caution: memoryPacket.recallPolicy.caution ?? null
    } : null
  };
}

function summarizeMemoryBridge(bridge = {}) {
  return {
    relatedConcept: clampText(bridge.relatedConcept ?? "", 120),
    relationType: bridge.relationType ?? null,
    direction: bridge.direction ?? null,
    confidence: bridge.confidence ?? null,
    sourceRole: bridge.sourceRole ?? null,
    caution: bridge.caution ?? null
  };
}

async function commitPreRecallRelations(store, memoryPacket) {
  const relations = (memoryPacket?.preRecallRelations ?? [])
    .filter((relation) => relation?.id && isRelationUsableForOverlay(relation));
  if (relations.length === 0 || !store?.commitPreRecallRelations) return [];
  const result = await store.commitPreRecallRelations({ relations });
  return result?.relationCandidates ?? [];
}

function createCandidatesFromResult(result, request, event, version, { now }) {
  const sourceEventIds = event?.id ? [event.id] : [];
  const candidates = [];
  if (result.confidence !== null && result.confidence !== undefined) {
    candidates.push({
      canonicalName: request.target?.canonicalName,
      kind: "provider_signal",
      signal: "model_confidence",
      uncertainty: "low",
      timestamp: now(),
      sourceEventIds,
      sourceExplanationVersionId: version?.id ?? result.versionMetadata?.id ?? null,
      provider: result.versionMetadata?.provider,
      model: result.versionMetadata?.model,
      metadata: { confidence: result.confidence }
    });
  }
  if (Array.isArray(result.terms) && result.terms.length > 0) {
    candidates.push({
      canonicalName: request.target?.canonicalName,
      kind: "provider_signal",
      signal: "possible_unfamiliar",
      uncertainty: "low",
      timestamp: now(),
      sourceEventIds,
      sourceExplanationVersionId: version?.id ?? result.versionMetadata?.id ?? null,
      provider: result.versionMetadata?.provider,
      model: result.versionMetadata?.model,
      metadata: { termCount: result.terms.length }
    });
  }
  if (request.feedbackEvent?.type === MemoryEventType.REQUESTED_SIMPLER || request.requestedStyle === "simpler") {
    candidates.push({
      canonicalName: request.target?.canonicalName,
      kind: "feedback_signal",
      signal: "too_hard",
      uncertainty: "low",
      timestamp: now(),
      sourceEventIds,
      sourceExplanationVersionId: version?.id ?? result.versionMetadata?.id ?? null,
      metadata: { requestedStyle: "simpler" }
    });
  }
  return candidates;
}

async function recordUsedMemoryBridges(store, request, memoryPacket, version, { now }) {
  const bridges = Array.isArray(memoryPacket?.memoryBridges) ? memoryPacket.memoryBridges : [];
  const events = await Promise.all(bridges.map((bridge, index) => store.writeEvent?.({
    repository: "learning",
    event: {
      id: `memory_bridge_used_${now()}_${index}_${hashString(`${request.requestId}:${bridge.relationId ?? bridge.relatedConcept}`)}`,
      type: MemoryEventType.MEMORY_BRIDGE_USED,
      canonicalName: request.target?.canonicalName,
      observedAlias: request.target?.observedText,
      timestamp: now(),
      context: {
        ...request.minimalContext,
        explanationVersionId: version?.id ?? null,
        relationId: bridge.relationId ?? null,
        bridgeConcept: bridge.relatedConcept ?? null,
        relationType: bridge.relationType ?? null,
        sourceRole: bridge.sourceRole ?? "local_learning_context"
      },
      knowledgeType: request.target?.knowledgeType,
      explanationVersionId: version?.id ?? null,
      relationId: bridge.relationId ?? null,
      bridgeConcept: bridge.relatedConcept ?? null,
      relationType: bridge.relationType ?? null,
      sourceRole: bridge.sourceRole ?? "local_learning_context",
      sourceEventIds: bridge.evidenceEventIds ?? [],
      uncertainty: {
        confidence: bridge.confidence ?? "low",
        sourceRole: bridge.sourceRole ?? "local_learning_context"
      },
      relatedConcepts: bridge.relatedConcept ? [bridge.relatedConcept] : []
    }
  })));
  return events.filter(Boolean);
}

function usableMemoryPacket(memoryPacket) {
  if (!memoryPacket || memoryPacket.status === AgentResultStatus.UNAVAILABLE) {
    return {
      status: AgentResultStatus.UNAVAILABLE,
      reason: memoryPacket?.reason ?? "memory_query_unavailable",
      localMemoryRole: "learning_state"
    };
  }
  return memoryPacket;
}
