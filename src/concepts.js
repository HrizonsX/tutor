// @ts-nocheck
import { clampText } from "./privacy.js";
import { FactSensitivity, FragmentType, KnowledgeType } from "./contracts.js";

const GENERIC_TERMS = new Set([
  "policy",
  "model",
  "attention",
  "reward",
  "cache",
  "routing",
  "objective",
  "gradient",
  "distribution"
]);

export const CONCEPT_DEFINITIONS = Object.freeze([
  {
    canonicalName: "KL divergence",
    aliases: ["KL divergence", "KL div", "Kullback-Leibler divergence"],
    knowledgeType: KnowledgeType.TECHNOLOGY,
    factSensitivity: FactSensitivity.STABLE,
    complexity: 0.92,
    micro: "KL divergence measures how much one probability distribution differs from another.",
    expanded:
      "KL divergence compares two probability distributions. In learning algorithms, it is often used as a distance check so an updated model or policy does not move too far from a previous one.",
    prerequisites: ["probability distribution"],
    relatedConcepts: ["policy gradient", "PPO clipping"]
  },
  {
    canonicalName: "policy gradient",
    aliases: ["policy gradient", "policy-gradient"],
    knowledgeType: KnowledgeType.TECHNOLOGY,
    factSensitivity: FactSensitivity.STABLE,
    complexity: 0.88,
    micro: "Policy gradient updates a policy by nudging actions that led to better rewards upward.",
    expanded:
      "A policy gradient method changes the policy directly using feedback from rewards. It estimates which action choices helped and adjusts the policy toward those choices.",
    prerequisites: ["policy", "reward"],
    relatedConcepts: ["KL divergence", "PPO clipping"]
  },
  {
    canonicalName: "PPO clipping",
    aliases: ["PPO clipping", "PPO clip", "clipped objective", "clip objective"],
    knowledgeType: KnowledgeType.TECHNOLOGY,
    factSensitivity: FactSensitivity.STABLE,
    complexity: 0.9,
    micro: "PPO clipping limits how much a policy update can change at once.",
    expanded:
      "PPO clipping keeps policy updates within a small range. If the new policy tries to move too far from the old policy, the clipped objective reduces the incentive for that move.",
    prerequisites: ["policy gradient"],
    relatedConcepts: ["KL divergence", "policy gradient"]
  },
  {
    canonicalName: "reward model",
    aliases: ["reward model", "reward models"],
    knowledgeType: KnowledgeType.TECHNOLOGY,
    factSensitivity: FactSensitivity.STABLE,
    complexity: 0.75,
    micro: "A reward model predicts which outputs should count as better for training.",
    expanded:
      "A reward model turns feedback or preferences into a score. Training can then use that score as a stand-in for the desired behavior.",
    prerequisites: ["reward"],
    relatedConcepts: ["policy gradient"]
  },
  {
    canonicalName: "KV cache",
    aliases: ["KV cache", "key-value cache", "key value cache", "K/V cache"],
    knowledgeType: KnowledgeType.TECHNOLOGY,
    factSensitivity: FactSensitivity.STABLE,
    complexity: 0.78,
    micro: "KV cache stores prior attention keys and values so generation does not recompute them.",
    expanded:
      "A KV cache keeps the key and value tensors from earlier tokens. During generation, the model can reuse them instead of recomputing attention over the whole prefix.",
    prerequisites: ["self-attention"],
    relatedConcepts: ["self-attention"]
  },
  {
    canonicalName: "self-attention",
    aliases: ["self-attention", "self attention", "attention mechanism"],
    knowledgeType: KnowledgeType.TECHNOLOGY,
    factSensitivity: FactSensitivity.STABLE,
    complexity: 0.82,
    micro: "Self-attention lets each token choose which other tokens in the same sequence matter most.",
    expanded:
      "Self-attention computes relationships between tokens in one sequence. Each token forms a weighted view of other tokens, which helps the model combine context.",
    prerequisites: ["embedding"],
    relatedConcepts: ["KV cache"]
  },
  {
    canonicalName: "Mixture-of-Experts routing",
    aliases: ["Mixture-of-Experts routing", "MoE routing", "expert routing", "router"],
    knowledgeType: KnowledgeType.TECHNOLOGY,
    factSensitivity: FactSensitivity.STABLE,
    complexity: 0.87,
    micro: "MoE routing chooses which expert networks should handle each token.",
    expanded:
      "Mixture-of-Experts routing sends each token to a small subset of expert networks. The model gains capacity without running every expert for every token.",
    prerequisites: ["feed-forward network"],
    relatedConcepts: ["self-attention"]
  },
  {
    canonicalName: "probability distribution",
    aliases: ["probability distribution", "probability distributions"],
    knowledgeType: KnowledgeType.TECHNOLOGY,
    factSensitivity: FactSensitivity.STABLE,
    complexity: 0.62,
    micro: "A probability distribution describes how likely each possible outcome is.",
    expanded:
      "A probability distribution assigns likelihood to outcomes. Many ML concepts compare or update distributions over labels, tokens, or actions.",
    prerequisites: [],
    relatedConcepts: ["KL divergence"]
  }
]);

