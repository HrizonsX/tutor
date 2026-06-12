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
} from "../src/gateway/local-memory-store.js";
import { AgentResultStatus, DerivedSignal, MemoryEventType } from "../src/shared/contracts.js";
import { ConceptRelationType, RelationBasis } from "../src/gateway/cognitive-memory.js";

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

test("FTS rows stay unique per record across re-summarization and restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bco-memory-fts-dedup-"));
  try {
    const first = createPersistentLocalMemoryStore({ directory, now: () => 1000, autoProcessBacklog: false });
    first.writeEvent({ event: { id: "evt_fts_1", type: MemoryEventType.KNOWLEDGE_ENCOUNTERED, canonicalName: "枇杷", timestamp: 900 } });
    first.processBacklog();
    first.writeEvent({ event: { id: "evt_fts_2", type: MemoryEventType.KNOWLEDGE_ENCOUNTERED, canonicalName: "枇杷", timestamp: 950 } });
    first.processBacklog();
    first.close();

    const second = createPersistentLocalMemoryStore({ directory, now: () => 1200, autoProcessBacklog: false });
    second.writeEvent({ event: { id: "evt_fts_3", type: MemoryEventType.KNOWLEDGE_ENCOUNTERED, canonicalName: "枇杷", timestamp: 1100 } });
    second.processBacklog();
    second.close();

    const db = new DatabaseSync(join(directory, "local-memory.sqlite"));
    const duplicates = db.prepare(`
      SELECT row_kind, record_id, COUNT(*) AS n
      FROM memory_fts
      GROUP BY row_kind, record_id
      HAVING n > 1
    `).all();
    const retrievalRows = db.prepare("SELECT COUNT(*) AS n FROM memory_fts WHERE row_kind = 'retrieval_summary'").get();
    db.close();

    assert.deepEqual(duplicates, []);
    assert.equal(retrievalRows.n, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("legacy databases move derived rows out of retrieval_summaries and dedupe FTS on open", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bco-memory-migrate-"));
  try {
    const seed = createPersistentLocalMemoryStore({ directory, now: () => 1000, autoProcessBacklog: false });
    seed.writeEvent({ event: { id: "evt_legacy", type: MemoryEventType.KNOWLEDGE_ENCOUNTERED, canonicalName: "常太", timestamp: 900 } });
    seed.processBacklog();
    seed.close();

    // Simulate the historical clobbering layout: the derived summary lives in
    // retrieval_summaries (overwriting the retrieval row) and FTS has
    // duplicate rows from the old bare-INSERT path.
    const corrupt = new DatabaseSync(join(directory, "local-memory.sqlite"));
    const derived = corrupt.prepare("SELECT * FROM derived_summaries WHERE canonical_name = ?").get("常太");
    assert.ok(derived, "seed store should have written a derived summary");
    corrupt.prepare(`
      INSERT OR REPLACE INTO retrieval_summaries (
        canonical_name, summary_json, text, source_event_ids_json,
        source_candidate_ids_json, timestamp, summarizer_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      derived.canonical_name,
      derived.summary_json,
      derived.text,
      derived.source_event_ids_json,
      derived.source_candidate_ids_json,
      derived.timestamp,
      derived.summarizer_version
    );
    corrupt.prepare("DELETE FROM derived_summaries").run();
    corrupt.prepare(`
      INSERT INTO memory_fts(row_kind, record_id, canonical_name, text)
      SELECT row_kind, record_id, canonical_name, text FROM memory_fts
    `).run();
    corrupt.close();

    const reopened = createPersistentLocalMemoryStore({ directory, now: () => 2000, autoProcessBacklog: false });
    const summary = reopened.readDerivedSummary("常太");
    reopened.close();

    const check = new DatabaseSync(join(directory, "local-memory.sqlite"));
    const movedCount = check.prepare("SELECT COUNT(*) AS n FROM derived_summaries").get();
    const leftoverDerivedShapes = check.prepare("SELECT summary_json FROM retrieval_summaries").all()
      .map((row) => JSON.parse(row.summary_json))
      .filter((parsed) => parsed.kind === "target_memory_summary" || parsed.targetState);
    const duplicates = check.prepare(`
      SELECT COUNT(*) AS n FROM (
        SELECT row_kind, record_id FROM memory_fts GROUP BY row_kind, record_id HAVING COUNT(*) > 1
      )
    `).get();
    const migration = check.prepare("SELECT * FROM schema_migrations WHERE type = 'sqlite_layout_migration'").all();
    check.close();

    assert.ok(summary, "derived summary should be recallable after migration");
    assert.equal(movedCount.n, 1);
    assert.deepEqual(leftoverDerivedShapes, []);
    assert.equal(duplicates.n, 0);
    assert.equal(migration.length >= 1, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("raw event ledger is append-only and generated ids never collide across restarts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bco-memory-append-"));
  try {
    const first = createPersistentLocalMemoryStore({ directory, now: () => 1000, autoProcessBacklog: false });
    first.writeEvent({ event: { id: "evt_dup", type: MemoryEventType.KNOWLEDGE_ENCOUNTERED, canonicalName: "First Concept", timestamp: 900 } });
    first.writeEvent({ event: { id: "evt_dup", type: MemoryEventType.KNOWLEDGE_ENCOUNTERED, canonicalName: "Second Concept", timestamp: 950 } });
    const generatedA = first.writeEvent({ event: { type: MemoryEventType.KNOWLEDGE_ENCOUNTERED, canonicalName: "Auto Id", timestamp: 960 } });
    first.close();

    const second = createPersistentLocalMemoryStore({ directory, now: () => 1000, autoProcessBacklog: false });
    const generatedB = second.writeEvent({ event: { type: MemoryEventType.KNOWLEDGE_ENCOUNTERED, canonicalName: "Auto Id", timestamp: 960 } });
    second.close();

    const db = new DatabaseSync(join(directory, "local-memory.sqlite"));
    const dupRow = db.prepare("SELECT canonical_name FROM raw_memory_events WHERE id = 'evt_dup'").all();
    const autoRows = db.prepare("SELECT id FROM raw_memory_events WHERE canonical_name = 'Auto Id'").all();
    db.close();

    // The colliding id keeps the first write instead of rewriting history.
    assert.equal(dupRow.length, 1);
    assert.equal(dupRow[0].canonical_name, "First Concept");
    assert.notEqual(generatedA.id, generatedB.id);
    assert.equal(autoRows.length, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("queryMemory with allowSyncSummarize false performs no new SQLite writes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bco-memory-readonly-"));
  try {
    const store = createPersistentLocalMemoryStore({ directory, now: () => 1000, autoProcessBacklog: false });
    store.writeEvent({ event: { id: "evt_ro", type: MemoryEventType.KNOWLEDGE_ENCOUNTERED, canonicalName: "枇杷", timestamp: 900 } });
    store.processBacklog();
    store.close();

    const before = new DatabaseSync(join(directory, "local-memory.sqlite"));
    const jobsBefore = before.prepare("SELECT COUNT(*) AS n FROM summarizer_jobs").get().n;
    const summariesBefore = before.prepare("SELECT COUNT(*) AS n FROM derived_summaries").get().n;
    before.close();

    const reader = createPersistentLocalMemoryStore({ directory, now: () => 2000, autoProcessBacklog: false });
    const packet = reader.queryMemory({ canonicalName: "枇杷", timestamp: 2000, allowSyncSummarize: false });
    reader.close();

    const after = new DatabaseSync(join(directory, "local-memory.sqlite"));
    const jobsAfter = after.prepare("SELECT COUNT(*) AS n FROM summarizer_jobs").get().n;
    const summariesAfter = after.prepare("SELECT COUNT(*) AS n FROM derived_summaries").get().n;
    after.close();

    assert.equal(packet.status, AgentResultStatus.AVAILABLE);
    assert.equal(jobsAfter, jobsBefore);
    assert.equal(summariesAfter, summariesBefore);
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

test("user profile summarizes preferences instead of daily concept content", () => {
  const current = Date.parse("2026-06-01T10:00:00.000Z");
  const store = createLocalMemoryStore({ now: () => current, autoProcessBacklog: false });
  store.writeEvent({
    event: {
      id: "evt_background",
      type: MemoryEventType.REQUESTED_MORE_CONTEXT,
      canonicalName: "Fujian",
      knowledgeType: "geography",
      requestedStyle: "background",
      timestamp: current - 5_000
    }
  });
  store.writeEvent({
    event: {
      id: "evt_confusing",
      type: MemoryEventType.MARKED_CONFUSING,
      canonicalName: "Putian",
      knowledgeType: "geography",
      timestamp: current - 4_000
    }
  });
  store.writeEvent({
    event: {
      id: "evt_mute",
      type: MemoryEventType.MUTED_CATEGORY,
      canonicalName: "Movie trivia",
      knowledgeType: "entertainment",
      timestamp: current - 3_000
    }
  });
  store.writeEvent({
    event: {
      id: "evt_dismiss_one",
      type: MemoryEventType.DISMISSED,
      canonicalName: "Toolbar fragment",
      knowledgeType: "other",
      timestamp: current - 2_000
    }
  });
  store.writeEvent({
    event: {
      id: "evt_dismiss_two",
      type: MemoryEventType.DISMISSED,
      canonicalName: "Another toolbar fragment",
      knowledgeType: "other",
      timestamp: current - 1_000
    }
  });
  store.processBacklog();

  const profile = store.readProfileSummary();
  const userProfileText = JSON.stringify(profile.userProfile);

  assert.equal(profile.userProfile.kind, "user_preference_profile");
  assert.equal(profile.userProfile.audience, "model_context");
  assert.equal(profile.userProfile.summary.preferredStyle, "background");
  assert.equal(profile.userProfile.summary.detailLevel, "more_detailed");
  assert.equal(profile.userProfile.summary.interventionLevel, "low");
  assert.match(profile.userProfile.modelContext.summaryText, /背景/);
  assert.match(profile.userProfile.modelContext.summaryText, /详细/);
  assert.match(profile.userProfile.modelContext.summaryText, /低打扰/);
  assert.equal(profile.userProfile.modelContext.metrics.preferredStyle, "background");
  assert.equal(profile.userProfile.modelContext.metrics.interventionLevel, "low");
  assert.deepEqual(profile.userProfile.modelContext.metrics.coarseInterestTypes.map((entry) => entry.name), ["geography", "other"]);
  assert.deepEqual(profile.userProfile.learning.difficultKnowledgeTypes, ["geography"]);
  assert.deepEqual(profile.userProfile.interaction.mutedKnowledgeTypes, ["entertainment"]);
  assert.deepEqual(profile.userProfile.learning.coarseInterestTypes.map((entry) => entry.name), ["geography", "other"]);
  assert.equal(Object.hasOwn(profile.userProfile, "recentConcepts"), false);
  assert.equal(Object.hasOwn(profile.userProfile.learning, "difficultConcepts"), false);
  assert.doesNotMatch(userProfileText, /Fujian|Putian|Toolbar fragment|Movie trivia/);
  assert.deepEqual(profile.interests.recentConcepts.slice(0, 2), ["Another toolbar fragment", "Toolbar fragment"]);
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
