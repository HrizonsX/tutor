import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentResultStatus, MemoryEventType } from "../src/contracts.js";
import { createGatewayRuntimeConfig } from "../src/runtime-config.js";
import {
  createMemoryRepositoryFromRuntimeConfig,
  createPostgresMemoryClient,
  createRedisSessionView
} from "../src/memory-repository-factory.js";
import {
  createDisabledVectorRecallAdapter,
  createInMemorySessionView
} from "../src/layered-memory-repository.js";

test("memory repository factory selects SQLite fallback by default", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bco-factory-sqlite-"));
  try {
    const repository = createMemoryRepositoryFromRuntimeConfig({
      config: createGatewayRuntimeConfig({ env: {} }),
      defaultDirectory: directory
    });

    const health = repository.getHealth();

    assert.equal(repository.storeMode, "sqlite");
    assert.equal(health.status, AgentResultStatus.AVAILABLE);
    assert.equal(health.persistent, true);
    repository.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("runtime-configured SQLite repository preserves privacy defaults for URL event context", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bco-factory-url-"));
  let repository = null;
  try {
    repository = createMemoryRepositoryFromRuntimeConfig({
      config: createGatewayRuntimeConfig({ env: {} }),
      defaultDirectory: directory,
      now: () => 1000
    });

    const stored = repository.writeEvent({
      event: {
        id: "evt_runtime_url",
        type: MemoryEventType.KNOWLEDGE_ENCOUNTERED,
        canonicalName: "Loquat",
        observedAlias: "loquat",
        timestamp: 900,
        context: {
          fragmentId: "p1",
          url: "https://example.com/path?token=secret",
          fullText: "private page text must not be copied"
        }
      }
    });

    assert.equal(stored.id, "evt_runtime_url");
    assert.equal(stored.context.pageOrigin, "https://example.com");
    assert.doesNotMatch(JSON.stringify(stored), /token=secret|fullText|private page text/);
  } finally {
    repository?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("memory repository factory selects explicit in-memory fallback", () => {
  const repository = createMemoryRepositoryFromRuntimeConfig({
    config: createGatewayRuntimeConfig({
      providerConfig: {
        memory: { repository: "memory" }
      }
    })
  });

  const health = repository.getHealth();

  assert.equal(repository.storeMode, "memory");
  assert.equal(health.persistent, false);
  repository.close();
});

test("memory repository factory selects layered repository with injected services", () => {
  const fakePostgres = {
    available: true,
    tables: { outboxEvents: [] },
    getHealth: () => ({
      status: AgentResultStatus.AVAILABLE,
      schemaVersion: 1,
      migrationStatus: { schemaVersion: 1, count: 0, latest: null }
    }),
    writeEventTransaction() {},
    processOutboxBatch: () => ({ processed: 0, failed: 0 })
  };
  const repository = createMemoryRepositoryFromRuntimeConfig({
    config: createGatewayRuntimeConfig({
      providerConfig: {
        memory: { repository: "layered" }
      }
    }),
    services: {
      postgres: fakePostgres,
      sessionView: createInMemorySessionView(),
      vectorRecall: createDisabledVectorRecallAdapter()
    }
  });

  const health = repository.getHealth();

  assert.equal(repository.storeMode, "layered");
  assert.equal(health.status, AgentResultStatus.AVAILABLE);
  assert.equal(health.layered.postgres.status, AgentResultStatus.AVAILABLE);
  repository.close();
});

test("memory repository factory keeps layered unavailable instead of falling back silently", () => {
  const repository = createMemoryRepositoryFromRuntimeConfig({
    config: createGatewayRuntimeConfig({
      providerConfig: {
        memory: { repository: "layered" }
      }
    })
  });

  const health = repository.getHealth();

  assert.equal(repository.storeMode, "layered");
  assert.equal(health.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(health.reason, "layered_postgres_unconfigured");
  repository.close();
});

test("configured Postgres memory client initializes schema and writes event transaction", async () => {
  const pool = createFakePostgresPool();
  const client = createPostgresMemoryClient({
    pool,
    schema: "memory",
    schemaVersion: 1,
    now: () => 9000
  });

  await client.ready;
  const health = client.getHealth();
  await client.writeEventTransaction({
    event: {
      id: "evt_pg",
      repository: "learning",
      type: "knowledge_encountered",
      canonicalName: "枇杷",
      observedAlias: "loquat",
      timestamp: 8000,
      context: {},
      sourceEventIds: [],
      relatedConcepts: []
    },
    outboxEvent: {
      id: "outbox_evt_pg",
      kind: "memory_event",
      aggregateId: "evt_pg",
      status: "pending",
      attemptCount: 0,
      createdAt: 9000,
      updatedAt: 9000,
      record: { id: "evt_pg" }
    },
    concept: {
      canonicalName: "枇杷",
      knowledgeType: "other",
      createdAt: 8000,
      updatedAt: 8000
    },
    alias: {
      canonicalName: "枇杷",
      alias: "loquat",
      sourceEventId: "evt_pg",
      confidence: "low",
      createdAt: 8000,
      updatedAt: 8000
    }
  });

  assert.equal(health.status, AgentResultStatus.AVAILABLE);
  assert.equal(health.schemaVersion, 1);
  assert.equal(pool.queries.some((entry) => entry.sql.includes("CREATE TABLE IF NOT EXISTS memory.raw_memory_events")), true);
  assert.equal(pool.queries.some((entry) => entry.sql.includes("INSERT INTO memory.raw_memory_events")), true);
  assert.equal(pool.queries.some((entry) => entry.sql.includes("INSERT INTO memory.memory_outbox_events")), true);
  assert.equal(pool.queries.some((entry) => entry.sql === "BEGIN"), true);
  assert.equal(pool.queries.some((entry) => entry.sql === "COMMIT"), true);
  await client.close();
  assert.equal(pool.closed, true);
});

test("Redis session view stores recent concepts with TTL and degrades on write failures", async () => {
  const redis = createFakeRedisClient();
  const sessionView = createRedisSessionView({
    client: redis,
    keyPrefix: "bco:test",
    ttlMs: 1000,
    now: () => 100
  });

  await sessionView.ready;
  const stored = await sessionView.recordEvent({
    sessionId: "tab-1",
    canonicalName: "莆田常太",
    type: "explanation_shown",
    timestamp: 100
  });
  const context = await sessionView.getContext({
    sessionId: "tab-1",
    timestamp: 200
  });

  assert.equal(stored.status, AgentResultStatus.AVAILABLE);
  assert.equal(redis.setCalls[0].options.PX, 1000);
  assert.deepEqual(context.recentConcepts.map((entry) => entry.canonicalName), ["莆田常太"]);
  assert.deepEqual(context.recentlyExplained.map((entry) => entry.canonicalName), ["莆田常太"]);

  redis.failSet = true;
  const failed = await sessionView.recordEvent({
    sessionId: "tab-1",
    canonicalName: "枇杷",
    timestamp: 300
  });

  assert.equal(failed.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(failed.reason, "redis_session_write_failed");
  await sessionView.close();
  assert.equal(redis.closed, true);
});

function createFakePostgresPool() {
  const pool = {
    queries: [],
    closed: false,
    async query(sql, values = []) {
      this.queries.push({ sql: normalizeSql(sql), values });
      if (String(sql).includes("schema_migrations")) {
        return { rows: [{ to_version: 1, count: "1" }] };
      }
      if (String(sql).includes("COUNT(*)")) {
        return { rows: [{ count: "0" }] };
      }
      return { rows: [] };
    },
    async connect() {
      return {
        query: (sql, values = []) => pool.query(sql, values),
        release() {}
      };
    },
    async end() {
      this.closed = true;
    }
  };
  return pool;
}

function createFakeRedisClient() {
  const values = new Map();
  return {
    connected: false,
    closed: false,
    failSet: false,
    setCalls: [],
    async connect() {
      this.connected = true;
    },
    async get(key) {
      return values.get(key) ?? null;
    },
    async set(key, value, options = {}) {
      if (this.failSet) throw new Error("redis down");
      this.setCalls.push({ key, value, options });
      values.set(key, value);
    },
    async quit() {
      this.closed = true;
    }
  };
}

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, " ").trim();
}
