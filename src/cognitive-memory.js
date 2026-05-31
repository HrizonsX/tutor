import { DEFAULT_CONFIG } from "./config.js";
import { DerivedSignal, MemoryEventType } from "./contracts.js";
import { normalizeKnowledgeObjectName } from "./concepts.js";
import { clampSourceDate, clampSourceIds, clampText, hashString, sanitizeRelationEvidence } from "./privacy.js";

export const COGNITIVE_MEMORY_VERSION = "cognitive-memory.v1";
export const DAILY_SUMMARY_VERSION = "daily-memory-summary.v1";
export const RELATION_PROPOSER_VERSION = "relation-proposer.v1";
export const REFLECTION_REPORT_VERSION = "learning-reflection-report.v1";

export const ConceptRelationType = Object.freeze({
  IS_A: "is_a",
  PART_OF: "part_of",
  CONTAINS: "contains",
  LOCATED_IN: "located_in",
  USED_FOR: "used_for",
  PREREQUISITE_OF: "prerequisite_of",
  SIMILAR_TO: "similar_to",
  CONTRASTS_WITH: "contrasts_with",
  RELATED_TO: "related_to"
});

export const RelationStatus = Object.freeze({
  CANDIDATE: "candidate",
  ACTIVE: "active",
  REJECTED: "rejected"
});

export const RelationBasis = Object.freeze({
  CURRENT_CONTEXT_EXPLICIT: "current_context_explicit",
  PROVIDER_STRUCTURED_RELATION: "provider_structured_relation",
  PRIOR_ACTIVE_RELATION: "prior_active_relation",
  DAILY_SUMMARY_INFERENCE: "daily_summary_inference",
  REPEATED_CONSISTENT_EVIDENCE: "repeated_consistent_evidence",
  SEMANTIC_SIMILARITY: "semantic_similarity",
  CO_OCCURRENCE: "co_occurrence"
});

const ACTIVE_BASES = new Set([
  RelationBasis.CURRENT_CONTEXT_EXPLICIT,
  RelationBasis.PROVIDER_STRUCTURED_RELATION,
  RelationBasis.PRIOR_ACTIVE_RELATION,
  RelationBasis.REPEATED_CONSISTENT_EVIDENCE
]);

const ALLOWED_RELATIONS = new Set(Object.values(ConceptRelationType));
const ALLOWED_BASES = new Set(Object.values(RelationBasis));
const CONFIDENCE_RANK = { low: 1, medium: 2, high: 3 };
const RELATION_USEFULNESS = {
  [ConceptRelationType.PREREQUISITE_OF]: 4,
  [ConceptRelationType.LOCATED_IN]: 3.5,
  [ConceptRelationType.PART_OF]: 3.4,
  [ConceptRelationType.USED_FOR]: 3.2,
  [ConceptRelationType.IS_A]: 3,
  [ConceptRelationType.CONTAINS]: 2.8,
  [ConceptRelationType.CONTRASTS_WITH]: 2.4,
  [ConceptRelationType.SIMILAR_TO]: 2,
  [ConceptRelationType.RELATED_TO]: 1
};

export function cognitiveConfig(config = DEFAULT_CONFIG) {
  return {
    ...DEFAULT_CONFIG.memory.cognitive,
    ...(config.memory?.cognitive ?? {})
  };
}

export function createEmptyCognitiveMemoryState() {
  return {
    version: COGNITIVE_MEMORY_VERSION,
    dailySummaries: {},
    conceptProjections: {},
    relationProposals: [],
    relatedConceptHints: [],
    reflectionReports: [],
    relationProposalCache: {},
    staleDates: [],
    relationDiscovery: {
      status: "idle",
      backlogTargets: [],
      lastRunAt: null,
      lastError: null,
      cacheHits: 0,
      cacheMisses: 0
    }
  };
}

