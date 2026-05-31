import { DEFAULT_CONFIG } from "./config.js";

export function clampText(text = "", limit = DEFAULT_CONFIG.privacy.maxContextChars) {
  const normalized = String(text).replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return normalized.slice(0, limit).trim();
}

export function hashString(value = "") {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function clampSourceIds(values = [], limit = 12) {
  return Array.isArray(values)
    ? values.map((value) => clampText(value, 120)).filter(Boolean).slice(0, limit)
    : [];
}

export function clampSourceDate(value = "") {
  const text = String(value ?? "").trim();
  const match = text.match(/^\d{4}-\d{2}-\d{2}$/);
  return match ? text : "";
}

export function contextHash(context = {}) {
  return hashString(JSON.stringify({
    fragmentId: context.fragmentId ?? null,
    fragmentType: context.fragmentType ?? null,
    pageOrigin: context.pageOrigin ?? null,
    pagePathHash: context.pagePathHash ?? null,
    titleHash: context.titleHash ?? null
  }));
}

export function evidenceTextHash(value = "") {
  return value ? hashString(clampText(value, 600)) : null;
}

export function sanitizeRelationEvidence(evidence = {}, config = DEFAULT_CONFIG) {
  const context = evidence.context ?? {};
  return {
    sourceEventIds: clampSourceIds(evidence.sourceEventIds ?? evidence.evidenceEventIds, 12),
    sourceExplanationVersionIds: clampSourceIds(evidence.sourceExplanationVersionIds, 12),
    sourceDates: Array.isArray(evidence.sourceDates)
      ? evidence.sourceDates.map(clampSourceDate).filter(Boolean).slice(0, 8)
      : [],
    contextHash: evidence.contextHash ?? contextHash(context),
    evidenceTextHash: evidence.evidenceTextHash ?? evidenceTextHash(evidence.evidenceText ?? ""),
    sourceKind: clampText(evidence.sourceKind ?? "unknown", config.privacy.maxStoredAliasChars),
    proposerVersion: clampText(evidence.proposerVersion ?? evidence.extractorVersion ?? "", config.privacy.maxStoredAliasChars),
    confidenceReason: clampText(evidence.confidenceReason ?? evidence.gateReason ?? "", 180)
  };
}

export function safeUrlMetadata(url = "") {
  try {
    const parsed = new URL(url);
    return {
      origin: parsed.origin,
      pathHash: hashString(parsed.pathname + parsed.search)
    };
  } catch {
    return {
      origin: "",
      pathHash: hashString(url)
    };
  }
}

export function buildAnalysisPayload(fragment, candidates = [], config = DEFAULT_CONFIG) {
  return {
    fragmentId: fragment?.id,
    fragmentType: fragment?.type,
    text: clampText(fragment?.text ?? "", config.privacy.maxContextChars),
    concepts: candidates.map((candidate) => ({
      canonicalName: candidate.canonicalName,
      observedText: clampText(candidate.observedText, 120),
      knowledgeType: candidate.knowledgeType ?? null,
      factSensitivity: candidate.factSensitivity ?? null
    }))
  };
}

export function sanitizeEventContext(context = {}, config = DEFAULT_CONFIG) {
  const url = safeUrlMetadata(context.url ?? "");
  return {
    fragmentId: context.fragmentId ?? null,
    fragmentType: context.fragmentType ?? null,
    pageOrigin: url.origin.slice(0, config.privacy.maxStoredUrlChars),
    pagePathHash: url.pathHash,
    titleHash: context.title ? hashString(context.title) : null,
    relatedConcepts: Array.isArray(context.relatedConcepts)
      ? context.relatedConcepts.slice(0, 5)
      : []
  };
}

export function sanitizeKnowledgeContext(context = {}, config = DEFAULT_CONFIG) {
  return {
    ...sanitizeEventContext(context, config),
    knowledgeType: context.knowledgeType ?? null,
    explanationVersionId: context.explanationVersionId ?? null,
    previousExplanationVersionId: context.previousExplanationVersionId ?? null,
    requestedStyle: context.requestedStyle ?? null,
    feedbackType: context.feedbackType ?? null
  };
}

export function sanitizeExplanationVersion(version = {}, config = DEFAULT_CONFIG) {
  return {
    id: version.id ?? null,
    target: clampText(version.target ?? version.concept ?? "", config.privacy.maxStoredAliasChars),
    style: version.style ?? null,
    text: clampText(version.text ?? "", config.composer?.maxMicroChars ?? 220),
    timestamp: version.timestamp ?? null,
    previousVersionId: version.previousVersionId ?? null,
    feedbackEventId: version.feedbackEventId ?? null,
    factSensitivity: version.factSensitivity ?? null,
    status: version.status ?? null,
    source: version.source ?? version.versionMetadata?.source ?? null,
    provider: version.provider ?? version.versionMetadata?.provider ?? null,
    model: version.model ?? version.versionMetadata?.model ?? null
  };
}

export function sanitizeProfileEvidence(event = {}, config = DEFAULT_CONFIG) {
  return {
    id: event.id ?? null,
    type: event.type ?? null,
    canonicalName: clampText(event.canonicalName ?? "", config.privacy.maxStoredAliasChars),
    knowledgeType: event.knowledgeType ?? null,
    explanationStyle: event.explanationStyle ?? event.requestedStyle ?? null,
    timestamp: event.timestamp ?? null,
    explanationVersionId: event.explanationVersionId ?? null
  };
}

export function createSafeModelContext(fragment, learningContext, config = DEFAULT_CONFIG) {
  return {
    fragment: {
      id: fragment?.id,
      type: fragment?.type,
      text: clampText(fragment?.text ?? "", config.privacy.maxContextChars)
    },
    concept: learningContext?.canonicalName ?? null,
    derivedSignals: learningContext?.derivedSignals ?? {},
    relatedConcepts: (learningContext?.relatedConcepts ?? []).slice(0, 5)
  };
}