export const GENERAL_KNOWLEDGE_DEFINITIONS = Object.freeze([
  {
    canonicalName: "Thucydides Trap",
    aliases: ["Thucydides Trap", "Thucydides's Trap", "修昔底德陷阱"],
    knowledgeType: KnowledgeType.HISTORICAL_ALLUSION,
    factSensitivity: FactSensitivity.STABLE,
    complexity: 0.74,
    micro: "Thucydides Trap is a historical analogy about rivalry between a rising power and an established power.",
    expanded:
      "Thucydides Trap refers to the risk of conflict when a rising power challenges a dominant one. Writers often use it as shorthand for geopolitical tension.",
    prerequisites: [],
    relatedConcepts: ["power transition"],
    contextCues: ["rivalry", "power", "geopolitical", "conflict", "analogy", "陷阱", "大国"]
  },
  {
    canonicalName: "Bretton Woods system",
    aliases: ["Bretton Woods system", "Bretton Woods", "布雷顿森林体系"],
    knowledgeType: KnowledgeType.ECONOMICS,
    factSensitivity: FactSensitivity.STABLE,
    complexity: 0.78,
    micro: "The Bretton Woods system was the postwar monetary order that tied many currencies to the US dollar and the dollar to gold.",
    expanded:
      "The Bretton Woods system shaped global finance after World War II. It made the US dollar central to exchange rates and is often cited when discussing modern monetary order.",
    prerequisites: ["currency exchange"],
    relatedConcepts: ["gold standard"],
    contextCues: ["currency", "dollar", "gold", "finance", "monetary", "postwar", "体系", "美元"]
  },
  {
    canonicalName: "Lagrange point",
    aliases: ["Lagrange point", "Lagrangian point", "L1 point", "L2 point", "拉格朗日点"],
    knowledgeType: KnowledgeType.ASTRONOMY,
    factSensitivity: FactSensitivity.STABLE,
    complexity: 0.72,
    micro: "A Lagrange point is a place where gravity and orbital motion balance so a spacecraft can stay relatively stable.",
    expanded:
      "Lagrange points are useful positions in orbital mechanics. Missions use them because less fuel is needed to remain near those points.",
    prerequisites: ["gravity", "orbit"],
    relatedConcepts: ["orbital mechanics"],
    contextCues: ["spacecraft", "orbit", "gravity", "telescope", "satellite", "轨道", "引力"]
  },
  {
    canonicalName: "Karst landform",
    aliases: ["Karst landform", "karst", "喀斯特地貌"],
    knowledgeType: KnowledgeType.GEOGRAPHY,
    factSensitivity: FactSensitivity.STABLE,
    complexity: 0.55,
    micro: "Karst landform describes terrain shaped by dissolving rock, often forming caves, sinkholes, and underground rivers.",
    expanded:
      "Karst landscapes form where water dissolves soluble rock such as limestone. The term often explains unusual caves, sinkholes, and rugged terrain.",
    prerequisites: [],
    relatedConcepts: ["limestone"],
    contextCues: ["cave", "limestone", "sinkhole", "terrain", "地貌", "溶洞"]
  },
  {
    canonicalName: "Dune",
    aliases: ["Dune", "沙丘"],
    knowledgeType: KnowledgeType.WORK,
    factSensitivity: FactSensitivity.STABLE,
    complexity: 0.5,
    micro: "Dune is a science-fiction story world centered on desert politics, empire, religion, and control of a vital spice.",
    expanded:
      "Dune often works as cultural shorthand for harsh desert worlds, imperial politics, prophecy, and resource control.",
    prerequisites: [],
    relatedConcepts: ["science fiction"],
    contextCues: ["film", "novel", "science fiction", "spice", "Arrakis", "movie", "小说", "电影"]
  },
  {
    canonicalName: "NASA",
    aliases: ["NASA", "National Aeronautics and Space Administration", "美国国家航空航天局"],
    knowledgeType: KnowledgeType.ORGANIZATION,
    factSensitivity: FactSensitivity.FACT_SENSITIVE,
    complexity: 0.42,
    micro: "NASA is the United States space agency, often mentioned in articles about space missions and aerospace research.",
    expanded:
      "NASA runs civilian space exploration, science, and aeronautics programs. Current mission details can be time-sensitive and may need sources.",
    prerequisites: [],
    relatedConcepts: ["Apollo program"],
    contextCues: ["space", "mission", "rocket", "moon", "agency", "航天", "任务"]
  },
  {
    canonicalName: "Apollo program",
    aliases: ["Apollo program", "Apollo missions", "阿波罗计划"],
    knowledgeType: KnowledgeType.HISTORICAL_EVENT,
    factSensitivity: FactSensitivity.STABLE,
    complexity: 0.58,
    micro: "The Apollo program was NASA's crewed Moon-landing program during the 1960s and early 1970s.",
    expanded:
      "The Apollo program is often used as a reference point for ambitious engineering, Cold War space competition, and lunar exploration.",
    prerequisites: [],
    relatedConcepts: ["NASA", "Cold War"],
    contextCues: ["moon", "lunar", "space race", "cold war", "登月", "冷战"]
  },
  {
    canonicalName: "Moore's law",
    aliases: ["Moore's law", "Moore law", "摩尔定律"],
    knowledgeType: KnowledgeType.TECHNOLOGY,
    factSensitivity: FactSensitivity.STABLE,
    complexity: 0.56,
    micro: "Moore's law is the observation that chip transistor density tended to grow rapidly over time.",
    expanded:
      "Moore's law is often used as shorthand for the historical pace of computing hardware improvement, even though its exact trend has changed.",
    prerequisites: [],
    relatedConcepts: ["semiconductor"],
    contextCues: ["chip", "semiconductor", "transistor", "compute", "芯片", "半导体"]
  }
]);