export function normalizeCognitiveMemoryState(value = {}) {
  const empty = createEmptyCognitiveMemoryState();
  return {
    ...empty,
    ...value,
    dailySummaries: value.dailySummaries && typeof value.dailySummaries === "object" ? value.dailySummaries : {},
    conceptProjections: value.conceptProjections && typeof value.conceptProjections === "object" ? value.conceptProjections : {},
    relationProposals: Array.isArray(value.relationProposals) ? value.relationProposals : [],
    relatedConceptHints: Array.isArray(value.relatedConceptHints) ? value.relatedConceptHints : [],
    reflectionReports: Array.isArray(value.reflectionReports) ? value.reflectionReports : [],
    relationProposalCache: value.relationProposalCache && typeof value.relationProposalCache === "object" ? value.relationProposalCache : {},
    staleDates: Array.isArray(value.staleDates) ? unique(value.staleDates.map(clampSourceDate).filter(Boolean)) : [],
    relationDiscovery: {
      ...empty.relationDiscovery,
      ...(value.relationDiscovery ?? {})
    },
    version: COGNITIVE_MEMORY_VERSION
  };
}

export function toMemoryDate(timestamp = Date.now()) {
  const date = new Date(Number(timestamp) || Date.now());
  return date.toISOString().slice(0, 10);
}

export function buildConceptProjection({
  canonicalName = "",
  events = [],
  profileEvents = [],
  explanationVersions = [],
  memoryCandidates = [],
  timestamp = Date.now(),
  config = DEFAULT_CONFIG,
  derivedSignals = null,
  uncertainty = null
} = {}) {
  const target = normalizeKnowledgeObjectName(canonicalName);
  const targetEvents = events.filter((event) => event.canonicalName === target);
  const targetProfileEvents = profileEvents.filter((event) => event.canonicalName === target);
  const allEvents = [...targetEvents, ...targetProfileEvents];
  const versions = explanationVersions.filter((version) => version.target === target || version.canonicalName === target);
  const candidates = memoryCandidates.filter((candidate) => candidate.canonicalName === target && candidate.status !== "rejected");
  const aliases = unique(allEvents.map((event) => event.observedAlias).filter(Boolean));
  const count = (types) => allEvents.filter((event) => types.includes(event.type)).length;
  const seenTypes = [
    MemoryEventType.KNOWLEDGE_ENCOUNTERED,
    MemoryEventType.RECENTLY_SEEN,
    MemoryEventType.EXPLANATION_SHOWN,
    MemoryEventType.USER_SELECTED_TERM,
    MemoryEventType.CONCEPT_REVISITED
  ];
  const explainedEvents = allEvents.filter((event) => event.type === MemoryEventType.EXPLANATION_SHOWN || event.explanationVersionId);
  const lastTimestamp = (items) => Math.max(...items.map((item) => Number(item.timestamp ?? 0)), 0) || null;
  const sourceEventIds = allEvents.map((event) => event.id).filter(Boolean).slice(-12);
  const sourceCandidateIds = candidates.map((candidate) => candidate.id).filter(Boolean).slice(-12);
  const signals = derivedSignals ?? deriveProjectionSignals(allEvents, candidates, timestamp, config);
  const seenCount = count(seenTypes);
  const explainedCount = explainedEvents.length || versions.length;
  const expandedCount = count([MemoryEventType.EXPANDED, MemoryEventType.REQUESTED_MORE_CONTEXT]);
  const repeatedConfusionCount = count([MemoryEventType.REPEATED_CONFUSION, MemoryEventType.MARKED_CONFUSING, MemoryEventType.REQUESTED_SIMPLER]);
  const dismissedCount = count([MemoryEventType.DISMISSED, MemoryEventType.USER_IGNORED_OVERLAY]);
  const lastSeenAt = lastTimestamp(allEvents);
  const lastExplainedAt = lastTimestamp(explainedEvents.length ? explainedEvents : versions);
  const lastUsedInExplanationAt = lastTimestamp(allEvents.filter((event) => event.type === MemoryEventType.MEMORY_BRIDGE_USED));
  const estimatedDifficulty = estimateDifficulty({ repeatedConfusionCount, expandedCount, candidates });
  const estimatedFamiliarity = estimateFamiliarity({ seenCount, explainedCount, dismissedCount, repeatedConfusionCount, signals });
  const forgetting = estimateForgettingRisk({
    timestamp,
    lastSeenAt,
    lastExplainedAt,
    lastUsedInExplanationAt,
    seenCount,
    explainedCount,
    expandedCount,
    repeatedConfusionCount,
    dismissedCount,
    estimatedDifficulty,
    estimatedFamiliarity,
    config
  });

  return {
    canonicalName: target,
    aliases,
    seenCount,
    explainedCount,
    expandedCount,
    dismissedCount,
    repeatedConfusionCount,
    selectedTermCount: count([MemoryEventType.USER_SELECTED_TERM]),
    revisitedCount: count([MemoryEventType.CONCEPT_REVISITED]),
    ignoredOverlayCount: count([MemoryEventType.USER_IGNORED_OVERLAY]),
    firstSeenAt: Math.min(...allEvents.map((event) => Number(event.timestamp ?? Infinity)), timestamp) || null,
    lastSeenAt,
    lastExplainedAt,
    lastUsedInExplanationAt,
    estimatedFamiliarity,
    estimatedDifficulty,
    forgettingRisk: forgetting.risk,
    forgettingRiskReason: forgetting.reason,
    derivedSignals: signals,
    sourceEventIds,
    sourceCandidateIds,
    uncertainty: uncertainty ?? deriveProjectionUncertainty(allEvents, candidates),
    timestamp,
    summarizerVersion: COGNITIVE_MEMORY_VERSION
  };
}

