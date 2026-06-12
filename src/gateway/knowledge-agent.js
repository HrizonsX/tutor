// @ts-nocheck
import { FactSensitivity, MemoryEventType } from "../shared/contracts.js";

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

export function curateKnowledgeMemory({
  canonicalName,
  events = [],
  timestamp = Date.now(),
  maxRelatedObjects = 5
} = {}) {
  const objectEvents = events.filter((event) => event.canonicalName === canonicalName);
  const aliases = unique(objectEvents.map((event) => event.observedAlias).filter(Boolean));
  const encounterEvents = objectEvents.filter((event) => [
    MemoryEventType.KNOWLEDGE_ENCOUNTERED,
    MemoryEventType.RECENTLY_SEEN,
    MemoryEventType.EXPLANATION_SHOWN
  ].includes(event.type));
  const feedbackEvents = objectEvents.filter((event) => FEEDBACK_TYPES.has(event.type));
  const explanationEvents = objectEvents.filter((event) => event.type === MemoryEventType.EXPLANATION_SHOWN);
  const relatedObjects = collectRelatedObjects(objectEvents, maxRelatedObjects);

  return {
    canonicalName,
    aliases,
    firstSeenAt: Math.min(...encounterEvents.map((event) => event.timestamp), timestamp),
    recentlySeenAt: Math.max(...encounterEvents.map((event) => event.timestamp), 0) || null,
    priorExplanationIds: explanationEvents.map((event) => event.explanationVersionId).filter(Boolean),
    feedbackSummary: summarizeFeedback(feedbackEvents),
    relatedObjects,
    uncertainty: {
      confidence: objectEvents.length >= 3 ? "medium" : "low",
      reason: objectEvents.length >= 3 ? "multiple_events" : "limited_events"
    },
    evidenceEventIds: objectEvents.map((event) => event.id).filter(Boolean)
  };
}

export function buildRetrievalPacket({
  canonicalName,
  candidate = null,
  events = [],
  explanationVersions = [],
  derivedSignals = {},
  cooldowns = {},
  profileHints = {},
  timestamp = Date.now(),
  maxRelatedObjects = 5
} = {}) {
  const agentSummary = curateKnowledgeMemory({ canonicalName, events, timestamp, maxRelatedObjects });
  const objectEvents = events.filter((event) => event.canonicalName === canonicalName);
  const feedbackEvents = objectEvents.filter((event) => FEEDBACK_TYPES.has(event.type));
  const priorExplanations = explanationVersions
    .filter((version) => version.target === canonicalName || version.canonicalName === canonicalName)
    .slice(-5);

  return {
    target: {
      canonicalName,
      observedText: candidate?.observedText ?? canonicalName,
      knowledgeType: candidate?.knowledgeType ?? inferKnowledgeType(objectEvents),
      factSensitivity: candidate?.factSensitivity ?? FactSensitivity.STABLE,
      semanticSignals: candidate?.semanticSignals ?? []
    },
    priorExplanations: priorExplanations.map((version) => ({
      ...version,
      sourceRole: "explanation_history",
      verifiedWorldKnowledge: false
    })),
    feedbackEvents,
    relatedObjects: agentSummary.relatedObjects,
    profileHints,
    cooldowns,
    derivedSignals,
    agentSummary: {
      ...agentSummary,
      localMemoryOnly: true,
      sourceRole: "learning_state"
    },
    uncertainty: agentSummary.uncertainty,
    localMemoryRole: "learning_state",
    knowledgeSource: "external_agent_required",
    retrievalMode: "exact_alias_recency",
    similarMemories: [],
    timestamp
  };
}

function collectRelatedObjects(events, limit) {
  const byName = new Map();
  for (const event of events) {
    for (const name of event.relatedConcepts ?? event.relatedObjects ?? []) {
      const current = byName.get(name) ?? { canonicalName: name, evidenceEventIds: [], uncertainty: "low" };
      if (event.id) current.evidenceEventIds.push(event.id);
      current.uncertainty = current.evidenceEventIds.length >= 2 ? "medium" : "low";
      byName.set(name, current);
    }
  }
  return Array.from(byName.values()).slice(0, limit);
}

function summarizeFeedback(feedbackEvents) {
  const summary = {};
  for (const event of feedbackEvents) {
    summary[event.type] = summary[event.type] ?? { count: 0, evidenceEventIds: [] };
    summary[event.type].count += 1;
    if (event.id) summary[event.type].evidenceEventIds.push(event.id);
  }
  return summary;
}

function inferKnowledgeType(events) {
  return events.find((event) => event.knowledgeType)?.knowledgeType ?? "other";
}

function unique(values) {
  return Array.from(new Set(values));
}
