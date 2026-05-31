import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import {
  createLocalMemoryStore,
  createPersistentLocalMemoryStore,
  LOCAL_MEMORY_SUMMARIZER_VERSION
} from "../src/local-memory-store.js";
import { AgentResultStatus, DerivedSignal, MemoryEventType } from "../src/contracts.js";
import { ConceptRelationType, RelationBasis } from "../src/cognitive-memory.js";

test("persistent Local Memory Store survives restart and keeps minimal raw evidence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bco-memory-"));
  try {
    const first = createPersistentLocalMemoryStore({ directory, now: () => 1000 });
    const event = first.writeEvent({
      event: {
        id: "evt_persisted",
        type: MemoryEventType.KNOWLEDGE_ENCOUNTERED,
        canonicalName: "Lagrange point",
        observedAlias: "Lagrange point",
        timestamp: 900,
        context: {
          fragmentId: "p1",
          url: "https://example.com/path?token=secret",
          fullText: "This full text should not persist"
        }
      }
    });
    const firstQuery = first.queryMemory({ canonicalName: "Lagrange point", timestamp: 1000 });
    first.close();

    const second = createPersistentLocalMemoryStore({ directory, now: () => 1200 });
    const secondQuery = second.queryMemory({ canonicalName: "Lagrange point", timestamp: 1200 });
    second.close();
    const db = new DatabaseSync(join(directory, "local-memory.sqlite"));
    const rawRows = db.prepare("SELECT record_json FROM raw_memory_events").all();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'virtual')").all().map((row) => row.name);
    db.close();

    assert.equal(event.id, "evt_persisted");
    assert.equal(firstQuery.memoryFreshness.status, "fresh");
    assert.equal(secondQuery.target.canonicalName, "Lagrange point");
    assert.ok(secondQuery.summaryEvidenceEventIds.includes("evt_persisted"));
    assert.equal(secondQuery.repositoryStatus, "local_gateway");
    assert.ok(tables.includes("raw_memory_events"));
    assert.ok(tables.includes("explanation_versions"));
    assert.ok(tables.includes("memory_candidates"));
    assert.ok(tables.includes("concept_states"));
    assert.ok(tables.includes("profile_summary"));
    assert.ok(tables.includes("retrieval_summaries"));
    assert.ok(tables.includes("summarizer_jobs"));
    assert.doesNotMatch(JSON.stringify(rawRows), /fullText|This full text should not persist|token=secret/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Memory Summarizer derives evidence-backed target state and explanation preferences", () => {
  const store = createLocalMemoryStore({ now: () => 2000, autoProcessBacklog: false });
  store.writeEvent({ event: { id: "evt_confuse_1", type: MemoryEventType.REPEATED_CONFUSION, canonicalName: "PPO clipping", timestamp: 1000 } });
  store.writeEvent({ event: { id: "evt_confuse_2", type: MemoryEventType.REPEATED_CONFUSION, canonicalName: "PPO clipping", timestamp: 1100 } });
  store.writeEvent({ event: { id: "evt_simple_1", type: MemoryEventType.REQUESTED_SIMPLER, canonicalName: "PPO clipping", timestamp: 1200 } });
  store.writeEvent({ event: { id: "evt_simple_2", type: MemoryEventType.REQUESTED_SIMPLER, canonicalName: "PPO clipping", timestamp: 1300 } });

  assert.deepEqual(store.listStaleTargets(), ["PPO clipping"]);
  const processed = store.processBacklog();
  const packet = store.queryMemory({ canonicalName: "PPO clipping", timestamp: 2000 });
  const summary = store.readDerivedSummary("PPO clipping");

  assert.equal(processed.status, AgentResultStatus.AVAILABLE);
  assert.equal(processed.processedTargets, 1);
  assert.equal(summary.summarizerVersion, LOCAL_MEMORY_SUMMARIZER_VERSION);
  assert.equal(summary.targetState.derivedSignals[DerivedSignal.POSSIBLY_WEAK], true);
  assert.equal(summary.profileHints.preferredStyle, "simpler");
  assert.equal(summary.explanationPreferences.preferredStyle, "simpler");
  assert.ok(summary.sourceEventIds.includes("evt_confuse_1"));
  assert.equal(summary.uncertainty.confidence, "medium");
  assert.equal(packet.memoryFreshness.status, "fresh");
  assert.equal(packet.derivedSignals[DerivedSignal.POSSIBLY_WEAK], true);
  assert.equal(packet.profileHints.preferredStyle, "simpler");
  assert.equal(store.listStaleTargets().length, 0);
});