export function buildDailyMemorySummary({
  date = toMemoryDate(),
  events = [],
  profileEvents = [],
  conceptProjections = {},
  relations = [],
  timestamp = Date.now(),
  config = DEFAULT_CONFIG
} = {}) {
  const dayEvents = [...events, ...profileEvents].filter((event) => toMemoryDate(event.timestamp) === date);
  const names = unique(dayEvents.map((event) => event.canonicalName).filter(Boolean));
  const conceptRefs = names
    .map((name) => conceptProjections[name] ?? buildConceptProjection({ canonicalName: name, events, profileEvents, timestamp, config }))
    .map((projection) => ({
      canonicalName: projection.canonicalName,
      aliases: (projection.aliases ?? []).slice(0, 5),
      eventCounts: {
        seen: projection.seenCount ?? 0,
        explained: projection.explainedCount ?? 0,
        expanded: projection.expandedCount ?? 0,
        dismissed: projection.dismissedCount ?? 0,
        repeatedConfusion: projection.repeatedConfusionCount ?? 0
      },
      signals: {
        possiblyWeak: Boolean(projection.derivedSignals?.[DerivedSignal.POSSIBLY_WEAK]),
        recentlyExplained: Boolean(projection.derivedSignals?.[DerivedSignal.RECENTLY_EXPLAINED])
      },
      sourceEventIds: (projection.sourceEventIds ?? []).slice(0, 8)
    }));
  const relationRefs = relations
    .filter((relation) => (relation.sourceDates ?? []).includes(date) || toMemoryDate(relation.lastSeenAt ?? relation.createdAt) === date)
    .slice(0, cognitiveConfig(config).reportRelationLimit)
    .map((relation) => ({
      id: relation.id,
      sourceCanonicalName: relation.sourceCanonicalName,
      relationType: relation.relationType,
      targetCanonicalName: relation.targetCanonicalName,
      confidence: relation.confidence,
      status: relation.status,
      sourceDates: relation.sourceDates ?? []
    }));
  const topics = unique(dayEvents.map((event) => event.knowledgeType).filter(Boolean)).slice(0, 8);
  const sourceEventIds = dayEvents.map((event) => event.id).filter(Boolean).slice(-12);
  const stableShape = {
    date,
    topics,
    concepts: conceptRefs.map((concept) => concept.canonicalName),
    relationIds: relationRefs.map((relation) => relation.id),
    eventCount: dayEvents.length,
    sourceEventIds
  };
  return {
    id: `daily_${date}`,
    kind: "daily_memory_summary",
    date,
    summaryVersion: DAILY_SUMMARY_VERSION,
    summaryHash: hashString(JSON.stringify(stableShape)),
    topics,
    conceptRefs,
    relationRefs,
    eventCount: dayEvents.length,
    sourceEventIds,
    createdAt: timestamp,
    timestamp
  };
}

