import { DEFAULT_CONFIG } from "./config.js";
import { ExplanationStyle, MemoryEventType } from "./contracts.js";
import { normalizeKnowledgeObjectName } from "./concepts.js";
import { sanitizeProfileEvidence } from "./privacy.js";

const OBJECT_CLEAR_TYPES = new Set([MemoryEventType.CLEARED_OBJECT_PREFERENCE]);
const CATEGORY_CLEAR_TYPES = new Set([MemoryEventType.CLEARED_CATEGORY_PREFERENCE]);

export class ProfileStorage {
  constructor(storage = null, key = "bco.readingProfile") {
    this.storage = storage;
    this.key = key;
    this.fallback = { events: [] };
    this.ready = Promise.resolve(storage?.ready).then(() => this.load()).catch(() => this.fallback);
  }

  load() {
    try {
      const raw = this.storage?.getItem?.(this.key);
      if (!raw) return this.fallback;
      const parsed = JSON.parse(raw);
      return { events: Array.isArray(parsed.events) ? parsed.events : [] };
    } catch {
      return this.fallback;
    }
  }

  save(data) {
    this.fallback = data;
    try {
      this.storage?.setItem?.(this.key, JSON.stringify(data));
    } catch {
      // Profile learning should never break the reader.
    }
  }
}

export class UserReadingProfile {
  constructor({ storage = null, config = DEFAULT_CONFIG, now = () => Date.now() } = {}) {
    this.storage = new ProfileStorage(storage);
    this.config = config;
    this.now = now;
    this.data = this.storage.load();
    this.ready = this.storage.ready.then((data) => {
      this.data = data;
      return this;
    });
  }

  recordFeedback(event = {}) {
    const timestamp = event.timestamp ?? this.now();
    const canonicalName = normalizeKnowledgeObjectName(event.concept ?? event.canonicalName ?? "");
    const safe = {
      id: event.id ?? `profile_${timestamp}_${this.data.events.length}`,
      type: event.type,
      canonicalName,
      knowledgeType: event.knowledgeType ?? null,
      explanationStyle: event.explanationStyle ?? event.requestedStyle ?? null,
      requestedStyle: event.requestedStyle ?? null,
      explanationVersionId: event.explanationVersionId ?? null,
      timestamp
    };

    this.data.events.push(safe);
    this.storage.save(this.data);
    return safe;
  }

  clearObjectPreference(concept, timestamp = this.now()) {
    return this.recordFeedback({
      type: MemoryEventType.CLEARED_OBJECT_PREFERENCE,
      concept,
      timestamp
    });
  }

  clearCategoryPreference(knowledgeType, timestamp = this.now()) {
    return this.recordFeedback({
      type: MemoryEventType.CLEARED_CATEGORY_PREFERENCE,
      knowledgeType,
      timestamp
    });
  }

  getProfileHints({ canonicalName = "", knowledgeType = null, timestamp = this.now() } = {}) {
    const normalizedName = normalizeKnowledgeObjectName(canonicalName);
    const events = this.relevantEvents(timestamp);
    const objectEvents = events.filter((event) => event.canonicalName === normalizedName);
    const categoryEvents = knowledgeType ? events.filter((event) => event.knowledgeType === knowledgeType) : [];
    const objectClearedAt = latestTimestamp(objectEvents.filter((event) => OBJECT_CLEAR_TYPES.has(event.type)));
    const categoryClearedAt = latestTimestamp(categoryEvents.filter((event) => CATEGORY_CLEAR_TYPES.has(event.type)));
    const activeObjectEvents = objectEvents.filter((event) => event.timestamp > objectClearedAt);
    const activeCategoryEvents = categoryEvents.filter((event) => event.timestamp > categoryClearedAt);
    const mutedObject = activeObjectEvents.some((event) => event.type === MemoryEventType.MUTED_OBJECT);
    const mutedCategory = activeCategoryEvents.some((event) => event.type === MemoryEventType.MUTED_CATEGORY);
    const knownEvents = activeObjectEvents.filter((event) => event.type === MemoryEventType.MARKED_KNOWN);
    const confusingEvents = activeObjectEvents.filter((event) => [
      MemoryEventType.MARKED_CONFUSING,
      MemoryEventType.REQUESTED_SIMPLER,
      MemoryEventType.REQUESTED_MORE_CONTEXT
    ].includes(event.type));
    const wrongEvents = activeObjectEvents.filter((event) => event.type === MemoryEventType.MARKED_WRONG);
    const categoryInterestEvents = activeCategoryEvents.filter((event) => [
      MemoryEventType.EXPANDED,
      MemoryEventType.MARKED_KNOWN,
      MemoryEventType.REQUESTED_MORE_CONTEXT
    ].includes(event.type));
    const preferredStyle = preferredStyleFrom(activeObjectEvents.concat(activeCategoryEvents), this.config);

    return {
      canonicalName: normalizedName,
      knowledgeType,
      categoryInterest: categoryInterestEvents.length,
      categoryMuted: mutedCategory,
      objectMuted: mutedObject,
      familiarObject: knownEvents.length > 0,
      difficultObject: confusingEvents.length > 0,
      cautionRequired: wrongEvents.length > 0,
      preferredStyle,
      evidence: activeObjectEvents.concat(activeCategoryEvents).map((event) => sanitizeProfileEvidence(event, this.config)),
      uncertainty: {
        confidence: activeObjectEvents.length + activeCategoryEvents.length >= 3 ? "medium" : "low",
        reason: "feedback_events"
      }
    };
  }

  relevantEvents(timestamp = this.now()) {
    const windowMs = this.config.profile.evidenceWindowMs;
    return this.data.events.filter((event) => timestamp - event.timestamp <= windowMs);
  }
}

function preferredStyleFrom(events, config) {
  const counts = new Map();
  for (const event of events) {
    const style = event.explanationStyle ?? event.requestedStyle;
    if (!style) continue;
    counts.set(style, (counts.get(style) ?? 0) + 1);
  }

  const [style, count] = Array.from(counts.entries()).sort((left, right) => right[1] - left[1])[0] ?? [];
  if (count >= config.profile.stylePreferenceThreshold) return style;
  return ExplanationStyle.CONCISE;
}

function latestTimestamp(events) {
  return events.reduce((latest, event) => Math.max(latest, event.timestamp ?? 0), -1);
}
