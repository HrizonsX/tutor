import test from "node:test";
import assert from "node:assert/strict";
import {
  createPostgresMemorySchemaStatements,
  validatePostgresMemorySchemaVersion
} from "../src/postgres-memory-schema.js";

test("Postgres memory schema includes layered MVP source and projection tables", () => {
  const sql = createPostgresMemorySchemaStatements({ schema: "memory" }).join("\n");

  for (const table of [
    "raw_memory_events",
    "explanation_versions",
    "memory_candidates",
    "concepts",
    "concept_aliases",
    "user_concept_states",
    "relation_records",
    "daily_memory_summaries",
    "reflection_reports",
    "memory_projection_jobs",
    "memory_outbox_events",
    "schema_migrations"
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS memory\\.${table}`));
  }
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_memory_outbox_events_status/);
  assert.match(sql, /provider TEXT/);
  assert.match(sql, /model TEXT/);
  assert.match(sql, /JSONB/);
});

test("Postgres schema version validation rejects unsupported future versions", () => {
  assert.deepEqual(validatePostgresMemorySchemaVersion({ currentVersion: 0, targetVersion: 1 }), {
    status: "needs_migration",
    fromVersion: 0,
    toVersion: 1
  });
  assert.deepEqual(validatePostgresMemorySchemaVersion({ currentVersion: 1, targetVersion: 1 }), {
    status: "current",
    fromVersion: 1,
    toVersion: 1
  });
  assert.deepEqual(validatePostgresMemorySchemaVersion({ currentVersion: 999, targetVersion: 1 }), {
    status: "unsupported_future",
    fromVersion: 999,
    toVersion: 1,
    reason: "memory_schema_unsupported"
  });
});
