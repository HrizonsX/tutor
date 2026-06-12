// @ts-nocheck
export const FragmentType = Object.freeze({
  PARAGRAPH: "paragraph",
  HEADING: "heading",
  LIST_ITEM: "list_item",
  CODE: "code",
  TABLE_CELL: "table_cell",
  QUOTE: "quote",
  OTHER: "other"
});

export const MemoryEventType = Object.freeze({
  EXPLANATION_SHOWN: "explanation_shown",
  DISMISSED: "dismissed",
  EXPANDED: "expanded",
  CONCEPT_REVISITED: "concept_revisited",
  USER_SELECTED_TERM: "user_selected_term",
  REPEATED_CONFUSION: "repeated_confusion",
  RECENTLY_SEEN: "recently_seen",
  USER_IGNORED_OVERLAY: "user_ignored_overlay",
  MEMORY_BRIDGE_USED: "memory_bridge_used",
  RELATION_PROPOSED: "relation_proposed",
  PARAGRAPH_PROMPTED: "paragraph_prompted",
  KNOWLEDGE_ENCOUNTERED: "knowledge_encountered",
  MARKED_KNOWN: "marked_known",
  MARKED_CONFUSING: "marked_confusing",
  MARKED_WRONG: "marked_wrong",
  REQUESTED_REGENERATION: "requested_regeneration",
  REQUESTED_SIMPLER: "requested_simpler",
  REQUESTED_MORE_CONTEXT: "requested_more_context",
  MUTED_OBJECT: "muted_object",
  MUTED_CATEGORY: "muted_category",
  CLEARED_OBJECT_PREFERENCE: "cleared_object_preference",
  CLEARED_CATEGORY_PREFERENCE: "cleared_category_preference"
});

export const DerivedSignal = Object.freeze({
  POSSIBLY_WEAK: "possibly_weak",
  POSSIBLY_FAMILIAR: "possibly_familiar",
  NEEDS_REVIEW: "needs_review",
  RECENTLY_EXPLAINED: "recently_explained",
  LOW_INTERVENTION_PREFERRED: "low_intervention_preferred",
  RECENTLY_MARKED_KNOWN: "recently_marked_known",
  POSSIBLY_CONFUSING: "possibly_confusing",
  CAUTION_REQUIRED: "caution_required",
  OBJECT_MUTED: "object_muted"
});

export const SuppressionReason = Object.freeze({
  INACTIVE: "inactive",
  LARGE_SELECTION: "large_selection",
  CODE_SELECTION: "code_selection",
  RECENT_DISMISSAL: "recent_dismissal",
  PARAGRAPH_COOLDOWN: "paragraph_cooldown",
  RECENTLY_EXPLAINED: "recently_explained",
  LOW_INTERVENTION: "low_intervention_preferred",
  DWELL_ONLY: "dwell_only",
  NO_CONTENT_SIGNAL: "no_content_signal",
  NO_BEHAVIOR_OR_MEMORY_SIGNAL: "no_behavior_or_memory_signal",
  MUTED_OBJECT: "muted_object",
  MUTED_CATEGORY: "muted_category",
  RECENTLY_MARKED_KNOWN: "recently_marked_known",
  FACT_SENSITIVE_UNVERIFIED: "fact_sensitive_unverified"
});

export const KnowledgeType = Object.freeze({
  TECHNOLOGY: "technology",
  HISTORICAL_EVENT: "historical_event",
  HISTORICAL_ALLUSION: "historical_allusion",
  PERSON: "person",
  ORGANIZATION: "organization",
  PLACE: "place",
  WORK: "work",
  THEORY: "theory",
  CULTURAL_REFERENCE: "cultural_reference",
  ASTRONOMY: "astronomy",
  GEOGRAPHY: "geography",
  ECONOMICS: "economics",
  OTHER: "other"
});

export const FactSensitivity = Object.freeze({
  STABLE: "stable",
  FACT_SENSITIVE: "fact_sensitive",
  NEEDS_SOURCE: "needs_source"
});

export const ExplanationStyle = Object.freeze({
  CONCISE: "concise",
  CONTEXTUAL_ROLE: "contextual_role",
  SIMPLER: "simpler",
  BACKGROUND: "background",
  ANALOGY: "analogy"
});

export const FeedbackEventType = Object.freeze({
  KNOWN: MemoryEventType.MARKED_KNOWN,
  CONFUSING: MemoryEventType.MARKED_CONFUSING,
  WRONG: MemoryEventType.MARKED_WRONG,
  REGENERATE: MemoryEventType.REQUESTED_REGENERATION,
  SIMPLER: MemoryEventType.REQUESTED_SIMPLER,
  MORE_CONTEXT: MemoryEventType.REQUESTED_MORE_CONTEXT,
  MUTE_OBJECT: MemoryEventType.MUTED_OBJECT,
  MUTE_CATEGORY: MemoryEventType.MUTED_CATEGORY
});

export const AgentResultStatus = Object.freeze({
  AVAILABLE: "available",
  UNAVAILABLE: "unavailable",
  AMBIGUOUS: "ambiguous",
  INVALID: "invalid",
  ERROR: "error"
});

export const AgentRequestGoal = Object.freeze({
  MICRO: "micro",
  EXPAND: "expand",
  REGENERATE: "regenerate",
  ASSOCIATION: "association"
});

