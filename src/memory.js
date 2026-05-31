import { DEFAULT_CONFIG } from "./config.js";
import { DerivedSignal, MemoryEventType } from "./contracts.js";
import { normalizeKnowledgeObjectName } from "./concepts.js";
import { buildRetrievalPacket } from "./knowledge-agent.js";
import { sanitizeEventContext, sanitizeExplanationVersion, sanitizeKnowledgeContext } from "./privacy.js";

const FORBIDDEN_CERTAIN_STATES = new Set(["mastered", "does_not_understand"]);
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

export class MemoryStorage {
  constructor(storage = null, key = "bco.learningMemory") {
    this.storage = storage;
    this.key = key;
    this.fallback = { events: [], explanationVersions: [], agentSummaries: [] };
    this.ready = Promise.resolve(storage?.ready).then(() => this.load()).catch(() => this.fallback);
  }

  load() {
    try {
      const raw = this.storage?.getItem?.(this.key);
      if (!raw) return this.fallback;
      const parsed = JSON.parse(raw);
      return {
        events: Array.isArray(parsed.events) ? parsed.events : [],
        explanationVersions: Array.isArray(parsed.explanationVersions) ? parsed.explanationVersions : [],
        agentSummaries: Array.isArray(parsed.agentSummaries) ? parsed.agentSummaries : []
      };
    } catch {
      return this.fallback;
    }
  }

  save(data) {
    this.fallback = data;
    try {
      this.storage?.setItem?.(this.key, JSON.stringify(data));
    } catch {
      // Keep the in-memory fallback. Persistence failure should not break reading.
    }
  }
}

export class LearningMemory {
  constructor({ storage = null, config = DEFAULT_CONFIG, now = () => Date.now() } = {}) {
    this.storage = new MemoryStorage(storage);
    this.config = config;
    this.now = now;
    this.data = this.storage.load();
    this.ready = this.storage.ready.then((data) => {
      this.data = data;
      return this;
    });
  }

  recordEvent(event) {
    const timestamp = event.timestamp ?? this.now();
    const canonicalName = normalizeKnowledgeObjectName(event.concept ?? event.canonicalName ?? "");
    const safeEvent = {
      id: `evt_${timestamp}_${this.data.events.length}`,
      type: event.type,
      canonicalName,
      observedAlias: clampAlias(event.observedAlias ?? event.concept ?? "", this.config),
      timestamp,
      context: event.knowledgeType || event.explanationVersionId || event.requestedStyle || FEEDBACK_TYPES.has(event.type)
        ? sanitizeKnowledgeContext({
            ...(event.context ?? {}),
            knowledgeType: event.knowledgeType,
            explanationVersionId: event.explanationVersionId,
            previousExplanationVersionId: event.previousExplanationVersionId,
            requestedStyle: event.requestedStyle,
            feedbackType: event.feedbackType ?? event.type
          }, this.config)
        : sanitizeEventContext(event.context ?? {}, this.config),
      knowledgeType: event.knowledgeType ?? event.context?.knowledgeType ?? null,
      explanationVersionId: event.explanationVersionId ?? null,
      previousExplanationVersionId: event.previousExplanationVersionId ?? null,
      requestedStyle: event.requestedStyle ?? null,
      explanationStyle: event.explanationStyle ?? null,
      factSensitivity: event.factSensitivity ?? null,
      feedbackEventId: event.feedbackEventId ?? null,
      sourceEventIds: Array.isArray(event.sourceEventIds) ? event.sourceEventIds.slice(0, 12) : [],
      uncertainty: event.uncertainty ?? null,
      relatedConcepts: Array.isArray(event.relatedConcepts ?? event.relatedObjects)
        ? (event.relatedConcepts ?? event.relatedObjects).slice(0, this.config.knowledge?.maxRelatedObjects ?? 5)
        : []
    };

    if (FORBIDDEN_CERTAIN_STATES.has(event.state)) {
      safeEvent.ignoredState = event.state;
    }

    this.data.events.push(safeEvent);
    this.storage.save(this.data);
    return safeEvent;
  }