export const KNOWLEDGE_OBJECT_DEFINITIONS = Object.freeze([
  ...CONCEPT_DEFINITIONS,
  ...GENERAL_KNOWLEDGE_DEFINITIONS
]);

const ALIAS_TO_CANONICAL = buildAliasMap(KNOWLEDGE_OBJECT_DEFINITIONS);

export function normalizeConceptName(value = "") {
  const normalized = normalizeForMatch(value);
  return ALIAS_TO_CANONICAL.get(normalized) ?? titleFromText(value);
}

export const normalizeKnowledgeObjectName = normalizeConceptName;

export function isGenericTerm(value = "") {
  return GENERIC_TERMS.has(normalizeForMatch(value));
}

export function validateSelectedConcept({
  text = "",
  fragment = null,
  sourceText = "",
  beforeText = "",
  afterText = "",
  completedBy = "unknown",
  config = {}
} = {}) {
  const rawText = String(text ?? "");
  const trimmed = titleFromText(rawText);
  const normalizedText = normalizeForMatch(trimmed);
  const lineCount = trimmed ? trimmed.split(/\r?\n/).length : 0;
  const wordCount = normalizedText ? normalizedText.split(" ").length : 0;
  const largeSelectionChars = config.largeSelectionChars ?? 420;
  const largeSelectionLines = config.largeSelectionLines ?? 8;
  const knownCanonical = normalizedText ? ALIAS_TO_CANONICAL.get(normalizedText) : "";
  const hasKnownAlias = Boolean(knownCanonical);

  if (!trimmed) {
    return rejectedSelectedConcept("empty", completedBy, trimmed, normalizedText);
  }
  if (!hasKnownAlias && !/[\p{L}\p{N}]/u.test(trimmed)) {
    return rejectedSelectedConcept("punctuation_only", completedBy, trimmed, normalizedText);
  }
  if (trimmed.length >= largeSelectionChars || lineCount >= largeSelectionLines || wordCount > 6) {
    return rejectedSelectedConcept("large_selection", completedBy, trimmed, normalizedText);
  }
  if (fragment?.type === FragmentType.CODE || looksLikeCodeSelection(trimmed)) {
    return rejectedSelectedConcept("code_like_selection", completedBy, trimmed, normalizedText);
  }
  if (!hasKnownAlias && /^\p{Script=Han}$/u.test(trimmed)) {
    return rejectedSelectedConcept("too_short_cjk", completedBy, trimmed, normalizedText);
  }
  if (!hasKnownAlias && isPartialLatinWordSelection({ text: trimmed, sourceText, beforeText, afterText })) {
    return rejectedSelectedConcept("partial_word", completedBy, trimmed, normalizedText);
  }
  if (!normalizedText) {
    return rejectedSelectedConcept("punctuation_only", completedBy, trimmed, normalizedText);
  }

  return {
    status: "accepted",
    reason: null,
    text: trimmed,
    normalizedText,
    canonicalName: knownCanonical || normalizeConceptName(trimmed),
    completedBy
  };
}