export function selectRelevantDays({
  targetConcept = "",
  dailySummaries = [],
  limit = DEFAULT_CONFIG.memory.cognitive.selectedDayLimit
} = {}) {
  const target = normalizeKnowledgeObjectName(targetConcept);
  const targetTokens = tokenSet(target);
  return dailySummaries
    .map((summary) => {
      const conceptHit = (summary.conceptRefs ?? []).some((concept) => (
        concept.canonicalName === target ||
        (concept.aliases ?? []).some((alias) => normalizeKnowledgeObjectName(alias) === target)
      ));
      const relationHit = (summary.relationRefs ?? []).some((relation) => (
        relation.sourceCanonicalName === target || relation.targetCanonicalName === target
      ));
      const tokenOverlap = (summary.conceptRefs ?? []).some((concept) => overlap(tokenSet(concept.canonicalName), targetTokens));
      const score = (conceptHit ? 4 : 0) + (relationHit ? 3 : 0) + (tokenOverlap ? 1 : 0) + (summary.eventCount > 0 ? 0.1 : 0);
      return {
        date: summary.date,
        confidence: score >= 4 ? "high" : score >= 1 ? "medium" : "low",
        reasonCode: conceptHit ? "exact_concept_in_day" : relationHit ? "relation_ref_in_day" : tokenOverlap ? "token_overlap" : "recent_summary",
        score,
        summaryHash: summary.summaryHash
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || String(right.date).localeCompare(String(left.date)))
    .slice(0, limit);
}

export function buildDayConceptBlocks({ dates = [], dailySummaries = [], conceptProjections = {}, relations = [] } = {}) {
  const byDate = new Map(dailySummaries.map((summary) => [summary.date, summary]));
  return dates.map((dateInput) => {
    const date = typeof dateInput === "string" ? dateInput : dateInput.date;
    const summary = byDate.get(date);
    const concepts = (summary?.conceptRefs ?? []).map((concept) => ({
      canonicalName: concept.canonicalName,
      sourceRole: "learned_concept",
      projection: conceptProjections[concept.canonicalName] ?? null
    }));
    return {
      date,
      summaryHash: summary?.summaryHash ?? null,
      topics: summary?.topics ?? [],
      concepts,
      relations: relations.filter((relation) => (relation.sourceDates ?? []).includes(date))
    };
  }).filter((block) => block.date);
}

export function normalizeRelationProposalCandidate(value = {}, { targetConcept = "", config = DEFAULT_CONFIG } = {}) {
  const sourceCanonicalName = normalizeKnowledgeObjectName(value.sourceCanonicalName ?? value.source ?? targetConcept);
  const targetCanonicalName = normalizeKnowledgeObjectName(value.targetCanonicalName ?? value.target ?? "");
  return {
    sourceCanonicalName,
    relationType: value.relationType ?? value.type ?? ConceptRelationType.RELATED_TO,
    targetCanonicalName,
    sourceDate: clampSourceDate(value.sourceDate ?? value.date ?? ""),
    confidence: normalizeConfidence(value.confidence),
    basis: value.basis ?? RelationBasis.DAILY_SUMMARY_INFERENCE,
    usableForOverlay: value.usableForOverlay !== false,
    overlayDisabledExplicitly: value.overlayDisabledExplicitly === true || value.usableForOverlay === false,
    reasonCode: clampText(value.reasonCode ?? value.reason ?? "", 160),
    sourceKind: clampText(value.sourceKind ?? "relation_proposer", config.privacy.maxStoredAliasChars),
    proposerVersion: clampText(value.proposerVersion ?? RELATION_PROPOSER_VERSION, config.privacy.maxStoredAliasChars),
    sourceEventIds: clampSourceIds(value.sourceEventIds ?? value.evidenceEventIds, 12),
    sourceExplanationVersionIds: clampSourceIds(value.sourceExplanationVersionIds, 12),
    contextHash: value.contextHash ?? null,
    evidenceTextHash: value.evidenceTextHash ?? null
  };
}

export function gateRelationProposal(candidate = {}, {
  dayBlocks = [],
  existingRelations = [],
  timestamp = Date.now(),
  targetConcept = "",
  config = DEFAULT_CONFIG
} = {}) {
  const normalizedTargetConcept = normalizeKnowledgeObjectName(targetConcept);
  const normalized = normalizeRelationProposalCandidate(candidate, { targetConcept: normalizedTargetConcept, config });
  const allowedDateSet = new Set(dayBlocks.map((block) => block.date));
  const conceptsByDate = new Map(dayBlocks.map((block) => [
    block.date,
    new Set((block.concepts ?? []).map((concept) => normalizeKnowledgeObjectName(concept.canonicalName)))
  ]));
  const dayOwnedConceptName = selectDayOwnedRelationConcept(normalized, normalizedTargetConcept);
  const reasons = [];
  if (!normalized.sourceCanonicalName || !normalized.targetCanonicalName) reasons.push("missing_canonical_name");
  if (normalized.sourceCanonicalName === normalized.targetCanonicalName) reasons.push("self_loop");
  if (!ALLOWED_RELATIONS.has(normalized.relationType)) reasons.push("unsupported_relation_type");
  if (!ALLOWED_BASES.has(normalized.basis)) reasons.push("unsupported_basis");
  if (normalizedTargetConcept && !dayOwnedConceptName) reasons.push("target_concept_absent_from_relation");
  if (!normalized.sourceDate || !allowedDateSet.has(normalized.sourceDate)) reasons.push("source_date_not_loaded");
  const dateConcepts = conceptsByDate.get(normalized.sourceDate) ?? new Set();
  if (normalized.sourceDate && dateConcepts.size > 0 && dayOwnedConceptName && !dateConcepts.has(dayOwnedConceptName)) {
    reasons.push("target_absent_from_day_block");
  }

  const repeated = existingRelations.filter((relation) => (
    relation.sourceCanonicalName === normalized.sourceCanonicalName &&
    relation.targetCanonicalName === normalized.targetCanonicalName &&
    relation.relationType === normalized.relationType &&
    relation.status !== RelationStatus.REJECTED
  ));
  const repeatedActive = repeated.some((relation) => relation.status === RelationStatus.ACTIVE);
  const repeatedCount = repeated.reduce((count, relation) => count + Number(relation.occurrenceCount ?? 1), 0);
  const activeByBasis = ACTIVE_BASES.has(normalized.basis) || repeatedActive || repeatedCount >= 2;
  const status = reasons.length
    ? RelationStatus.REJECTED
    : activeByBasis
      ? RelationStatus.ACTIVE
      : RelationStatus.CANDIDATE;
  const sourceDates = unique([normalized.sourceDate, ...repeated.flatMap((relation) => relation.sourceDates ?? [])]);
  const evidence = sanitizeRelationEvidence({
    sourceEventIds: normalized.sourceEventIds,
    sourceExplanationVersionIds: normalized.sourceExplanationVersionIds,
    sourceDates,
    contextHash: normalized.contextHash,
    evidenceTextHash: normalized.evidenceTextHash,
    sourceKind: normalized.sourceKind,
    proposerVersion: normalized.proposerVersion,
    confidenceReason: reasons[0] ?? normalized.reasonCode ?? normalized.basis
  }, config);
  return {
    id: `rel_${hashString(`${normalized.sourceCanonicalName}:${normalized.relationType}:${normalized.targetCanonicalName}:${normalized.sourceDate}`)}`,
    sourceCanonicalName: normalized.sourceCanonicalName,
    relationType: normalized.relationType,
    targetCanonicalName: normalized.targetCanonicalName,
    status,
    confidence: normalized.confidence,
    basis: normalized.basis,
    usableForOverlay: status === RelationStatus.ACTIVE,
    overlayDisabledExplicitly: normalized.overlayDisabledExplicitly,
    sourceDates,
    sourceEventIds: evidence.sourceEventIds,
    sourceExplanationVersionIds: evidence.sourceExplanationVersionIds,
    contextHash: evidence.contextHash,
    evidenceTextHash: evidence.evidenceTextHash,
    sourceKind: evidence.sourceKind,
    proposerVersion: evidence.proposerVersion,
    gateReason: reasons[0] ?? (status === RelationStatus.ACTIVE ? "active_evidence_basis" : "candidate_needs_stronger_evidence"),
    confidenceReason: evidence.confidenceReason,
    occurrenceCount: Math.max(1, repeatedCount + 1),
    createdAt: repeated[0]?.createdAt ?? timestamp,
    updatedAt: timestamp,
    lastSeenAt: timestamp
  };
}

function selectDayOwnedRelationConcept(relation = {}, targetConcept = "") {
  if (!targetConcept) return relation.targetCanonicalName;
  if (relation.sourceCanonicalName === targetConcept && relation.targetCanonicalName !== targetConcept) {
    return relation.targetCanonicalName;
  }
  if (relation.targetCanonicalName === targetConcept && relation.sourceCanonicalName !== targetConcept) {
    return relation.sourceCanonicalName;
  }
  return "";
}

export function rankMemoryBridges({
  targetConcept = "",
  relations = [],
  conceptProjections = {},
  timestamp = Date.now(),
  config = DEFAULT_CONFIG,
  goal = "micro"
} = {}) {
  const target = normalizeKnowledgeObjectName(targetConcept);
  const cfg = cognitiveConfig(config);
  const limit = goal === "expanded" || goal === "expand" || goal === "rewrite"
    ? cfg.expandedBridgeLimit
    : cfg.microBridgeLimit;
  return relations
    .filter(isRelationUsableForOverlay)
    .map((relation) => {
      const outgoing = relation.sourceCanonicalName === target;
      const incoming = relation.targetCanonicalName === target;
      if (!outgoing && !incoming) return null;
      if (
        goal === "micro" &&
        relation.relationType === ConceptRelationType.RELATED_TO &&
        !(relation.basis === RelationBasis.PROVIDER_STRUCTURED_RELATION && relation.confidence === "high")
      ) return null;
      const relatedConcept = outgoing ? relation.targetCanonicalName : relation.sourceCanonicalName;
      const projection = conceptProjections[relatedConcept] ?? null;
      if (projection?.derivedSignals?.[DerivedSignal.OBJECT_MUTED]) return null;
      const recentlyUsed = projection?.lastUsedInExplanationAt && timestamp - projection.lastUsedInExplanationAt < 24 * 60 * 60 * 1000;
      const forgettingBoost = projection?.forgettingRisk === "high" ? 1 : projection?.forgettingRisk === "medium" ? 0.5 : 0;
      const score =
        (CONFIDENCE_RANK[relation.confidence] ?? 1) * 3 +
        (RELATION_USEFULNESS[relation.relationType] ?? 1) +
        forgettingBoost +
        (projection?.estimatedDifficulty === "high" ? 0.5 : 0) -
        (recentlyUsed ? 1.5 : 0) +
        Math.min(Number(relation.occurrenceCount ?? 1), 5) * 0.1;
      return {
        relationId: relation.id,
        relatedConcept,
        relationType: relation.relationType,
        direction: outgoing ? "outgoing" : "incoming",
        confidence: relation.confidence,
        score: Number(score.toFixed(3)),
        relationDepth: 1,
        sourceRole: "local_learning_context",
        caution: "not_fact_source",
        sourceDates: relation.sourceDates ?? [],
        evidenceEventIds: relation.sourceEventIds ?? [],
        evidenceExplanationVersionIds: relation.sourceExplanationVersionIds ?? [],
        forgettingRisk: projection?.forgettingRisk ?? "unknown"
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export function isRelationUsableForOverlay(relation = {}) {
  return relation?.status === RelationStatus.ACTIVE;
}

export function buildReflectionReport({
  kind = "daily",
  date = null,
  startDate = null,
  endDate = null,
  dailySummaries = [],
  conceptProjections = {},
  relations = [],
  timestamp = Date.now(),
  config = DEFAULT_CONFIG
} = {}) {
  const cfg = cognitiveConfig(config);
  const selected = dailySummaries.filter((summary) => {
    if (kind === "daily") return summary.date === date;
    return (!startDate || summary.date >= startDate) && (!endDate || summary.date <= endDate);
  });
  const conceptNames = unique(selected.flatMap((summary) => (summary.conceptRefs ?? []).map((concept) => concept.canonicalName)));
  const concepts = conceptNames.map((name) => conceptProjections[name]).filter(Boolean);
  const repeatedConcepts = concepts
    .filter((projection) => projection.seenCount > 1 || projection.explainedCount > 1)
    .sort((left, right) => (right.seenCount + right.explainedCount) - (left.seenCount + left.explainedCount))
    .slice(0, cfg.reportConceptLimit)
    .map(reportConceptRef);
  const weakConcepts = concepts
    .filter((projection) => projection.derivedSignals?.[DerivedSignal.POSSIBLY_WEAK] || projection.repeatedConfusionCount > 0)
    .slice(0, cfg.reportConceptLimit)
    .map(reportConceptRef);
  const staleConcepts = concepts
    .filter((projection) => projection.forgettingRisk === "high" || projection.forgettingRisk === "medium")
    .slice(0, cfg.reportConceptLimit)
    .map(reportConceptRef);
  const dateSet = new Set(selected.map((summary) => summary.date));
  const relationRefs = relations
    .filter((relation) => (relation.sourceDates ?? []).some((sourceDate) => dateSet.has(sourceDate)))
    .filter((relation) => relation.status !== RelationStatus.REJECTED)
    .slice(0, cfg.reportRelationLimit)
    .map((relation) => ({
      id: relation.id,
      sourceCanonicalName: relation.sourceCanonicalName,
      relationType: relation.relationType,
      targetCanonicalName: relation.targetCanonicalName,
      confidence: relation.confidence,
      status: relation.status,
      sourceDates: relation.sourceDates ?? [],
      sourceRole: "local_learning_context",
      caution: "not_fact_source"
    }));
  const topics = unique(selected.flatMap((summary) => summary.topics ?? [])).slice(0, 10);
  const sourceSummaryIds = selected.map((summary) => summary.id).filter(Boolean);
  const reportDate = kind === "daily" ? date : `${startDate ?? "start"}_${endDate ?? "end"}`;
  return {
    id: `${kind}_report_${hashString(`${reportDate}:${sourceSummaryIds.join(",")}`)}`,
    kind,
    reportVersion: REFLECTION_REPORT_VERSION,
    date: kind === "daily" ? date : null,
    startDate: kind === "weekly" ? startDate : null,
    endDate: kind === "weekly" ? endDate : null,
    topics,
    encounteredConcepts: concepts.slice(0, cfg.reportConceptLimit).map(reportConceptRef),
    explainedConcepts: concepts.filter((projection) => projection.explainedCount > 0).slice(0, cfg.reportConceptLimit).map(reportConceptRef),
    repeatedConcepts,
    weakConcepts,
    staleConcepts,
    reviewSuggestions: unique([...weakConcepts, ...staleConcepts].map((concept) => concept.canonicalName)).slice(0, cfg.reportConceptLimit),
    relationRefs,
    sourceSummaryIds,
    sourceRole: "learning_reflection",
    caution: "local_learning_history_not_fact_source",
    createdAt: timestamp,
    timestamp
  };
}

function deriveProjectionSignals(events, candidates, timestamp, config) {
  const recent = (type, windowMs) => events.filter((event) => event.type === type && timestamp - event.timestamp <= windowMs);
  const repeatedConfusion = events.filter((event) => [
    MemoryEventType.REPEATED_CONFUSION,
    MemoryEventType.MARKED_CONFUSING,
    MemoryEventType.REQUESTED_SIMPLER
  ].includes(event.type)).length;
  const expansions = events.filter((event) => event.type === MemoryEventType.EXPANDED).length;
  const candidateSignals = new Set(candidates.map((candidate) => candidate.signal));
  return {
    [DerivedSignal.POSSIBLY_WEAK]: repeatedConfusion >= 2 || expansions >= 2 || candidateSignals.has("possible_unfamiliar"),
    [DerivedSignal.NEEDS_REVIEW]: repeatedConfusion >= 1 || expansions >= 2 || candidateSignals.has("needs_review"),
    [DerivedSignal.POSSIBLY_FAMILIAR]: recent(MemoryEventType.RECENTLY_SEEN, 30 * 60 * 1000).length >= 2 && repeatedConfusion === 0,
    [DerivedSignal.RECENTLY_EXPLAINED]: recent(MemoryEventType.EXPLANATION_SHOWN, config.inference?.recentlyExplainedCooldownMs ?? 600000).length > 0,
    [DerivedSignal.LOW_INTERVENTION_PREFERRED]: recent(MemoryEventType.DISMISSED, 30 * 60 * 1000).length >= 2,
    [DerivedSignal.POSSIBLY_CONFUSING]: repeatedConfusion >= 1 || candidateSignals.has("too_hard"),
    [DerivedSignal.OBJECT_MUTED]: events.some((event) =>
      event.type === MemoryEventType.MUTED_OBJECT || event.type === MemoryEventType.MUTED_CATEGORY) ||
      candidateSignals.has("muted")
  };
}

function estimateFamiliarity({ seenCount, explainedCount, dismissedCount, repeatedConfusionCount, signals }) {
  if (signals?.[DerivedSignal.POSSIBLY_WEAK] || repeatedConfusionCount > 1) return "low";
  if (explainedCount >= 2 || seenCount >= 4 || dismissedCount >= 2) return "high";
  if (explainedCount >= 1 || seenCount >= 2) return "medium";
  return "low";
}

function estimateDifficulty({ repeatedConfusionCount, expandedCount, candidates }) {
  if (repeatedConfusionCount >= 2 || expandedCount >= 2 || candidates.some((candidate) => candidate.signal === "too_hard")) return "high";
  if (repeatedConfusionCount >= 1 || expandedCount >= 1 || candidates.some((candidate) => candidate.signal === "needs_review")) return "medium";
  return "low";
}

function estimateForgettingRisk({
  timestamp,
  lastSeenAt,
  lastExplainedAt,
  lastUsedInExplanationAt,
  seenCount,
  explainedCount,
  expandedCount,
  repeatedConfusionCount,
  dismissedCount,
  estimatedDifficulty,
  estimatedFamiliarity,
  config
}) {
  const cfg = cognitiveConfig(config);
  const latest = Math.max(lastSeenAt ?? 0, lastExplainedAt ?? 0, lastUsedInExplanationAt ?? 0);
  if (!latest) return { risk: "unknown", reason: "never_seen" };
  const ageDays = (timestamp - latest) / (24 * 60 * 60 * 1000);
  const difficultyBoost = estimatedDifficulty === "high" ? 1.5 : estimatedDifficulty === "medium" ? 0.75 : 0;
  const familiarityOffset = estimatedFamiliarity === "high" ? -1 : estimatedFamiliarity === "medium" ? -0.25 : 0.5;
  const signalScore = difficultyBoost + familiarityOffset + repeatedConfusionCount * 0.25 + expandedCount * 0.15 - explainedCount * 0.1 - seenCount * 0.05 + dismissedCount * 0.05;
  if (ageDays >= cfg.forgettingRiskDays * 2 || (ageDays >= cfg.forgettingRiskDays && signalScore >= 1)) {
    return { risk: "high", reason: "old_relevant_learning_state" };
  }
  if (ageDays >= cfg.forgettingRiskDays || signalScore >= 1.5) {
    return { risk: "medium", reason: "possible_review_opportunity" };
  }
  return { risk: "low", reason: "recent_or_reinforced" };
}

function deriveProjectionUncertainty(events, candidates) {
  const count = events.length + candidates.length;
  return {
    confidence: count >= 3 ? "medium" : "low",
    reason: count >= 3 ? "multiple_memory_signals" : "limited_memory_signals"
  };
}

function normalizeConfidence(value) {
  return ["low", "medium", "high"].includes(value) ? value : "low";
}

function reportConceptRef(projection) {
  return {
    canonicalName: projection.canonicalName,
    seenCount: projection.seenCount ?? 0,
    explainedCount: projection.explainedCount ?? 0,
    repeatedConfusionCount: projection.repeatedConfusionCount ?? 0,
    forgettingRisk: projection.forgettingRisk ?? "unknown",
    estimatedDifficulty: projection.estimatedDifficulty ?? "low",
    estimatedFamiliarity: projection.estimatedFamiliarity ?? "low",
    uncertainty: projection.uncertainty ?? null,
    sourceEventIds: (projection.sourceEventIds ?? []).slice(0, 8)
  };
}

function tokenSet(value = "") {
  return new Set(String(value).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 1));
}

function overlap(left, right) {
  for (const token of left) {
    if (right.has(token)) return true;
  }
  return false;
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}