export const ProviderKind = Object.freeze({
  OFF: "off",
  LOCAL: "local",
  CUSTOM: "custom",
  CLOUD: "cloud",
  NONE: "off",
  CUSTOM_HTTP: "custom",
  TEST: "custom"
});

export const ProviderAdapter = Object.freeze({
  NONE: "",
  INTERNAL_AGENT: "internal-agent",
  OPENAI_COMPATIBLE: "openai-compatible"
});

export const StructuredOutputMode = Object.freeze({
  JSON_SCHEMA: "json_schema",
  JSON_OBJECT: "json_object",
  PROMPT_JSON: "prompt_json"
});

export const ProviderErrorReason = Object.freeze({
  JSON_PARSE_FAILED: "provider_json_parse_failed",
  SCHEMA_INVALID: "provider_schema_invalid",
  STREAM_INVALID: "provider_stream_invalid",
  AUTH_FAILED: "provider_auth_failed",
  RATE_LIMITED: "provider_rate_limited",
  MODEL_UNSUPPORTED: "provider_model_unsupported",
  UNAVAILABLE: "provider_unavailable"
});

export const ProviderRole = Object.freeze({
  EXPLAIN: "explain",
  EMBEDDING: "embedding",
  RELATION_PROPOSER: "relationProposer"
});

export const AgentCapability = Object.freeze({
  HEALTH: "health",
  EXPLAIN: "explain",
  REWRITE: "rewrite",
  EMBEDDING: "embedding",
  RELATION_PROPOSAL: "relation_proposal",
  MEMORY_EVENT_WRITE: "memory_event_write",
  MEMORY_QUERY: "memory_query",
  SOURCE_AWARE_EXPLANATION: "source_aware_explanation",
  STREAMING_EXPLANATION: "streaming_explanation"
});

export const AgentProtocolVersion = "bco.agent.v1";
export const AgentStreamProtocolVersion = "bco.agent.stream.v1";

export const StreamLane = Object.freeze({
  DIRECT: "direct",
  ASSOCIATION: "association"
});

export const StreamEventType = Object.freeze({
  SESSION_START: "session_start",
  LANE_START: "lane_start",
  RECALL_STATUS: "recall_status",
  LANE_DELTA: "lane_delta",
  LANE_FINAL: "lane_final",
  LANE_ERROR: "lane_error",
  SESSION_DONE: "session_done",
  SESSION_CANCELLED: "session_cancelled"
});

export const MemoryRepositoryMode = Object.freeze({
  BROWSER: "browser",
  LOCAL_GATEWAY: "local_gateway",
  OFF: "off"
});

export const BackgroundMessageType = Object.freeze({
  EXPLAIN_KNOWLEDGE: "bco.agent.explainKnowledge",
  EXPLAIN_KNOWLEDGE_STREAM: "bco.agent.explainKnowledge.stream",
  CREATE_EMBEDDING: "bco.embedding.create",
  GET_PROVIDER_HEALTH: "bco.provider.health",
  GET_DIAGNOSTICS: "bco.runtime.diagnostics",
  GET_RUNTIME_CONFIG: "bco.runtime.config.get",
  UPDATE_RUNTIME_CONFIG: "bco.runtime.config.update",
  UPDATE_BROWSER_CONFIG: "bco.browser.config.update",
  WRITE_MEMORY_EVENT: "bco.memory.event.write",
  QUERY_MEMORY: "bco.memory.query"
});

/**
 * @typedef {Object} ReadingFragment
 * @property {string} id
 * @property {string} text
 * @property {string} type
 * @property {number} score
 * @property {{top:number,left:number,width:number,height:number}} rect
 */

/**
 * @typedef {Object} ConceptCandidate
 * @property {string} canonicalName
 * @property {string} observedText
 * @property {number} score
 * @property {boolean} selected
 * @property {boolean} phraseLevel
 * @property {boolean} generic
 * @property {string} knowledgeType
 * @property {string} factSensitivity
 * @property {boolean} semanticKey
 * @property {string[]} semanticSignals
 */

/**
 * @typedef {Object} KnowledgeObject
 * @property {string} canonicalName
 * @property {string[]} aliases
 * @property {string} knowledgeType
 * @property {string} factSensitivity
 * @property {string[]} relatedObjects
 */

/**
 * @typedef {Object} RetrievalPacket
 * @property {KnowledgeObject} target
 * @property {Array<Object>} priorExplanations
 * @property {Array<Object>} feedbackEvents
 * @property {Array<Object>} relatedObjects
 * @property {Object} profileHints
 * @property {Object} cooldowns
 * @property {Object} uncertainty
 */

/**
 * @typedef {Object} ExplanationVersion
 * @property {string} id
 * @property {string} target
 * @property {string} style
 * @property {string} text
 * @property {number} timestamp
 * @property {string|null} previousVersionId
 */

/**
 * @typedef {Object} AgentExplanationResult
 * @property {string} status
 * @property {string} capabilityKind
 * @property {Object} target
 * @property {string} text
 * @property {Object|null} ambiguity
 * @property {Object|null} rewrite
 * @property {Object} versionMetadata
 * @property {Object} factSensitivity
 */