export function looksLikeCodeSelection(text = "") {
  if (!text) return false;
  const codeTokens = [
    "=>",
    "function ",
    "const ",
    "let ",
    "var ",
    "import ",
    "class ",
    "{",
    "}",
    "def ",
    "return "
  ];
  const hits = codeTokens.filter((token) => text.includes(token)).length;
  return hits >= 2 || /;\s*$/.test(text.trim());
}

export function extractConceptCandidates({
  text = "",
  selectedText = "",
  memoryContext = null,
  maxContextChars = 1200,
  maxCandidates = Infinity
} = {}) {
  const boundedText = clampText(text, maxContextChars);
  const normalizedText = normalizeForMatch(boundedText);
  const selectionValidation = selectedText
    ? validateSelectedConcept({ text: selectedText, sourceText: boundedText })
    : { status: "rejected", normalizedText: "" };
  const normalizedSelection = selectionValidation.status === "accepted" ? selectionValidation.normalizedText : "";
  const candidates = [];

  for (const definition of KNOWLEDGE_OBJECT_DEFINITIONS) {
    for (const alias of definition.aliases) {
      const normalizedAlias = normalizeForMatch(alias);
      if (containsNormalizedPhrase(normalizedText, normalizedAlias)) {
        candidates.push(buildCandidate(definition, alias, normalizedSelection, memoryContext, boundedText));
        break;
      }
    }
  }

  const selectedCanonical = normalizedSelection
    ? findDefinitionByAlias(normalizedSelection)
    : null;
  if (
    selectedCanonical &&
    !candidates.some((candidate) => candidate.canonicalName === selectedCanonical.canonicalName)
  ) {
    candidates.push(buildCandidate(selectedCanonical, selectedText, normalizedSelection, memoryContext, boundedText));
  } else if (!selectedCanonical && selectedText && selectionValidation.status === "accepted") {
    candidates.push(buildAdHocCandidate(selectedText, boundedText, normalizedSelection));
  }

  return dedupeByCanonical(candidates)
    .filter((candidate) => !candidate.generic || candidate.selected)
    .sort((left, right) => right.score - left.score)
    .slice(0, maxCandidates);
}

export const extractKnowledgeObjectCandidates = extractConceptCandidates;

export function getConceptDefinition(conceptName) {
  const canonical = normalizeConceptName(conceptName);
  return KNOWLEDGE_OBJECT_DEFINITIONS.find((definition) => definition.canonicalName === canonical) ?? {
    canonicalName: canonical,
    aliases: [canonical],
    knowledgeType: KnowledgeType.OTHER,
    factSensitivity: FactSensitivity.STABLE,
    complexity: 0.5,
    micro: `${canonical} is the key idea in this part of the text.`,
    expanded: `${canonical} is important to the surrounding paragraph. Review the nearby sentence to see what role it plays.`,
    prerequisites: [],
    relatedConcepts: []
  };
}

export function generateMicroExplanation(conceptName, learningContext = {}, fragment = null) {
  const definition = getConceptDefinition(conceptName);
  const bridge = chooseBridge(definition, learningContext);
  if (bridge) {
    return `${bridge}: ${definition.micro}`;
  }
  return definition.micro;
}

export function generateExpandedExplanation(conceptName, learningContext = {}, fragment = null) {
  const definition = getConceptDefinition(conceptName);
  const parts = [definition.expanded];
  const role = inferRoleInParagraph(definition.canonicalName, fragment?.text ?? "");
  if (role) parts.push(role);
  if (definition.prerequisites.length) {
    parts.push(`Useful prerequisite: ${definition.prerequisites.join(", ")}.`);
  }
  const related = chooseRelatedConcepts(definition, learningContext);
  if (related.length) {
    parts.push(`Related to your recent context: ${related.join(", ")}.`);
  }
  return parts.join(" ");
}

