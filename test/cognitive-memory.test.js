import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { DEFAULT_CONFIG, mergeConfig } from "../src/config.js";
import { ConceptRelationType, RelationBasis, rankMemoryBridges } from "../src/cognitive-memory.js";
import { createLocalMemoryStore, createPersistentLocalMemoryStore } from "../src/local-memory-store.js";
import { createRuntimeExplainPipeline } from "../src/runtime-explain-pipeline.js";
import { buildRelationProposalBody, validateStructuredRelationProposal } from "../src/provider-adapters.js";
import { AgentResultStatus, MemoryEventType, StructuredOutputMode } from "../src/contracts.js";

const may18 = Date.parse("2026-05-18T10:00:00.000Z");
const may19 = Date.parse("2026-05-19T10:00:00.000Z");

test("concept projections and daily summaries derive from raw events without certain mastery", () => {
  const store = createLocalMemoryStore({ now: () => may19, autoProcessBacklog: false });
  store.writeEvent({
    event: {
      id: "evt_seen",
      type: MemoryEventType.KNOWLEDGE_ENCOUNTERED,
      canonicalName: "PPO clipping",
      observedAlias: "clipped objective",
      timestamp: may18,
      context: { fragmentId: "p1", fullText: "must not persist" }
    }
  });
  store.writeEvent({
    event: {
      id: "evt_expand",
      type: MemoryEventType.EXPANDED,
      canonicalName: "PPO clipping",
      timestamp: may18 + 1000
    }
  });
  store.writeEvent({
    event: {
      id: "evt_confuse",
      type: MemoryEventType.REPEATED_CONFUSION,
      canonicalName: "PPO clipping",
      timestamp: may18 + 2000
    }
  });

  store.processBacklog();
  const projection = store.readConceptProjection("clipped objective");
  const summary = store.readDailySummary("2026-05-18");
  const health = store.getHealth();

  assert.equal(projection.canonicalName, "PPO clipping");
  assert.equal(projection.seenCount, 1);
  assert.equal(projection.expandedCount, 1);
  assert.equal(projection.repeatedConfusionCount, 1);
  assert.equal(projection.estimatedDifficulty, "medium");
  assert.equal(Object.hasOwn(projection.derivedSignals, "mastered"), false);
  assert.equal(summary.date, "2026-05-18");
  assert.equal(summary.summaryVersion, "daily-memory-summary.v1");
  assert.equal(summary.conceptRefs[0].canonicalName, "PPO clipping");
  assert.doesNotMatch(JSON.stringify(summary), /must not persist|fullText/);
  assert.equal(health.cognitiveMemory.conceptProjectionCount, 1);
  assert.equal(health.cognitiveMemory.dailySummaryCount, 1);
});