  recordExplanationShown({ concept, context, relatedConcepts = [], timestamp }) {
    return this.recordEvent({
      type: MemoryEventType.EXPLANATION_SHOWN,
      concept,
      context,
      knowledgeType: context?.knowledgeType,
      explanationVersionId: context?.explanationVersionId,
      explanationStyle: context?.explanationStyle,
      factSensitivity: context?.factSensitivity,
      relatedConcepts,
      timestamp
    });
  }

  recordDismissed({ concept, context, timestamp }) {
    return this.recordEvent({
      type: MemoryEventType.DISMISSED,
      concept,
      context,
      timestamp
    });
  }

  recordExpanded({ concept, context, timestamp }) {
    return this.recordEvent({
      type: MemoryEventType.EXPANDED,
      concept,
      context,
      timestamp
    });
  }

  recordParagraphPrompted({ concept, context, timestamp }) {
    return this.recordEvent({
      type: MemoryEventType.PARAGRAPH_PROMPTED,
      concept,
      context,
      timestamp
    });
  }

  recordKnowledgeEncounter({ concept, context, knowledgeType, observedAlias, relatedConcepts = [], timestamp }) {
    const canonicalName = normalizeKnowledgeObjectName(concept);
    const duplicate = this.getEvents(canonicalName).find((event) => (
      event.type === MemoryEventType.KNOWLEDGE_ENCOUNTERED &&
      event.context?.fragmentId === context?.fragmentId &&
      timestamp - event.timestamp <= this.config.inference.paragraphCooldownMs
    ));
    if (duplicate) return duplicate;

    return this.recordEvent({
      type: MemoryEventType.KNOWLEDGE_ENCOUNTERED,
      concept: canonicalName,
      observedAlias,
      context,
      knowledgeType,
      relatedConcepts,
      timestamp
    });
  }

  recordFeedback({
    type,
    concept,
    context,
    knowledgeType,
    explanationVersionId,
    previousExplanationVersionId,
    requestedStyle,
    explanationStyle,
    factSensitivity,
    timestamp
  }) {
    return this.recordEvent({
      type,
      concept,
      context,
      knowledgeType,
      explanationVersionId,
      previousExplanationVersionId,
      requestedStyle,
      explanationStyle,
      factSensitivity,
      timestamp
    });
  }

  recordRegenerationRequested({
    concept,
    context,
    knowledgeType,
    previousExplanationVersionId,
    requestedStyle,
    timestamp
  }) {
    return this.recordFeedback({
      type: MemoryEventType.REQUESTED_REGENERATION,
      concept,
      context,
      knowledgeType,
      previousExplanationVersionId,
      requestedStyle,
      timestamp
    });
  }

  recordExplanationVersion(version = {}) {
    const timestamp = version.timestamp ?? this.now();
    const safe = sanitizeExplanationVersion({
      ...version,
      timestamp,
      target: normalizeKnowledgeObjectName(version.target ?? version.concept ?? "")
    }, this.config);
    const id = safe.id ?? `ver_${timestamp}_${this.data.explanationVersions.length}`;
    const stored = { ...safe, id };
    this.data.explanationVersions.push(stored);
    this.storage.save(this.data);
    return stored;
  }

  recordAgentSummary({ canonicalName, sourceEventIds = [], uncertainty = "low", summary = {}, timestamp = this.now() }) {
    const stored = {
      id: `summary_${timestamp}_${this.data.agentSummaries.length}`,
      canonicalName: normalizeKnowledgeObjectName(canonicalName),
      sourceEventIds: sourceEventIds.slice(0, 12),
      uncertainty,
      timestamp,
      summary
    };
    this.data.agentSummaries.push(stored);
    this.storage.save(this.data);
    return stored;
  }