function buildCandidate(definition, observedText, normalizedSelection, memoryContext, sourceText) {
  const normalizedObserved = normalizeForMatch(observedText);
  const phraseLevel = normalizedObserved.split(" ").length > 1;
  const selected =
    Boolean(normalizedSelection) &&
    (normalizedObserved.includes(normalizedSelection) ||
      normalizedSelection.includes(normalizedObserved) ||
      normalizeForMatch(definition.canonicalName).includes(normalizedSelection));
  const generic = isGenericTerm(observedText) || isGenericTerm(definition.canonicalName);
  const weakBoost = memoryContext?.derivedSignals?.possibly_weak ? 0.16 : 0;
  const semantic = scoreSemanticImportance(definition, sourceText, observedText);
  const score =
    definition.complexity +
    (phraseLevel ? 0.28 : 0) +
    (selected ? 0.35 : 0) +
    (generic ? -0.45 : 0) +
    weakBoost +
    semantic.score;

  return {
    canonicalName: definition.canonicalName,
    observedText,
    score: Number(score.toFixed(3)),
    selected,
    phraseLevel,
    generic,
    complexity: definition.complexity,
    relatedConcepts: definition.relatedConcepts,
    knowledgeType: definition.knowledgeType ?? KnowledgeType.OTHER,
    factSensitivity: definition.factSensitivity ?? FactSensitivity.STABLE,
    semanticKey: selected || semantic.semanticKey,
    semanticSignals: semantic.signals
  };
}

function buildAdHocCandidate(selectedText, sourceText, normalizedSelection) {
  const canonicalName = titleFromText(selectedText);
  const semantic = scoreSemanticImportance({
    canonicalName,
    knowledgeType: KnowledgeType.OTHER,
    contextCues: []
  }, sourceText, selectedText);
  return {
    canonicalName,
    observedText: selectedText,
    score: Number((0.5 + 0.35 + semantic.score).toFixed(3)),
    selected: Boolean(normalizedSelection),
    phraseLevel: normalizeForMatch(selectedText).split(" ").length > 1,
    generic: false,
    complexity: 0.5,
    relatedConcepts: [],
    knowledgeType: KnowledgeType.OTHER,
    factSensitivity: FactSensitivity.STABLE,
    semanticKey: true,
    semanticSignals: ["selected_unknown_object", ...semantic.signals]
  };
}

function buildAliasMap(definitions) {
  const map = new Map();
  for (const definition of definitions) {
    map.set(normalizeForMatch(definition.canonicalName), definition.canonicalName);
    for (const alias of definition.aliases) {
      map.set(normalizeForMatch(alias), definition.canonicalName);
    }
  }
  return map;
}

function findDefinitionByAlias(normalizedAlias) {
  const canonical = ALIAS_TO_CANONICAL.get(normalizedAlias);
  return KNOWLEDGE_OBJECT_DEFINITIONS.find((definition) => definition.canonicalName === canonical) ?? null;
}

function containsNormalizedPhrase(text, phrase) {
  if (!phrase) return false;
  if (/[\p{Script=Han}]/u.test(phrase)) {
    return text.includes(phrase);
  }
  const pattern = new RegExp(`(^|\\s)${escapeRegExp(phrase)}($|\\s)`, "i");
  return pattern.test(text);
}

function dedupeByCanonical(candidates) {
  const byName = new Map();
  for (const candidate of candidates) {
    const existing = byName.get(candidate.canonicalName);
    if (!existing || candidate.score > existing.score) {
      byName.set(candidate.canonicalName, candidate);
    }
  }
  return Array.from(byName.values());
}