test("persistent cognitive memory tables survive restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bco-cognitive-memory-"));
  try {
    const first = createPersistentLocalMemoryStore({ directory, now: () => may19, autoProcessBacklog: false });
    first.writeEvent({ event: { id: "evt_fujian", type: MemoryEventType.KNOWLEDGE_ENCOUNTERED, canonicalName: "Fujian Province", timestamp: may18 } });
    first.processBacklog();
    first.writeDailySummary({
      id: "daily_custom",
      date: "2026-05-18",
      summaryVersion: "daily-memory-summary.v1",
      summaryHash: "hash_custom",
      topics: ["geography"],
      conceptRefs: [{ canonicalName: "Fujian Province", aliases: ["Fujian"], eventCounts: { seen: 1 } }],
      relationRefs: [],
      eventCount: 1,
      sourceEventIds: ["evt_fujian"],
      createdAt: may19,
      timestamp: may19
    });
    first.generateDailyReport({ date: "2026-05-18" });
    first.close();

    const second = createPersistentLocalMemoryStore({ directory, now: () => may19, autoProcessBacklog: false });
    const db = new DatabaseSync(join(directory, "local-memory.sqlite"));
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'virtual')").all().map((row) => row.name);
    db.close();

    assert.ok(tables.includes("daily_memory_summaries"));
    assert.ok(tables.includes("concept_projections"));
    assert.ok(tables.includes("relation_proposals"));
    assert.ok(tables.includes("reflection_reports"));
    assert.equal(second.readDailySummary("2026-05-18").summaryHash, "hash_custom");
    assert.equal(second.readConceptProjection("Fujian Province").canonicalName, "Fujian Province");
    assert.equal(second.data.cognitiveMemory.reflectionReports.length, 1);
    second.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("relation gate promotes explicit proposals, keeps weak inference candidate, and rejects invalid output", () => {
  const store = createLocalMemoryStore({ now: () => may19, autoProcessBacklog: false });
  store.writeDailySummary({
    date: "2026-05-18",
    summaryVersion: "daily-memory-summary.v1",
    summaryHash: "hash_day",
    topics: ["geography"],
    conceptRefs: [
      { canonicalName: "Fujian Province", aliases: ["Fujian"], eventCounts: { seen: 1 } },
      { canonicalName: "PPO clipping", aliases: [], eventCounts: { seen: 1 } }
    ],
    relationRefs: [],
    eventCount: 2,
    sourceEventIds: [],
    createdAt: may19,
    timestamp: may19
  });
  const blocks = store.loadDayConceptBlocks({ dates: ["2026-05-18"] });
  const active = store.gateRelationProposal({
    sourceCanonicalName: "Minnan",
    relationType: ConceptRelationType.LOCATED_IN,
    targetCanonicalName: "Fujian Province",
    sourceDate: "2026-05-18",
    confidence: "medium",
    basis: RelationBasis.CURRENT_CONTEXT_EXPLICIT,
    usableForOverlay: true
  }, { dayBlocks: blocks });
  const activeDefaultOverlay = store.gateRelationProposal({
    sourceCanonicalName: "Huangyao Ancient Town",
    relationType: ConceptRelationType.LOCATED_IN,
    targetCanonicalName: "Fujian Province",
    sourceDate: "2026-05-18",
    confidence: "medium",
    basis: RelationBasis.CURRENT_CONTEXT_EXPLICIT
  }, { dayBlocks: blocks });
  const candidate = store.gateRelationProposal({
    sourceCanonicalName: "Minnan",
    relationType: ConceptRelationType.RELATED_TO,
    targetCanonicalName: "PPO clipping",
    sourceDate: "2026-05-18",
    confidence: "low",
    basis: RelationBasis.DAILY_SUMMARY_INFERENCE,
    usableForOverlay: true
  }, { dayBlocks: blocks });
  const rejected = store.gateRelationProposal({
    sourceCanonicalName: "Minnan",
    relationType: ConceptRelationType.LOCATED_IN,
    targetCanonicalName: "Minnan",
    sourceDate: "2026-05-18",
    confidence: "medium",
    basis: RelationBasis.CURRENT_CONTEXT_EXPLICIT
  }, { dayBlocks: blocks });

  assert.equal(active.status, "active");
  assert.equal(active.usableForOverlay, true);
  assert.equal(activeDefaultOverlay.status, "active");
  assert.equal(activeDefaultOverlay.usableForOverlay, true);
  assert.equal(active.evidenceTextHash, null);
  assert.equal(candidate.status, "candidate");
  assert.equal(candidate.usableForOverlay, false);
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.gateReason, "self_loop");
});

test("Overlay recall uses active one-hop bridges and excludes unrelated candidates", () => {
  const store = createLocalMemoryStore({ now: () => may19, autoProcessBacklog: false });
  store.writeDailySummary({
    date: "2026-05-18",
    summaryVersion: "daily-memory-summary.v1",
    summaryHash: "hash_day",
    topics: ["geography"],
    conceptRefs: [{ canonicalName: "Fujian Province", aliases: [], eventCounts: { seen: 1 } }],
    relationRefs: [],
    eventCount: 1,
    sourceEventIds: [],
    createdAt: may19,
    timestamp: may19
  });
  const blocks = store.loadDayConceptBlocks({ dates: ["2026-05-18"] });
  store.gateRelationProposal({
    sourceCanonicalName: "Minnan",
    relationType: ConceptRelationType.LOCATED_IN,
    targetCanonicalName: "Fujian Province",
    sourceDate: "2026-05-18",
    confidence: "high",
    basis: RelationBasis.CURRENT_CONTEXT_EXPLICIT,
    usableForOverlay: true
  }, { dayBlocks: blocks });

  const recall = store.planOverlayRecall({ canonicalName: "Minnan", goal: "micro", timestamp: may19 });

  assert.equal(recall.policy.relationDepth, 1);
  assert.equal(recall.policy.maxBridgeCount, 1);
  assert.equal(recall.memoryBridges.length, 1);
  assert.equal(recall.memoryBridges[0].relatedConcept, "Fujian Province");
  assert.equal(recall.memoryBridges[0].caution, "not_fact_source");
});

