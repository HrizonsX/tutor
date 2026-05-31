import test from "node:test";
import assert from "node:assert/strict";
import { MemoryEventType } from "../src/contracts.js";
import { LearningMemory } from "../src/memory.js";

test("knowledge memory records first and repeated encounters with evidence", () => {
  const memory = new LearningMemory({ now: () => 1000 });
  const first = memory.recordKnowledgeEncounter({
    concept: "Thucydides Trap",
    observedAlias: "Thucydides Trap",
    knowledgeType: "historical_allusion",
    context: { fragmentId: "p1" },
    timestamp: 1000
  });
  memory.recordKnowledgeEncounter({
    concept: "修昔底德陷阱",
    observedAlias: "修昔底德陷阱",
    knowledgeType: "historical_allusion",
    context: { fragmentId: "p2" },
    timestamp: 2000
  });

  const context = memory.getLearningContext("Thucydides Trap", { timestamp: 2000 });
  assert.equal(context.events.length, 2);
  assert.ok(context.aliases.includes("Thucydides Trap"));
  assert.ok(context.aliases.includes("修昔底德陷阱"));
  assert.ok(context.retrievalPacket.agentSummary.evidenceEventIds.includes(first.id));
  assert.equal(context.retrievalPacket.uncertainty.confidence, "low");
});

test("retrieval packet includes explanations, feedback, related objects, and summaries", () => {
  const memory = new LearningMemory({ now: () => 1000 });
  const version = memory.recordExplanationVersion({
    id: "ver_bretton",
    target: "Bretton Woods system",
    text: "Bretton Woods shaped the postwar monetary order.",
    style: "concise",
    timestamp: 900
  });
  memory.recordExplanationShown({
    concept: "Bretton Woods",
    context: { fragmentId: "p1", explanationVersionId: version.id, knowledgeType: "economics" },
    relatedConcepts: ["gold standard"],
    timestamp: 900
  });
  const feedback = memory.recordFeedback({
    type: MemoryEventType.MARKED_CONFUSING,
    concept: "Bretton Woods system",
    knowledgeType: "economics",
    explanationVersionId: version.id,
    timestamp: 1000
  });

  const packet = memory.getRetrievalPacket("布雷顿森林体系", {
    timestamp: 1000,
    profileHints: { difficultObject: true }
  });

  assert.equal(packet.priorExplanations[0].id, version.id);
  assert.equal(packet.feedbackEvents[0].id, feedback.id);
  assert.equal(packet.relatedObjects[0].canonicalName, "gold standard");
  assert.equal(packet.profileHints.difficultObject, true);
  assert.ok(memory.data.agentSummaries[0].sourceEventIds.length > 0);
});