function normalizeForMatch(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/k\/v/g, "kv")
    .replace(/[-_/]/g, " ")
    .replace(/[^\p{L}\p{N}+\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleFromText(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function chooseBridge(definition, learningContext) {
  const related = chooseRelatedConcepts(definition, learningContext);
  if (!related.length) return "";
  return `This connects to ${related[0]}`;
}

function chooseRelatedConcepts(definition, learningContext = {}) {
  const recent = new Set(learningContext.relatedConcepts ?? []);
  const eventConcepts = new Set((learningContext.recentTopics ?? []).map((topic) => topic.canonicalName));
  return definition.relatedConcepts.filter(
    (concept) => recent.has(concept) || eventConcepts.has(concept)
  );
}

function inferRoleInParagraph(conceptName, text) {
  if (!text) return "";
  const lower = text.toLowerCase();
  if (lower.includes("limit") || lower.includes("constrain")) {
    return `${conceptName} is being used here as a constraint or guardrail in the argument.`;
  }
  if (lower.includes("store") || lower.includes("reuse")) {
    return `${conceptName} is being used here to reduce repeated work.`;
  }
  if (lower.includes("choose") || lower.includes("select")) {
    return `${conceptName} is being used here to decide where information should flow.`;
  }
  return `${conceptName} is the local concept that the surrounding sentence depends on.`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rejectedSelectedConcept(reason, completedBy, text, normalizedText) {
  return {
    status: "rejected",
    reason,
    text,
    normalizedText,
    canonicalName: null,
    completedBy
  };
}

function isPartialLatinWordSelection({ text = "", sourceText = "", beforeText = "", afterText = "" } = {}) {
  if (!text || !/^[\p{Script=Latin}\p{N}]|[\p{Script=Latin}\p{N}]$/u.test(text)) {
    return false;
  }

  const left = String(beforeText).slice(-1);
  const right = String(afterText).slice(0, 1);
  if (isLatinWordChar(left) || isLatinWordChar(right)) return true;

  const source = String(sourceText ?? "");
  if (!source) return false;
  const lowerSource = source.toLowerCase();
  const lowerText = text.toLowerCase();
  let index = lowerSource.indexOf(lowerText);
  if (index < 0) return false;

  let sawWholeBoundary = false;
  while (index >= 0) {
    const prev = source[index - 1] ?? "";
    const next = source[index + text.length] ?? "";
    if (isLatinWordChar(prev) || isLatinWordChar(next)) {
      index = lowerSource.indexOf(lowerText, index + lowerText.length);
      continue;
    }
    sawWholeBoundary = true;
    break;
  }
  return !sawWholeBoundary;
}

function isLatinWordChar(value = "") {
  return /^[\p{Script=Latin}\p{N}]$/u.test(value);
}

function scoreSemanticImportance(definition, sourceText = "", observedText = "") {
  const normalizedSource = normalizeForMatch(sourceText);
  const normalizedObserved = normalizeForMatch(observedText);
  const cueMatches = (definition.contextCues ?? []).filter((cue) => (
    normalizedSource.includes(normalizeForMatch(cue))
  ));
  const structuralSignals = [];

  if (cueMatches.length) structuralSignals.push("context_cue");
  if (containsSemanticDependency(sourceText, observedText)) structuralSignals.push("semantic_dependency");
  if ((definition.knowledgeType ?? KnowledgeType.OTHER) === KnowledgeType.TECHNOLOGY) {
    structuralSignals.push("technical_object");
  }

  const semanticKey = structuralSignals.length > 0;
  const incidentalPenalty =
    !semanticKey &&
    definition.knowledgeType !== KnowledgeType.TECHNOLOGY &&
    normalizedObserved.split(" ").length <= 2
      ? -0.18
      : 0;

  return {
    score: (semanticKey ? 0.14 : 0) + incidentalPenalty,
    semanticKey,
    signals: Array.from(new Set([...structuralSignals, ...cueMatches.map((cue) => `cue:${cue}`)]))
  };
}

function containsSemanticDependency(sourceText, observedText) {
  const source = String(sourceText);
  const observed = String(observedText);
  const index = source.toLowerCase().indexOf(observed.toLowerCase());
  if (index < 0) return false;
  const incidentalStart = Math.max(0, index - 45);
  const incidentalEnd = Math.min(source.length, index + observed.length + 45);
  const incidentalWindow = source.slice(incidentalStart, incidentalEnd).toLowerCase();
  if (/\b(caption|sidebar|footer|byline|footnote|tag)\b/.test(incidentalWindow)) {
    return false;
  }
  const start = Math.max(0, index - 60);
  const end = Math.min(source.length, index + observed.length + 60);
  const window = source.slice(start, end).toLowerCase();
  return /\b(means|refers to|known as|because|explains|depends on|symbolizes|inspired|called|used as|used to)\b/.test(window) ||
    /(被称为|意味着|指的是|源自|象征|解释|依赖|作为)/.test(window);
}

function isPreciseSelection(selectedText) {
  return validateSelectedConcept({ text: selectedText }).status === "accepted";
}
