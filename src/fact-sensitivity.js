// @ts-nocheck
import { FactSensitivity, KnowledgeType, MemoryEventType } from "./contracts.js";

const FACT_SENSITIVE_TYPES = new Set([
  KnowledgeType.PERSON,
  KnowledgeType.ORGANIZATION
]);

const RECENT_OR_DISPUTED_PATTERNS = [
  /\b(today|yesterday|latest|recent|current|new|CEO|lawsuit|rumor|controversy|acquisition)\b/i,
  /\b(202[4-9]|203[0-9])\b/
];

export function classifyFactSensitivity({
  candidate = null,
  fragment = null,
  feedbackEvents = []
} = {}) {
  const text = `${candidate?.observedText ?? ""} ${candidate?.canonicalName ?? ""} ${fragment?.text ?? ""}`;
  const type = candidate?.knowledgeType;
  const markedWrong = feedbackEvents.some((event) => event.type === MemoryEventType.MARKED_WRONG);

  if (markedWrong) {
    return {
      level: FactSensitivity.NEEDS_SOURCE,
      requiresSource: true,
      reason: "prior_inaccuracy_feedback"
    };
  }

  if (FACT_SENSITIVE_TYPES.has(type) && RECENT_OR_DISPUTED_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      level: FactSensitivity.NEEDS_SOURCE,
      requiresSource: true,
      reason: "current_or_disputed_object"
    };
  }

  if (RECENT_OR_DISPUTED_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      level: FactSensitivity.FACT_SENSITIVE,
      requiresSource: true,
      reason: "recent_or_time_sensitive_context"
    };
  }

  return {
    level: candidate?.factSensitivity ?? FactSensitivity.STABLE,
    requiresSource: candidate?.factSensitivity === FactSensitivity.NEEDS_SOURCE,
    reason: candidate?.factSensitivity === FactSensitivity.NEEDS_SOURCE ? "object_marked_sensitive" : "stable_background"
  };
}

export function canExplainWithoutSource(factSensitivity, config) {
  if (!factSensitivity?.requiresSource) return true;
  return config?.knowledge?.factSensitiveFallback === "background_only";
}