test("Overlay recall treats active relations from prior proposer output as usable", () => {
  const legacyRelation = {
    id: "rel_legacy",
    sourceCanonicalName: "Huangyao Ancient Town",
    relationType: ConceptRelationType.LOCATED_IN,
    targetCanonicalName: "Guangxi",
    status: "active",
    confidence: "medium",
    basis: RelationBasis.CURRENT_CONTEXT_EXPLICIT,
    usableForOverlay: false,
    sourceDates: ["2026-05-29"]
  };
  const explicitlyDisabled = {
    ...legacyRelation,
    id: "rel_disabled",
    targetCanonicalName: "Guangxi disabled",
    overlayDisabledExplicitly: true
  };

  const bridges = rankMemoryBridges({
    targetConcept: "Huangyao Ancient Town",
    relations: [legacyRelation, explicitlyDisabled],
    conceptProjections: {},
    timestamp: may19,
    goal: "expand"
  });

  assert.deepEqual(bridges.map((bridge) => bridge.relatedConcept), ["Guangxi", "Guangxi disabled"]);
});

test("runtime injects bounded bridges and records only used memory bridges", async () => {
  const store = createLocalMemoryStore({ now: () => may19, autoProcessBacklog: false });
  store.writeDailySummary({
    date: "2026-05-18",
    summaryVersion: "daily-memory-summary.v1",
    summaryHash: "hash_day",
    topics: ["geography"],
    conceptRefs: [{ canonicalName: "Fujian Province", aliases: [], eventCounts: { seen: 1 } }],
    relationRefs: [],
    eventCount: 1,
    sourceEventIds: [],
    createdAt: may19,
    timestamp: may19
  });
  store.gateRelationProposal({
    sourceCanonicalName: "Minnan",
    relationType: ConceptRelationType.LOCATED_IN,
    targetCanonicalName: "Fujian Province",
    sourceDate: "2026-05-18",
    confidence: "high",
    basis: RelationBasis.CURRENT_CONTEXT_EXPLICIT,
    usableForOverlay: true
  }, { dayBlocks: store.loadDayConceptBlocks({ dates: ["2026-05-18"] }) });
  const pipeline = createRuntimeExplainPipeline({ store, now: () => may19 });
  let providerInput;

  const result = await pipeline.handle({
    request: {
      target: { canonicalName: "Minnan", observedText: "Minnan" },
      memoryBridges: [{ relatedConcept: "browser-forged" }]
    },
    providerCall: async (input) => {
      providerInput = input;
      return {
        status: AgentResultStatus.AVAILABLE,
        target: input.target,
        text: "Minnan is a cultural region in southern Fujian.",
        microExplanation: "Minnan is a cultural region in southern Fujian.",
        versionMetadata: { id: "ver_minnan" }
      };
    }
  });
  const usedEvents = store.readTargetEvidence("Minnan").events.filter((event) => event.type === MemoryEventType.MEMORY_BRIDGE_USED);

  assert.equal(result.status, AgentResultStatus.AVAILABLE);
  assert.equal(providerInput.memoryBridges.length, 1);
  assert.equal(providerInput.memoryBridges[0].relatedConcept, "Fujian Province");
  assert.equal(providerInput.memoryBridges[0].sourceRole, "local_learning_context");
  assert.equal(usedEvents.length, 1);
  assert.equal(usedEvents[0].bridgeConcept, "Fujian Province");
});