  async recordSummaryVector({ id, canonicalName, summary = {}, vector = [], metadata = {}, text = "" }) {
    const vectorStore = this.storage.storage;
    if (!vectorStore?.putVector) {
      return {
        status: "unavailable",
        reason: "vector_store_unavailable",
        vector: null
      };
    }
    const stored = await vectorStore.putVector({
      id,
      namespace: "learning-memory",
      vector,
      text,
      metadata: {
        canonicalName: normalizeKnowledgeObjectName(canonicalName),
        summary,
        ...metadata
      }
    });
    return { status: "available", ...stored };
  }

  async retrieveSimilarMemories({ vector = [], limit = 5 } = {}) {
    const vectorStore = this.storage.storage;
    if (!vectorStore?.findSimilarVectors || !Array.isArray(vector) || vector.length === 0) {
      return [];
    }
    return vectorStore.findSimilarVectors({
      namespace: "learning-memory",
      vector,
      limit
    });
  }

  getEvents(concept = null) {
    if (!concept) return [...this.data.events];
    const canonicalName = normalizeKnowledgeObjectName(concept);
    return this.data.events.filter((event) => event.canonicalName === canonicalName);
  }

  getLearningContext(concept, { fragmentId = null, timestamp = this.now(), profileHints = {}, candidate = null } = {}) {
    const canonicalName = normalizeKnowledgeObjectName(concept);
    const events = this.getEvents(canonicalName);
    const derivedSignals = this.deriveSignals(canonicalName, timestamp);
    const relatedConcepts = new Set();
    const aliases = new Set();

    for (const event of events) {
      if (event.observedAlias) aliases.add(event.observedAlias);
      for (const related of event.relatedConcepts ?? []) {
        relatedConcepts.add(related);
      }
    }

    const recentTopics = this.data.events
      .filter((event) => timestamp - event.timestamp <= 30 * 60 * 1000)
      .map((event) => ({ canonicalName: event.canonicalName, type: event.type, timestamp: event.timestamp }))
      .filter((event) => event.canonicalName !== canonicalName)
      .slice(-8);

    return {
      canonicalName,
      events,
      aliases: Array.from(aliases),
      relatedConcepts: Array.from(relatedConcepts),
      recentTopics,
      derivedSignals,
      feedbackEvents: events.filter((event) => FEEDBACK_TYPES.has(event.type)),
      priorExplanations: this.getExplanationVersions(canonicalName),
      profileHints,
      cooldowns: {
        recentDismissal: hasRecentEvent(events, MemoryEventType.DISMISSED, timestamp, this.config.inference.dismissalCooldownMs),
        recentlyExplained: hasRecentEvent(events, MemoryEventType.EXPLANATION_SHOWN, timestamp, this.config.inference.recentlyExplainedCooldownMs),
        paragraph: fragmentId
          ? hasRecentParagraphPrompt(this.data.events, fragmentId, timestamp, this.config.inference.paragraphCooldownMs)
          : false
      },
      retrievalMode: "exact_alias_recency",
      retrievalPacket: this.getRetrievalPacket(canonicalName, { timestamp, profileHints, candidate, fragmentId })
    };
  }

  getExplanationVersions(concept = null) {
    if (!concept) return [...this.data.explanationVersions];
    const canonicalName = normalizeKnowledgeObjectName(concept);
    return this.data.explanationVersions.filter((version) => version.target === canonicalName);
  }