test("auto profile refresh schedules periodic summary rebuild", async () => {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  let current = 10_000;
  let scheduled = null;
  let cleared = null;
  globalThis.setInterval = (fn, intervalMs) => {
    scheduled = { fn, intervalMs, unrefCalled: false };
    return {
      unref() {
        scheduled.unrefCalled = true;
      }
    };
  };
  globalThis.clearInterval = (handle) => {
    cleared = handle;
  };
  try {
    const store = createLocalMemoryStore({
      now: () => current,
      autoProcessBacklog: true,
      config: {
        memory: {
          cognitive: {
            profileRefreshIntervalMs: 60_000,
            profileRefreshMinNewEvents: 1
          }
        }
      }
    });
    assert.equal(scheduled.intervalMs, 60_000);
    store.writeEvent({
      event: {
        id: "evt_profile_topic",
        type: MemoryEventType.EXPLANATION_SHOWN,
        canonicalName: "福建",
        knowledgeType: "地理",
        timestamp: current
      }
    });
    current += 60_000;
    scheduled.fn();

    const summary = store.readProfileSummary();
    assert.equal(summary.timestamp, current);
    assert.deepEqual(summary.interests.recentConcepts, ["福建"]);
    assert.equal(summary.interests.knowledgeTypes[0].name, "地理");
    store.close();
    assert.ok(cleared);
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

test("persistent pre-recall uses FTS Top-K candidates for first explanation bridge", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "bco-memory-fts-recall-"));
  let store = null;
  try {
    const current = Date.parse("2026-05-27T10:00:00.000Z");
    store = createPersistentLocalMemoryStore({ directory, now: () => current, autoProcessBacklog: false });
    if (!store.getHealth().sqlite.ftsAvailable) {
      t.skip("SQLite FTS5 is unavailable in this runtime.");
      store.close();
      return;
    }
    store.writeEvent({
      event: {
        id: "evt_changtai_loquat",
        type: MemoryEventType.KNOWLEDGE_ENCOUNTERED,
        canonicalName: "常太枇杷",
        observedAlias: "常太枇杷",
        timestamp: current - 60_000
      }
    });
    for (let index = 0; index < 30; index += 1) {
      store.writeEvent({
        event: {
          id: `evt_distractor_${index}`,
          type: MemoryEventType.KNOWLEDGE_ENCOUNTERED,
          canonicalName: `Unrelated ${index}`,
          timestamp: current - index
        }
      });
    }
    store.processBacklog();

    const discovery = await store.discoverPreRecallMemoryBridges({
      canonicalName: "常太",
      currentContext: { text: "常太" },
      relationProposer: async ({ targetConcept, dailyMemoryBlocks }) => {
        assert.equal(targetConcept.canonicalName, "常太");
        assert.equal(dailyMemoryBlocks.some((block) =>
          block.concepts.some((concept) => concept.canonicalName === "常太枇杷" && concept.recallReason === "fts_top_k")
        ), true);
        return {
          status: AgentResultStatus.AVAILABLE,
          relationCandidates: [{
            sourceCanonicalName: "常太",
            relationType: ConceptRelationType.RELATED_TO,
            targetCanonicalName: "常太枇杷",
            sourceDate: "2026-05-27",
            confidence: "high",
            basis: RelationBasis.PROVIDER_STRUCTURED_RELATION,
            usableForOverlay: true,
            sourceEventIds: ["evt_changtai_loquat"]
          }],
          rejectedCandidates: []
        };
      },
      timestamp: current,
      maxBridgeCount: 3
    });

    assert.equal(discovery.status, AgentResultStatus.AVAILABLE);
    assert.deepEqual(discovery.memoryBridges.map((bridge) => bridge.relatedConcept), ["常太枇杷"]);
  } finally {
    store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("related concept hints only supplement pre-recall candidates", async () => {
  const current = Date.parse("2026-05-31T09:00:00.000Z");
  const store = createLocalMemoryStore({ now: () => current, autoProcessBacklog: false });
  store.writeEvent({
    event: {
      id: "evt_fujian_shown",
      type: MemoryEventType.EXPLANATION_SHOWN,
      canonicalName: "福建",
      timestamp: current - 5_000,
      explanationVersionId: "ver_fujian"
    }
  });
  store.processBacklog();
  const write = store.writeRelatedConceptHints({
    sourceConcept: "福建",
    explanationVersionId: "ver_fujian",
    relatedConceptHints: [
      { canonicalName: "莆田", score: 0.96, reason: "用户近期关注福建地理与地方特产" },
      { canonicalName: "常太", score: 0.91 },
      { canonicalName: "莆田", score: 0.2 }
    ],
    provider: "unit-provider",
    model: "unit-model",
    timestamp: current - 4_000
  });
  const healthBefore = store.getHealth().cognitiveMemory;

  let proposerInput = null;
  const discovery = await store.discoverPreRecallMemoryBridges({
    canonicalName: "莆田",
    currentContext: { text: "莆田" },
    relationProposer: async (input) => {
      proposerInput = input;
      return { status: AgentResultStatus.AVAILABLE, relationCandidates: [], rejectedCandidates: [] };
    },
    timestamp: current,
    maxBridgeCount: 3
  });
  const healthAfter = store.getHealth().cognitiveMemory;

  assert.equal(write.status, AgentResultStatus.AVAILABLE);
  assert.deepEqual(write.relatedConceptHints.map((hint) => hint.hintCanonicalName), ["莆田", "常太"]);
  assert.equal(healthBefore.relatedConceptHintCount, 2);
  assert.equal(healthBefore.conceptProjectionCount, 1);
  assert.equal(healthBefore.relationProposalCount, 0);
  assert.equal(healthBefore.activeRelationCount, 0);
  assert.equal(discovery.memoryBridges.length, 0);
  assert.equal(proposerInput.dailyMemoryBlocks.some((block) =>
    block.concepts.some((concept) =>
      concept.canonicalName === "福建" && concept.recallReason === "related_concept_hint")
  ), true);
  assert.equal(healthAfter.relationProposalCount, 0);
  assert.equal(healthAfter.activeRelationCount, 0);
});

test("feedback profile shapes detail hints and pre-recall candidate priority", async () => {
  const current = Date.parse("2026-05-31T10:00:00.000Z");
  const store = createLocalMemoryStore({ now: () => current, autoProcessBacklog: false });
  store.writeEvent({
    event: {
      id: "evt_muted_movie",
      type: MemoryEventType.MUTED_CATEGORY,
      canonicalName: "电影叙事",
      knowledgeType: "影视",
      timestamp: current - 100
    }
  });
  store.writeEvent({
    event: {
      id: "evt_movie_recent",
      type: MemoryEventType.EXPLANATION_SHOWN,
      canonicalName: "电影叙事",
      knowledgeType: "影视",
      timestamp: current - 90
    }
  });
  store.writeEvent({
    event: {
      id: "evt_geo_recent",
      type: MemoryEventType.EXPLANATION_SHOWN,
      canonicalName: "福建土楼",
      knowledgeType: "地理",
      timestamp: current - 1000
    }
  });
  store.writeEvent({
    event: {
      id: "evt_geo_confusing",
      type: MemoryEventType.MARKED_CONFUSING,
      canonicalName: "福建土楼",
      knowledgeType: "地理",
      timestamp: current - 900
    }
  });
  store.processBacklog();

  const profile = store.readProfileSummary();
  const geoPacket = store.queryMemory({
    canonicalName: "莆田",
    candidate: { canonicalName: "莆田", knowledgeType: "地理" },
    timestamp: current
  });
  const mutedPacket = store.queryMemory({
    canonicalName: "电影叙事",
    candidate: { canonicalName: "电影叙事", knowledgeType: "影视" },
    timestamp: current
  });
  let proposerInput = null;
  await store.discoverPreRecallMemoryBridges({
    canonicalName: "莆田",
    currentContext: { text: "莆田" },
    relationProposer: async (input) => {
      proposerInput = input;
      return { status: AgentResultStatus.AVAILABLE, relationCandidates: [], rejectedCandidates: [] };
    },
    timestamp: current,
    maxBridgeCount: 3
  });
  const proposedConcepts = proposerInput.dailyMemoryBlocks.flatMap((block) => block.concepts);

  assert.deepEqual(profile.hints.mutedKnowledgeTypes, ["影视"]);
  assert.deepEqual(profile.hints.difficultKnowledgeTypes, ["地理"]);
  assert.equal(profile.hints.preferredStyle, "background");
  assert.equal(profile.hints.explanationDetail, "more_detailed");
  assert.equal(geoPacket.profileHints.categoryDifficulty, true);
  assert.equal(geoPacket.profileHints.preferredStyle, "background");
  assert.equal(geoPacket.profileHints.explanationDetail, "more_detailed");
  assert.equal(mutedPacket.profileHints.categoryMuted, true);
  assert.equal(proposedConcepts[0].canonicalName, "福建土楼");
  assert.equal(proposedConcepts.some((concept) => concept.canonicalName === "电影叙事"), false);
});

test("feedback writes memory candidates without synchronously promoting derived state", () => {
  const store = createLocalMemoryStore({ now: () => 2500, autoProcessBacklog: false });
  const event = store.writeEvent({
    event: {
      id: "evt_too_hard",
      type: MemoryEventType.REQUESTED_SIMPLER,
      canonicalName: "KL divergence",
      timestamp: 2400,
      explanationVersionId: "ver_1"
    }
  });
  const evidence = store.readTargetEvidence("KL divergence");

  assert.equal(event.id, "evt_too_hard");
  assert.equal(evidence.memoryCandidates.length, 1);
  assert.equal(evidence.memoryCandidates[0].signal, "too_hard");
  assert.equal(evidence.memoryCandidates[0].sourceExplanationVersionId, "ver_1");
  assert.equal(store.readDerivedSummary("KL divergence"), null);

  store.processBacklog();
  const summary = store.readDerivedSummary("KL divergence");
  assert.equal(summary.targetState.derivedSignals[DerivedSignal.POSSIBLY_CONFUSING], true);
  assert.ok(summary.targetState.sourceCandidateIds.includes(evidence.memoryCandidates[0].id));
});

test("stale derived summaries are rebuilt from raw evidence", () => {
  const store = createLocalMemoryStore({ now: (() => {
    let current = 3000;
    return () => current += 10;
  })(), autoProcessBacklog: false });
  store.writeEvent({ event: { id: "evt_seen_1", type: MemoryEventType.RECENTLY_SEEN, canonicalName: "KV cache", timestamp: 1000 } });

  const first = store.queryMemory({ canonicalName: "KV cache", timestamp: 3010 });
  const stale = store.readDerivedSummary("KV cache");
  stale.summarizerVersion = "old-summarizer";
  const rebuilt = store.queryMemory({ canonicalName: "KV cache", timestamp: 3020 });

  assert.equal(first.memoryFreshness.status, "fresh");
  assert.equal(rebuilt.memoryFreshness.summarizerVersion, LOCAL_MEMORY_SUMMARIZER_VERSION);
  assert.equal(store.readDerivedSummary("KV cache").summarizerVersion, LOCAL_MEMORY_SUMMARIZER_VERSION);
  assert.ok(rebuilt.summaryEvidenceEventIds.includes("evt_seen_1"));
});

test("unsupported future SQLite schema opens as unavailable without overwriting database", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bco-memory-future-"));
  try {
    const db = new DatabaseSync(join(directory, "local-memory.sqlite"));
    db.exec("PRAGMA user_version = 999");
    db.close();
    const store = createPersistentLocalMemoryStore({ directory });
    const health = store.getHealth();
    const write = store.writeEvent({ event: { type: MemoryEventType.DISMISSED, canonicalName: "KL divergence" } });
    const query = store.queryMemory({ canonicalName: "KL divergence" });
    const check = new DatabaseSync(join(directory, "local-memory.sqlite"));
    const version = check.prepare("PRAGMA user_version").get().user_version;
    check.close();

    assert.equal(health.status, AgentResultStatus.UNAVAILABLE);
    assert.equal(health.reason, "memory_schema_unsupported");
    assert.equal(write.status, AgentResultStatus.UNAVAILABLE);
    assert.equal(query.status, AgentResultStatus.UNAVAILABLE);
    assert.equal(version, 999);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