test("relation proposal schema preserves day ownership and rejects invalid output", () => {
  const body = buildRelationProposalBody({
    targetConcept: { canonicalName: "Minnan" },
    dailyMemoryBlocks: [{
      date: "2026-05-18",
      concepts: [{ canonicalName: "Fujian Province", sourceRole: "learned_concept" }]
    }]
  }, {
    modelName: "relation-model",
    structuredOutput: { mode: StructuredOutputMode.JSON_SCHEMA }
  }, DEFAULT_CONFIG);
  const valid = validateStructuredRelationProposal({
    relationCandidates: [{
      sourceCanonicalName: "Minnan",
      relationType: ConceptRelationType.LOCATED_IN,
      targetCanonicalName: "Fujian Province",
      sourceDate: "2026-05-18",
      confidence: "medium",
      basis: RelationBasis.CURRENT_CONTEXT_EXPLICIT,
      usableForOverlay: true
    }],
    rejectedCandidates: []
  });
  const defaultUsable = validateStructuredRelationProposal({
    relationCandidates: [{
      sourceCanonicalName: "Minnan",
      relationType: ConceptRelationType.LOCATED_IN,
      targetCanonicalName: "Fujian Province",
      sourceDate: "2026-05-18",
      confidence: "medium",
      basis: RelationBasis.CURRENT_CONTEXT_EXPLICIT
    }],
    rejectedCandidates: []
  });
  const providerFalseStillUsable = validateStructuredRelationProposal({
    relationCandidates: [{
      sourceCanonicalName: "Minnan",
      relationType: ConceptRelationType.LOCATED_IN,
      targetCanonicalName: "Fujian Province",
      sourceDate: "2026-05-18",
      confidence: "medium",
      basis: RelationBasis.CURRENT_CONTEXT_EXPLICIT,
      usableForOverlay: false
    }],
    rejectedCandidates: []
  });
  const invalid = validateStructuredRelationProposal({
    relationCandidates: [{ sourceCanonicalName: "Minnan", targetCanonicalName: "Fujian Province" }],
    rejectedCandidates: []
  });

  assert.equal(body.response_format.json_schema.name, "bco_relation_proposal_result");
  assert.match(body.messages[1].content, /2026-05-18/);
  assert.match(body.messages[1].content, /allowedRelationTypes/);
  assert.equal(valid.ok, true);
  assert.equal(valid.value.relationCandidates[0].usableForOverlay, true);
  assert.equal(defaultUsable.ok, true);
  assert.equal(defaultUsable.value.relationCandidates[0].usableForOverlay, true);
  assert.equal(providerFalseStillUsable.ok, true);
  assert.equal(providerFalseStillUsable.value.relationCandidates[0].usableForOverlay, true);
  assert.equal(invalid.ok, false);
});

test("async relation proposer discovery can create active bridges for later recall", async () => {
  const store = createLocalMemoryStore({ now: () => may19, autoProcessBacklog: false });
  store.writeDailySummary({
    date: "2026-05-18",
    summaryVersion: "daily-memory-summary.v1",
    summaryHash: "hash_day",
    topics: ["geography"],
    conceptRefs: [{ canonicalName: "Fujian Province", aliases: [], eventCounts: { seen: 1 } }],
    relationRefs: [],
    eventCount: 1,
    sourceEventIds: ["evt_fujian"],
    createdAt: may19,
    timestamp: may19
  });

  const discovery = await store.runRelationDiscovery({
    canonicalName: "Minnan",
    daySelector: () => ["2026-05-18"],
    relationProposer: async ({ targetConcept, dailyMemoryBlocks }) => {
      assert.equal(targetConcept.canonicalName, "Minnan");
      assert.equal(dailyMemoryBlocks[0].date, "2026-05-18");
      return {
        status: AgentResultStatus.AVAILABLE,
        relationCandidates: [{
          sourceCanonicalName: "Minnan",
          relationType: ConceptRelationType.LOCATED_IN,
          targetCanonicalName: "Fujian Province",
          sourceDate: "2026-05-18",
          confidence: "high",
          basis: RelationBasis.PROVIDER_STRUCTURED_RELATION,
          usableForOverlay: true,
          sourceEventIds: ["evt_fujian"]
        }],
        rejectedCandidates: []
      };
    }
  });
  const packet = store.queryMemory({ canonicalName: "Minnan", timestamp: may19 });

  assert.equal(discovery.status, AgentResultStatus.AVAILABLE);
  assert.equal(discovery.relationCandidates[0].status, "active");
  assert.equal(packet.memoryBridges.length, 1);
  assert.equal(packet.relatedMemories[0].relatedConcept, "Fujian Province");
});

test("reflection reports can include stale concepts without forcing Overlay recall", () => {
  const config = mergeConfig(DEFAULT_CONFIG, {
    memory: { cognitive: { forgettingRiskDays: 1 } }
  });
  const store = createLocalMemoryStore({ now: () => may19 + 3 * 24 * 60 * 60 * 1000, config, autoProcessBacklog: false });
  store.writeEvent({
    event: {
      id: "evt_old_confusion",
      type: MemoryEventType.REPEATED_CONFUSION,
      canonicalName: "PPO clipping",
      timestamp: may18
    }
  });
  store.processBacklog();
  const report = store.generateWeeklyReport({ startDate: "2026-05-18", endDate: "2026-05-22" });
  const recall = store.planOverlayRecall({ canonicalName: "Minnan", goal: "micro", timestamp: may19 });

  assert.ok(report.reviewSuggestions.includes("PPO clipping"));
  assert.equal(recall.memoryBridges.length, 0);
  assert.equal(report.caution, "local_learning_history_not_fact_source");
});
