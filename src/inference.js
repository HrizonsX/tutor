import { DEFAULT_CONFIG } from "./config.js";
import { DerivedSignal, FactSensitivity, SuppressionReason } from "./contracts.js";

export function scoreIntervention({
  fragment = null,
  behavior = {},
  candidates = [],
  learningContext = {},
  config = DEFAULT_CONFIG
} = {}) {
  const topCandidate = candidates[0] ?? null;
  const conceptDense = candidates.length >= 2;
  const selectedPreciseTerm = Boolean(behavior.selectedPreciseTerm && topCandidate);
  const repeatedRevisit = Number(behavior.revisitCount ?? 0) >= 2;
  const repeatedPause = Number(behavior.repeatedPauseCount ?? 0) >= 2;
  const dwellSignal = Boolean(behavior.dwellSignal);
  const memoryWeak = Boolean(learningContext.derivedSignals?.possibly_weak);
  const recentlyExplained = Boolean(learningContext.cooldowns?.recentlyExplained);
  const lowIntervention = Boolean(learningContext.derivedSignals?.low_intervention_preferred);
  const profileHints = learningContext.profileHints ?? {};
  const factSensitivity =
    learningContext.factSensitivity ??
    learningContext.retrievalPacket?.target?.factSensitivity ??
    topCandidate?.factSensitivity;
  const sourceVerified = learningContext.sourceVerified ?? learningContext.retrievalPacket?.sourceVerified;
  const factSensitiveUnverified =
    factSensitivity === FactSensitivity.NEEDS_SOURCE &&
    sourceVerified !== true &&
    config.knowledge?.factSensitiveFallback !== "background_only";

  const suppressions = [];
  if (behavior.inactive) suppressions.push(SuppressionReason.INACTIVE);
  if (behavior.largeSelection) suppressions.push(SuppressionReason.LARGE_SELECTION);
  if (behavior.codeSelection) suppressions.push(SuppressionReason.CODE_SELECTION);
  if (learningContext.cooldowns?.recentDismissal) suppressions.push(SuppressionReason.RECENT_DISMISSAL);
  if (learningContext.cooldowns?.paragraph) suppressions.push(SuppressionReason.PARAGRAPH_COOLDOWN);
  if (profileHints.objectMuted || learningContext.derivedSignals?.[DerivedSignal.OBJECT_MUTED]) {
    suppressions.push(SuppressionReason.MUTED_OBJECT);
  }
  if (profileHints.categoryMuted) suppressions.push(SuppressionReason.MUTED_CATEGORY);
  if (learningContext.derivedSignals?.[DerivedSignal.RECENTLY_MARKED_KNOWN]) {
    suppressions.push(SuppressionReason.RECENTLY_MARKED_KNOWN);
  }
  if (factSensitiveUnverified) suppressions.push(SuppressionReason.FACT_SENSITIVE_UNVERIFIED);

  const hasSpecificConcept = Boolean(topCandidate && !topCandidate.generic && (topCandidate.phraseLevel || topCandidate.semanticKey));
  const hasValidContentSignal = Boolean(topCandidate && (hasSpecificConcept || conceptDense || selectedPreciseTerm));
  const hasBeyondDwellBehavior = repeatedRevisit || selectedPreciseTerm || repeatedPause;
  const hasBehaviorOrMemorySignal =
    hasBeyondDwellBehavior ||
    memoryWeak ||
    Boolean(profileHints.difficultObject) ||
    Boolean(learningContext.derivedSignals?.[DerivedSignal.POSSIBLY_CONFUSING]) ||
    (dwellSignal && conceptDense);

  let priority = 0;
  const reasons = [];

  if (topCandidate) {
    priority += Math.min(0.32, topCandidate.complexity * 0.28);
    reasons.push("specific_concept");
  }
  if (conceptDense) {
    priority += 0.22;
    reasons.push("concept_dense");
  }
  if (dwellSignal) {
    priority += 0.1;
    reasons.push("dwell");
  }
  if (repeatedRevisit) {
    priority += 0.24;
    reasons.push("revisit");
  }
  if (selectedPreciseTerm) {
    priority += 0.44;
    reasons.push("selected_precise_term");
  }
  if (topCandidate?.semanticKey) {
    priority += 0.06;
    reasons.push("semantic_key_object");
  }
  if (repeatedPause) {
    priority += 0.16;
    reasons.push("repeated_pause");
  }
  if (memoryWeak) {
    priority += 0.35;
    reasons.push("possibly_weak");
  }
  if ((learningContext.relatedConcepts?.length ?? 0) > 0) {
    priority += 0.06;
    reasons.push("related_memory");
  }
  if (hasValidContentSignal && Number(profileHints.categoryInterest ?? 0) > 0) {
    priority += Math.min(0.16, config.inference.profileInterestBoost * profileHints.categoryInterest);
    reasons.push("profile_interest");
  }
  if (profileHints.difficultObject || learningContext.derivedSignals?.[DerivedSignal.POSSIBLY_CONFUSING]) {
    priority += config.inference.profileDifficultyBoost;
    reasons.push("profile_difficulty");
  }
  if (profileHints.preferredStyle) {
    reasons.push(`preferred_style:${profileHints.preferredStyle}`);
  }

  if (recentlyExplained && !hasBeyondDwellBehavior && !memoryWeak) {
    priority -= 0.32;
    suppressions.push(SuppressionReason.RECENTLY_EXPLAINED);
  }
  if (lowIntervention) {
    priority -= config.inference.lowInterventionPenalty;
    suppressions.push(SuppressionReason.LOW_INTERVENTION);
  }
  if (profileHints.familiarObject || learningContext.derivedSignals?.[DerivedSignal.RECENTLY_MARKED_KNOWN]) {
    priority -= config.inference.markedKnownPenalty;
  }
  if (profileHints.objectMuted || profileHints.categoryMuted || learningContext.derivedSignals?.[DerivedSignal.OBJECT_MUTED]) {
    priority -= config.inference.mutedPenalty;
  }
  if (profileHints.cautionRequired || learningContext.derivedSignals?.[DerivedSignal.CAUTION_REQUIRED]) {
    priority -= config.inference.wrongExplanationPenalty;
    reasons.push("prior_inaccuracy_feedback");
  }

  if (!hasValidContentSignal) suppressions.push(SuppressionReason.NO_CONTENT_SIGNAL);
  if (!hasBehaviorOrMemorySignal) suppressions.push(SuppressionReason.NO_BEHAVIOR_OR_MEMORY_SIGNAL);
  if (dwellSignal && !hasBeyondDwellBehavior && !memoryWeak && !conceptDense) {
    suppressions.push(SuppressionReason.DWELL_ONLY);
  }

  priority = Math.max(0, Math.min(1, Number(priority.toFixed(3))));
  const hardSuppression = suppressions.some((reason) => [
    SuppressionReason.INACTIVE,
    SuppressionReason.LARGE_SELECTION,
    SuppressionReason.CODE_SELECTION,
    SuppressionReason.RECENT_DISMISSAL,
    SuppressionReason.PARAGRAPH_COOLDOWN,
    SuppressionReason.MUTED_OBJECT,
    SuppressionReason.MUTED_CATEGORY,
    SuppressionReason.DWELL_ONLY,
    SuppressionReason.NO_CONTENT_SIGNAL,
    SuppressionReason.NO_BEHAVIOR_OR_MEMORY_SIGNAL,
    SuppressionReason.FACT_SENSITIVE_UNVERIFIED
  ].includes(reason));

  return {
    shouldShow: !hardSuppression && priority >= config.inference.showThreshold,
    priority,
    candidate: topCandidate,
    reasons: Array.from(new Set(reasons)),
    suppressions: Array.from(new Set(suppressions)),
    hasValidContentSignal,
    hasBehaviorOrMemorySignal,
    explanationStyle: profileHints.preferredStyle ?? config.composer?.defaultStyle ?? "concise",
    fragmentId: fragment?.id ?? behavior.fragmentId ?? null
  };
}
