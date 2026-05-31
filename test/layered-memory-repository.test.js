import test from "node:test";
import assert from "node:assert/strict";
import { AgentResultStatus, MemoryEventType } from "../src/contracts.js";
import {
  createDisabledVectorRecallAdapter,
  createInMemoryPostgresMemoryClient,
  createInMemorySessionView,
  createLayeredMemoryRepository,
  createTestVectorRecallAdapter
} from "../src/layered-memory-repository.js";

test("layered repository reports unavailable without Postgres configuration", () => {
  const repository = createLayeredMemoryRepository({
    postgres: null,
    sessionView: createInMemorySessionView(),
    vectorRecall: createDisabledVectorRecallAdapter()
  });

  const health = repository.getHealth();
  const write = repository.writeEvent({
    event: {
      type: MemoryEventType.KNOWLEDGE_ENCOUNTERED,
      canonicalName: "KL divergence"
    }
  });

  assert.equal(health.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(health.reason, "layered_postgres_unconfigured");
  assert.equal(health.storeMode, "layered");
  assert.equal(health.layered.postgres.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(write.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(write.reason, "layered_postgres_unconfigured");
});

test("layered repository persists raw event, outbox, concept alias, and session state", () => {
  const postgres = createInMemoryPostgresMemoryClient();
  const sessionView = createInMemorySessionView({ now: () => 1000 });
  const repository = createLayeredMemoryRepository({
    postgres,
    sessionView,
    vectorRecall: createDisabledVectorRecallAdapter(),
    now: () => 1000
  });

  const stored = repository.writeEvent({
    event: {
      id: "evt_loquat",
      type: MemoryEventType.KNOWLEDGE_ENCOUNTERED,
      canonicalName: "Loquat",
      observedAlias: "枇杷",
      timestamp: 900
    },
    sessionId: "browser-tab-1"
  });
  const query = repository.queryMemory({
    canonicalName: "Loquat",
    sessionId: "browser-tab-1",
    timestamp: 1000
  });

  assert.equal(stored.id, "evt_loquat");
  assert.equal(postgres.tables.rawMemoryEvents.length, 1);
  assert.equal(postgres.tables.outboxEvents.length, 1);
  assert.equal(postgres.tables.concepts[0].canonicalName, "Loquat");
  assert.equal(postgres.tables.conceptAliases[0].alias, "枇杷");
  assert.deepEqual(query.sessionContext.recentConcepts.map((entry) => entry.canonicalName), ["Loquat"]);
  assert.equal(query.vectorRecall.status, "disabled");
  assert.equal(query.memoryFreshness.status, "fresh");
});

test("layered repository stores sanitized evidence in Postgres tables", () => {
  const postgres = createInMemoryPostgresMemoryClient();
  const repository = createLayeredMemoryRepository({
    postgres,
    sessionView: createInMemorySessionView(),
    vectorRecall: createDisabledVectorRecallAdapter(),
    now: () => 1500
  });

  repository.writeEvent({
    event: {
      id: "evt_private",
      type: MemoryEventType.KNOWLEDGE_ENCOUNTERED,
      canonicalName: "Private Context",
      observedAlias: "Private Context",
      timestamp: 1400,
      context: {
        fragmentId: "p1",
        url: "https://example.com/path?token=secret",
        fullText: "this full text must not be copied"
      }
    }
  });

  assert.doesNotMatch(JSON.stringify(postgres.tables.rawMemoryEvents), /fullText|this full text|token=secret/);
});

test("disabled vector recall does not invent related memories", () => {
  const repository = createLayeredMemoryRepository({
    postgres: createInMemoryPostgresMemoryClient(),
    sessionView: createInMemorySessionView(),
    vectorRecall: createDisabledVectorRecallAdapter(),
    now: () => 2000
  });

  repository.writeEvent({
    event: {
      id: "evt_putian",
      type: MemoryEventType.KNOWLEDGE_ENCOUNTERED,
      canonicalName: "Putian Changtai",
      observedAlias: "莆田常太",
      timestamp: 1000
    }
  });
  const packet = repository.queryMemory({
    canonicalName: "Loquat",
    timestamp: 2000
  });

  assert.equal(packet.status, AgentResultStatus.AVAILABLE);
  assert.equal(packet.vectorRecall.status, "disabled");
  assert.deepEqual(packet.memoryBridges, []);
  assert.deepEqual(packet.relatedMemories, []);
});

test("vector candidates are bounded and labeled as local learning context", () => {
  const repository = createLayeredMemoryRepository({
    postgres: createInMemoryPostgresMemoryClient(),
    sessionView: createInMemorySessionView(),
    vectorRecall: createTestVectorRecallAdapter({
      candidates: [
        { canonicalName: "常太枇杷", score: 0.92, reasonCode: "semantic_profile_match", evidenceEventIds: ["evt_a"] },
        { canonicalName: "莆田常太", score: 0.81, reasonCode: "location_context_match", evidenceEventIds: ["evt_b"] },
        { canonicalName: "Unrelated", score: 0.2, reasonCode: "too_weak", evidenceEventIds: ["evt_c"] }
      ]
    }),
    now: () => 3000
  });

  repository.writeEvent({
    event: {
      id: "evt_current",
      type: MemoryEventType.KNOWLEDGE_ENCOUNTERED,
      canonicalName: "枇杷",
      timestamp: 2500
    }
  });
  const packet = repository.queryMemory({
    canonicalName: "枇杷",
    timestamp: 3000,
    maxBridgeCount: 2
  });

  assert.equal(packet.memoryBridges.length, 2);
  assert.deepEqual(packet.memoryBridges.map((bridge) => bridge.relatedConcept), ["常太枇杷", "莆田常太"]);
  assert.equal(packet.memoryBridges[0].sourceRole, "local_learning_context");
  assert.equal(packet.memoryBridges[0].caution, "not_fact_source");
  assert.equal(packet.memoryBridges[0].recallReason, "semantic_profile_match");
  assert.equal(packet.recallPolicy.maxBridgeCount, 2);
});

test("active relation records are persisted and recalled as memory bridges", () => {
  const postgres = createInMemoryPostgresMemoryClient();
  const repository = createLayeredMemoryRepository({
    postgres,
    sessionView: createInMemorySessionView(),
    vectorRecall: createDisabledVectorRecallAdapter(),
    now: () => 4000
  });

  const relation = repository.gateRelationProposal({
    sourceCanonicalName: "常太枇杷",
    relationType: "is_a",
    targetCanonicalName: "枇杷",
    sourceDate: "1970-01-01",
    basis: "current_context_explicit",
    confidence: "high",
    usableForOverlay: true,
    sourceEventIds: ["evt_relation"]
  }, {
    dayBlocks: [{
      date: "1970-01-01",
      concepts: [{ canonicalName: "枇杷" }]
    }]
  });
  const packet = repository.queryMemory({
    canonicalName: "枇杷",
    timestamp: 4000,
    maxBridgeCount: 1
  });

  assert.equal(relation.status, "active");
  assert.equal(postgres.tables.relationRecords.length, 1);
  assert.equal(packet.memoryBridges[0].relatedConcept, "常太枇杷");
  assert.equal(packet.memoryBridges[0].relationType, "is_a");
  assert.equal(packet.memoryBridges[0].caution, "not_fact_source");
});

test("outbox processing marks rows processed and reports worker status", () => {
  const postgres = createInMemoryPostgresMemoryClient();
  const repository = createLayeredMemoryRepository({
    postgres,
    sessionView: createInMemorySessionView(),
    vectorRecall: createDisabledVectorRecallAdapter(),
    now: () => 5000
  });

  repository.writeEvent({
    event: {
      id: "evt_outbox",
      type: MemoryEventType.KNOWLEDGE_ENCOUNTERED,
      canonicalName: "Outbox Pattern",
      timestamp: 4900
    }
  });
  const processed = repository.processOutbox({ limit: 5 });
  const health = repository.getHealth();

  assert.equal(processed.status, AgentResultStatus.AVAILABLE);
  assert.equal(processed.processed, 1);
  assert.equal(postgres.tables.outboxEvents[0].status, "processed");
  assert.equal(health.layered.outbox.pendingCount, 0);
  assert.equal(health.layered.outbox.lastProcessedAt, 5000);
});

test("layered repository supports asynchronous Postgres, Redis, and vector adapters", async () => {
  const postgres = createInMemoryPostgresMemoryClient();
  const asyncPostgres = {
    ...postgres,
    async writeEventTransaction(input) {
      return postgres.writeEventTransaction(input);
    },
    async processOutboxBatch(input) {
      return postgres.processOutboxBatch(input);
    }
  };
  const sessionView = {
    async recordEvent() {
      return { status: AgentResultStatus.AVAILABLE };
    },
    async getContext() {
      return {
        recentConcepts: [{ canonicalName: "枇杷", timestamp: 900 }],
        recentlyExplained: [],
        suppressions: []
      };
    },
    getHealth() {
      return { status: AgentResultStatus.AVAILABLE, mode: "redis", ttlMs: 1000 };
    }
  };
  const vectorRecall = {
    async recall() {
      return {
        status: AgentResultStatus.AVAILABLE,
        candidates: [{ canonicalName: "莆田常太", score: 0.9, reasonCode: "location_context_match" }]
      };
    },
    getHealth() {
      return { status: AgentResultStatus.AVAILABLE, mode: "test", candidateCount: 1 };
    }
  };
  const repository = createLayeredMemoryRepository({
    postgres: asyncPostgres,
    sessionView,
    vectorRecall,
    now: () => 6000
  });

  const stored = await repository.writeEvent({
    event: {
      id: "evt_async",
      type: MemoryEventType.KNOWLEDGE_ENCOUNTERED,
      canonicalName: "枇杷",
      timestamp: 5500
    }
  });
  const packet = await repository.queryMemory({
    canonicalName: "枇杷",
    timestamp: 6000,
    maxBridgeCount: 1
  });

  assert.equal(stored.sessionStatus, AgentResultStatus.AVAILABLE);
  assert.equal(postgres.tables.rawMemoryEvents.length, 1);
  assert.deepEqual(packet.sessionContext.recentConcepts.map((entry) => entry.canonicalName), ["枇杷"]);
  assert.deepEqual(packet.memoryBridges.map((bridge) => bridge.relatedConcept), ["莆田常太"]);
});
