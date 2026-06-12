import { AgentRequestGoal, StreamLane } from "../../src/shared/contracts.js";

export const streamingTarget = Object.freeze({
  canonicalName: "Loquat",
  observedText: "loquat",
  knowledgeType: "other",
  factSensitivity: "stable"
});

export const streamingContext = Object.freeze({
  fragmentId: "p-loquat",
  fragmentType: "paragraph",
  text: "Changtai is known for loquats.",
  url: "https://example.test/article",
  title: "Local agriculture"
});

export const directStreamRequest = Object.freeze({
  requestId: "stream_req_direct",
  goal: AgentRequestGoal.MICRO,
  requestGoal: AgentRequestGoal.MICRO,
  target: streamingTarget,
  selectedText: "loquat",
  minimalContext: streamingContext,
  streamLane: StreamLane.DIRECT
});

export const forgedMemoryStreamRequest = Object.freeze({
  ...directStreamRequest,
  requestId: "stream_req_forged",
  memoryPacket: { forged: true },
  memorySummary: { forged: true },
  profileHints: { forged: true },
  memoryBridges: [{ relatedConcept: "Forged Browser Memory" }],
  relationCandidates: [{ forged: true }]
});

export const oneBridgeMemoryPacket = Object.freeze({
  status: "available",
  repositoryStatus: "local_gateway",
  localMemoryRole: "learning_state",
  memoryFreshness: { status: "fresh" },
  agentSummary: {},
  profileHints: {},
  memoryBridges: [{
    relatedConcept: "Changtai",
    relationType: "known_for",
    direction: "incoming",
    confidence: "high",
    sourceRole: "local_learning_context",
    caution: "not_fact_source"
  }],
  recallPolicy: {
    relationDepth: 1,
    maxBridgeCount: 3,
    memorySourceRole: "local_learning_context",
    caution: "not_fact_source"
  }
});

export const multiBridgeMemoryPacket = Object.freeze({
  ...oneBridgeMemoryPacket,
  memoryBridges: [
    { relatedConcept: "Changtai", relationType: "known_for", direction: "incoming", confidence: "high", sourceRole: "local_learning_context", caution: "not_fact_source" },
    { relatedConcept: "Putian", relationType: "located_in", direction: "incoming", confidence: "medium", sourceRole: "local_learning_context", caution: "not_fact_source" },
    { relatedConcept: "Fujian", relationType: "located_in", direction: "incoming", confidence: "medium", sourceRole: "local_learning_context", caution: "not_fact_source" },
    { relatedConcept: "Fruit farming", relationType: "related_to", direction: "outgoing", confidence: "low", sourceRole: "local_learning_context", caution: "not_fact_source" }
  ]
});

export const noBridgeMemoryPacket = Object.freeze({
  ...oneBridgeMemoryPacket,
  memoryBridges: [],
  preRecall: {
    status: "available",
    reason: null,
    candidateBlockCount: 0,
    relationCandidateCount: 0,
    activeCandidateCount: 0,
    overlayEligibleCandidateCount: 0,
    rejectedCandidateCount: 0,
    gateRejectReasons: [],
    bridgeCount: 0
  },
  recallPolicy: {
    relationDepth: 1,
    maxBridgeCount: 1,
    memorySourceRole: "local_learning_context",
    caution: "not_fact_source"
  }
});

export const weakCandidateMemoryPacket = Object.freeze({
  ...noBridgeMemoryPacket,
  preRecall: {
    status: "available",
    reason: null,
    candidateBlockCount: 2,
    relationCandidateCount: 4,
    activeCandidateCount: 0,
    overlayEligibleCandidateCount: 0,
    rejectedCandidateCount: 4,
    gateRejectReasons: ["candidate_needs_stronger_evidence"],
    gateRejectReasonText: "candidate_needs_stronger_evidence",
    bridgeCount: 0
  }
});

export const canceledSessionFixture = Object.freeze({
  request: directStreamRequest,
  cancelReason: "content_cancelled"
});