  getRetrievalPacket(concept, { timestamp = this.now(), profileHints = {}, candidate = null, fragmentId = null } = {}) {
    const canonicalName = normalizeKnowledgeObjectName(concept);
    const events = this.getEvents(canonicalName);
    const derivedSignals = this.deriveSignals(canonicalName, timestamp);
    const cooldowns = {
      recentDismissal: hasRecentEvent(events, MemoryEventType.DISMISSED, timestamp, this.config.inference.dismissalCooldownMs),
      recentlyExplained: hasRecentEvent(events, MemoryEventType.EXPLANATION_SHOWN, timestamp, this.config.inference.recentlyExplainedCooldownMs),
      paragraph: fragmentId
        ? hasRecentParagraphPrompt(this.data.events, fragmentId, timestamp, this.config.inference.paragraphCooldownMs)
        : false
    };
    const packet = buildRetrievalPacket({
      canonicalName,
      candidate,
      events: this.data.events,
      explanationVersions: this.data.explanationVersions,
      derivedSignals,
      cooldowns,
      profileHints,
      timestamp,
      maxRelatedObjects: this.config.knowledge?.maxRelatedObjects ?? 5
    });

    if (packet.agentSummary.evidenceEventIds.length) {
      const existing = this.data.agentSummaries.find((summary) => (
        summary.canonicalName === canonicalName &&
        summary.sourceEventIds.join("|") === packet.agentSummary.evidenceEventIds.join("|")
      ));
      if (!existing) {
        this.recordAgentSummary({
          canonicalName,
          sourceEventIds: packet.agentSummary.evidenceEventIds,
          uncertainty: packet.agentSummary.uncertainty.confidence,
          summary: packet.agentSummary,
          timestamp
        });
      }
    }

    return packet;
  }

  deriveSignals(concept, timestamp = this.now()) {
    const events = this.getEvents(concept);
    const recent = (type, windowMs) => events.filter(
      (event) => event.type === type && timestamp - event.timestamp <= windowMs
    );

    const repeatedConfusion = events.filter((event) => event.type === MemoryEventType.REPEATED_CONFUSION).length;
    const expansions = events.filter((event) => event.type === MemoryEventType.EXPANDED).length;
    const dismissals = recent(MemoryEventType.DISMISSED, 30 * 60 * 1000).length;
    const recentSeen = recent(MemoryEventType.RECENTLY_SEEN, 30 * 60 * 1000).length;
    const markedKnown = recent(MemoryEventType.MARKED_KNOWN, this.config.profile?.feedbackCooldownMs ?? 30 * 60 * 1000).length;
    const markedWrong = recent(MemoryEventType.MARKED_WRONG, this.config.profile?.feedbackCooldownMs ?? 30 * 60 * 1000).length;
    const markedConfusing = events.filter((event) => [
      MemoryEventType.MARKED_CONFUSING,
      MemoryEventType.REQUESTED_SIMPLER,
      MemoryEventType.REQUESTED_MORE_CONTEXT
    ].includes(event.type)).length;
    const mutedObject = events.some((event) => event.type === MemoryEventType.MUTED_OBJECT);
    const explanationShown = recent(
      MemoryEventType.EXPLANATION_SHOWN,
      this.config.inference.recentlyExplainedCooldownMs
    ).length;

    return {
      [DerivedSignal.POSSIBLY_WEAK]: repeatedConfusion >= 2 || expansions >= 2,
      [DerivedSignal.NEEDS_REVIEW]: repeatedConfusion >= 1 || expansions >= 2,
      [DerivedSignal.POSSIBLY_FAMILIAR]: recentSeen >= 2 && repeatedConfusion === 0,
      [DerivedSignal.RECENTLY_EXPLAINED]: explanationShown > 0,
      [DerivedSignal.LOW_INTERVENTION_PREFERRED]: dismissals >= 2 || markedKnown > 0,
      [DerivedSignal.RECENTLY_MARKED_KNOWN]: markedKnown > 0,
      [DerivedSignal.POSSIBLY_CONFUSING]: markedConfusing >= 1,
      [DerivedSignal.CAUTION_REQUIRED]: markedWrong > 0,
      [DerivedSignal.OBJECT_MUTED]: mutedObject
    };
  }
}

function hasRecentEvent(events, type, timestamp, windowMs) {
  return events.some((event) => event.type === type && timestamp - event.timestamp <= windowMs);
}

function hasRecentParagraphPrompt(events, fragmentId, timestamp, windowMs) {
  return events.some((event) => (
    event.type === MemoryEventType.PARAGRAPH_PROMPTED &&
    event.context?.fragmentId === fragmentId &&
    timestamp - event.timestamp <= windowMs
  ));
}

function clampAlias(alias, config) {
  return String(alias).replace(/\s+/g, " ").trim().slice(0, config.privacy.maxStoredAliasChars);
}
