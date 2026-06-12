import test from "node:test";
import assert from "node:assert/strict";
import { MemoryEventType } from "../src/shared/contracts.js";
import { buildRetrievalPacket, curateKnowledgeMemory } from "../src/gateway/knowledge-agent.js";

test("curated knowledge memory aggregates aliases, encounters, and evidence", () => {
  const events = [
    {
      id: "evt_1",
      type: MemoryEventType.KNOWLEDGE_ENCOUNTERED,
      canonicalName: "Thucydides Trap",
      observedAlias: "Thucydides Trap",
      knowledgeType: "historical_allusion",
      timestamp: 1000
    },
    {
      id: "evt_2",
      type: MemoryEventType.RECENTLY_SEEN,
      canonicalName: "Thucydides Trap",
      observedAlias: "修昔底德陷阱",
      knowledgeType: "historical_allusion",
      timestamp: 2000
    },
    {
      id: "evt_other",
      type: MemoryEventType.RECENTLY_SEEN,
      canonicalName: "KV cache",
      observedAlias: "KV cache",
      timestamp: 1500
    }
  ];

  const summary = curateKnowledgeMemory({ canonicalName: "Thucydides Trap", events, timestamp: 2000 });

  assert.deepEqual(summary.aliases, ["Thucydides Trap", "修昔底德陷阱"]);
  assert.equal(summary.firstSeenAt, 1000);
  assert.equal(summary.recentlySeenAt, 2000);
  assert.deepEqual(summary.evidenceEventIds, ["evt_1", "evt_2"]);
  assert.equal(summary.uncertainty.confidence, "low");
  assert.equal(summary.uncertainty.reason, "limited_events");
});

test("three or more events raise curated confidence to medium", () => {
  const events = [1000, 2000, 3000].map((timestamp, index) => ({
    id: `evt_${index}`,
    type: MemoryEventType.RECENTLY_SEEN,
    canonicalName: "KV cache",
    observedAlias: "KV cache",
    timestamp
  }));

  const summary = curateKnowledgeMemory({ canonicalName: "KV cache", events, timestamp: 3000 });

  assert.equal(summary.uncertainty.confidence, "medium");
  assert.equal(summary.uncertainty.reason, "multiple_events");
});

test("retrieval packet includes explanations, feedback, related objects, and summaries", () => {
  const events = [
    {
      id: "evt_shown",
      type: MemoryEventType.EXPLANATION_SHOWN,
      canonicalName: "Bretton Woods system",
      observedAlias: "Bretton Woods",
      knowledgeType: "economics",
      explanationVersionId: "ver_bretton",
      relatedConcepts: ["gold standard"],
      timestamp: 900
    },
    {
      id: "evt_confusing",
      type: MemoryEventType.MARKED_CONFUSING,
      canonicalName: "Bretton Woods system",
      knowledgeType: "economics",
      explanationVersionId: "ver_bretton",
      timestamp: 1000
    }
  ];
  const explanationVersions = [
    {
      id: "ver_bretton",
      target: "Bretton Woods system",
      text: "Bretton Woods shaped the postwar monetary order.",
      style: "concise",
      timestamp: 900
    }
  ];

  const packet = buildRetrievalPacket({
    canonicalName: "Bretton Woods system",
    events,
    explanationVersions,
    profileHints: { difficultObject: true },
    timestamp: 1000
  });

  assert.equal(packet.priorExplanations[0].id, "ver_bretton");
  assert.equal(packet.priorExplanations[0].sourceRole, "explanation_history");
  assert.equal(packet.priorExplanations[0].verifiedWorldKnowledge, false);
  assert.equal(packet.feedbackEvents[0].id, "evt_confusing");
  assert.equal(packet.relatedObjects[0].canonicalName, "gold standard");
  assert.equal(packet.profileHints.difficultObject, true);
  assert.equal(packet.target.knowledgeType, "economics");
  assert.equal(packet.agentSummary.localMemoryOnly, true);
  assert.equal(packet.agentSummary.sourceRole, "learning_state");
  assert.equal(packet.knowledgeSource, "external_agent_required");
  assert.ok(packet.agentSummary.priorExplanationIds.includes("ver_bretton"));
  assert.equal(packet.agentSummary.feedbackSummary[MemoryEventType.MARKED_CONFUSING].count, 1);
  assert.deepEqual(
    packet.agentSummary.feedbackSummary[MemoryEventType.MARKED_CONFUSING].evidenceEventIds,
    ["evt_confusing"]
  );
});

test("retrieval packet honors candidate metadata over inferred event metadata", () => {
  const packet = buildRetrievalPacket({
    canonicalName: "KL divergence",
    candidate: {
      observedText: "KL divergence",
      knowledgeType: "math",
      factSensitivity: "stable",
      semanticSignals: ["formula"]
    },
    events: [
      {
        id: "evt_seen",
        type: MemoryEventType.RECENTLY_SEEN,
        canonicalName: "KL divergence",
        observedAlias: "KL divergence",
        knowledgeType: "other",
        timestamp: 500
      }
    ],
    timestamp: 1000
  });

  assert.equal(packet.target.observedText, "KL divergence");
  assert.equal(packet.target.knowledgeType, "math");
  assert.deepEqual(packet.target.semanticSignals, ["formula"]);
  assert.equal(packet.localMemoryRole, "learning_state");
  assert.equal(packet.retrievalMode, "exact_alias_recency");
});
