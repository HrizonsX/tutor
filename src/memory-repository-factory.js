// @ts-nocheck
import { createLocalMemoryStore, createPersistentLocalMemoryStore } from "./local-memory-store.js";
import { normalizeKnowledgeObjectName } from "./concepts.js";
import { AgentResultStatus, MemoryEventType } from "./contracts.js";
import {
  createDisabledVectorRecallAdapter,
  createInMemorySessionView,
  createLayeredMemoryRepository
} from "./layered-memory-repository.js";
import {
  createPostgresMemorySchemaStatements,
  POSTGRES_MEMORY_SCHEMA_VERSION,
  validatePostgresMemorySchemaVersion
} from "./postgres-memory-schema.js";

export function createMemoryRepositoryFromRuntimeConfig({
  config = {},
  defaultDirectory = "",
  services = {},
  now = () => Date.now()
} = {}) {
  const memory = config.memory ?? {};
  const repositoryMode = normalizeRepositoryMode(memory.repository ?? memory.storeMode);
  if (repositoryMode === "layered") {
    return createLayeredMemoryRepository({
      postgres: services.postgres ?? createConfiguredPostgresMemoryClient({
        ...(memory.postgres ?? {}),
        schemaVersion: memory.schemaVersion
      }),
      sessionView: services.sessionView ?? createConfiguredSessionView(memory.redis, { now }),
      vectorRecall: services.vectorRecall ?? createDisabledVectorRecallAdapter(),
      config,
      now
    });
  }
  if (repositoryMode === "memory") {
    return createLocalMemoryStore({ config, now });
  }
  return createPersistentLocalMemoryStore({
    directory: memory.path || defaultDirectory,
    config,
    now
  });
}

export function createConfiguredPostgresMemoryClient(postgresConfig = {}) {
  const connectionString = postgresConfig.connectionString ?? "";
  if (!connectionString) {
    return createUnavailablePostgresMemoryClient("layered_postgres_unconfigured");
  }
  return createPostgresMemoryClient({
    connectionString,
    schema: postgresConfig.schema,
    ssl: postgresConfig.ssl,
    schemaVersion: postgresConfig.schemaVersion
  });
}

export function createConfiguredSessionView(redisConfig = {}, { now = () => Date.now() } = {}) {
  if (redisConfig.url) {
    return createRedisSessionView({
      url: redisConfig.url,
      keyPrefix: redisConfig.keyPrefix,
      ttlMs: redisConfig.sessionTtlMs,
      retryCooldownMs: redisConfig.retryCooldownMs,
      now
    });
  }
  return createInMemorySessionView({
    now,
    ttlMs: redisConfig.sessionTtlMs
  });
}

export function createPostgresMemoryClient({
  connectionString = "",
  schema = "public",
  ssl = false,
  schemaVersion = POSTGRES_MEMORY_SCHEMA_VERSION,
  pool = null,
  loadPg = () => import("pg"),
  now = () => Date.now()
} = {}) {
  const safeSchema = sanitizeIdentifier(schema || "public");
  let activePool = pool;
  let status = "initializing";
  let reason = null;
  let migrationStatus = null;
  let rowCounts = {};
  let lastCheckedAt = null;

  const client = {
    kind: "postgres",
    get available() {
      return status === AgentResultStatus.AVAILABLE;
    },
    schema: safeSchema,
    ready: null,
    getHealth() {
      return {
        status,
        reason,
        schemaVersion: status === AgentResultStatus.AVAILABLE ? schemaVersion : null,
        migrationStatus,
        rowCounts,
        connectionStringConfigured: Boolean(connectionString || pool),
        lastCheckedAt
      };
    },
    async writeEventTransaction({ event = {}, outboxEvent = {}, concept = null, alias = null } = {}) {
      const unavailable = await ensureAvailable();
      if (unavailable) return unavailable;
      const connection = await activePool.connect();
      try {
        await connection.query("BEGIN");
        await insertRawMemoryEvent(connection, safeSchema, event);
        if (concept) await upsertConcept(connection, safeSchema, concept);
        if (alias) await upsertAlias(connection, safeSchema, alias);
        await insertOutboxEvent(connection, safeSchema, outboxEvent);
        await connection.query("COMMIT");
        rowCounts.rawMemoryEvents = Number(rowCounts.rawMemoryEvents ?? 0) + 1;
        rowCounts.memoryOutboxEvents = Number(rowCounts.memoryOutboxEvents ?? 0) + 1;
        return { event, outboxEvent };
      } catch (error) {
        await safeQuery(connection, "ROLLBACK");
        return unavailablePostgresResult("layered_postgres_write_failed", error);
      } finally {
        connection.release?.();
      }
    },
    async writeExplanationVersion(version = {}) {
      const unavailable = await ensureAvailable();
      if (unavailable) return unavailable;
      try {
        await activePool.query(`
          INSERT INTO ${safeSchema}.explanation_versions (
            id, target, style, text, summary, confidence, timestamp,
            previous_version_id, feedback_event_id, fact_sensitivity,
            source, provider, model, structured_response_json,
            context_summary_json, record_json
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT (id) DO UPDATE SET
            target = EXCLUDED.target,
            style = EXCLUDED.style,
            text = EXCLUDED.text,
            summary = EXCLUDED.summary,
            confidence = EXCLUDED.confidence,
            timestamp = EXCLUDED.timestamp,
            record_json = EXCLUDED.record_json
        `, [
          version.id,
          version.target,
          version.style ?? null,
          version.text ?? "",
          version.summary ?? "",
          version.confidence ?? null,
          version.timestamp ?? now(),
          version.previousVersionId ?? null,
          version.feedbackEventId ?? null,
          version.factSensitivity ?? null,
          version.source ?? null,
          version.provider ?? null,
          version.model ?? null,
          toJson(version.structuredResponse ?? {}),
          toJson(version.contextSummary ?? {}),
          toJson(version)
        ]);
      } catch (error) {
        return unavailablePostgresResult("layered_postgres_write_failed", error);
      }
      return version;
    },
    async writeMemoryCandidate(candidate = {}) {
      const unavailable = await ensureAvailable();
      if (unavailable) return unavailable;
      try {
        await activePool.query(`
          INSERT INTO ${safeSchema}.memory_candidates (
            id, canonical_name, kind, signal, status, uncertainty, timestamp,
            source_event_ids_json, source_candidate_ids_json,
            source_explanation_version_id, provider, model, metadata_json, record_json
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (id) DO UPDATE SET
            canonical_name = EXCLUDED.canonical_name,
            kind = EXCLUDED.kind,
            signal = EXCLUDED.signal,
            status = EXCLUDED.status,
            metadata_json = EXCLUDED.metadata_json,
            record_json = EXCLUDED.record_json
        `, [
          candidate.id,
          candidate.canonicalName,
          candidate.kind ?? "unknown",
          candidate.signal ?? "unknown",
          candidate.status ?? "active",
          candidate.uncertainty ?? null,
          candidate.timestamp ?? now(),
          toJson(candidate.sourceEventIds ?? []),
          toJson(candidate.sourceCandidateIds ?? []),
          candidate.sourceExplanationVersionId ?? null,
          candidate.provider ?? null,
          candidate.model ?? null,
          toJson(candidate.metadata ?? {}),
          toJson(candidate)
        ]);
      } catch (error) {
        return unavailablePostgresResult("layered_postgres_write_failed", error);
      }
      return candidate;
    },
    async writeRelationRecord(relation = {}) {
      const unavailable = await ensureAvailable();
      if (unavailable) return unavailable;
      try {
        await activePool.query(`
          INSERT INTO ${safeSchema}.relation_records (
            id, source_canonical_name, relation_type, target_canonical_name,
            status, confidence, basis, source_dates_json, source_event_ids_json,
            source_explanation_version_ids_json, occurrence_count, created_at,
            updated_at, record_json
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            confidence = EXCLUDED.confidence,
            occurrence_count = EXCLUDED.occurrence_count,
            updated_at = EXCLUDED.updated_at,
            record_json = EXCLUDED.record_json
        `, [
          relation.id,
          relation.sourceCanonicalName,
          relation.relationType,
          relation.targetCanonicalName,
          relation.status ?? "candidate",
          relation.confidence ?? "low",
          relation.basis ?? null,
          toJson(relation.sourceDates ?? []),
          toJson(relation.sourceEventIds ?? []),
          toJson(relation.sourceExplanationVersionIds ?? []),
          relation.occurrenceCount ?? 1,
          relation.createdAt ?? relation.timestamp ?? now(),
          relation.updatedAt ?? now(),
          toJson(relation)
        ]);
      } catch (error) {
        return unavailablePostgresResult("layered_postgres_write_failed", error);
      }
      return relation;
    },
    async processOutboxBatch({ limit = 25, maxAttempts = 5, timestamp = now() } = {}) {
      const unavailable = await ensureAvailable();
      if (unavailable) return unavailable;
      const connection = await activePool.connect();
      try {
        await connection.query("BEGIN");
        const selected = await connection.query(`
          SELECT id
          FROM ${safeSchema}.memory_outbox_events
          WHERE status IN ('pending', 'retryable')
            AND attempt_count < $1
          ORDER BY created_at ASC
          LIMIT $2
          FOR UPDATE SKIP LOCKED
        `, [maxAttempts, limit]);
        const ids = selected.rows.map((row) => row.id).filter(Boolean);
        if (ids.length > 0) {
          await connection.query(`
            UPDATE ${safeSchema}.memory_outbox_events
            SET status = 'processed',
                processed_at = $1,
                updated_at = $1
            WHERE id = ANY($2::text[])
          `, [timestamp, ids]);
        }
        await connection.query("COMMIT");
        await refreshRowCounts();
        return { processed: ids.length, failed: 0 };
      } catch (error) {
        await safeQuery(connection, "ROLLBACK");
        return { processed: 0, failed: 1, status: AgentResultStatus.UNAVAILABLE, reason: "layered_outbox_process_failed" };
      } finally {
        connection.release?.();
      }
    },
    async close() {
      await activePool?.end?.();
    }
  };

  client.ready = initialize();
  return client;

  async function initialize() {
    try {
      if (!activePool) {
        const pg = await loadPg();
        activePool = new pg.Pool({
          connectionString,
          ssl: ssl ? { rejectUnauthorized: false } : undefined
        });
      }
      for (const statement of createPostgresMemorySchemaStatements({ schema: safeSchema })) {
        await activePool.query(statement);
      }
      const currentVersion = await readSchemaVersion();
      const validation = validatePostgresMemorySchemaVersion({
        currentVersion,
        targetVersion: schemaVersion
      });
      migrationStatus = validation;
      if (validation.status === "unsupported_future") {
        status = AgentResultStatus.UNAVAILABLE;
        reason = validation.reason;
        return client.getHealth();
      }
      if (validation.status === "needs_migration") {
        await activePool.query(`
          INSERT INTO ${safeSchema}.schema_migrations (
            id, from_version, to_version, status, timestamp, type, details_json
          ) VALUES ($1, $2, $3, 'applied', $4, 'schema_init', $5)
          ON CONFLICT (id) DO UPDATE SET
            to_version = EXCLUDED.to_version,
            status = EXCLUDED.status,
            timestamp = EXCLUDED.timestamp,
            details_json = EXCLUDED.details_json
        `, [
          `memory_schema_${schemaVersion}`,
          validation.fromVersion,
          schemaVersion,
          now(),
          toJson({ schema: safeSchema })
        ]);
        migrationStatus = { ...validation, status: "current", migrated: true };
      }
      await refreshRowCounts();
      status = AgentResultStatus.AVAILABLE;
      reason = null;
    } catch (error) {
      status = AgentResultStatus.UNAVAILABLE;
      reason = isModuleMissing(error) ? "layered_postgres_dependency_missing" : "layered_postgres_connection_failed";
    }
    lastCheckedAt = now();
    return client.getHealth();
  }

  async function ensureAvailable() {
    await client.ready;
    if (status === AgentResultStatus.AVAILABLE) return null;
    return unavailablePostgresResult(reason ?? "layered_postgres_unavailable");
  }

  async function readSchemaVersion() {
    try {
      const result = await activePool.query(`
        SELECT to_version
        FROM ${safeSchema}.schema_migrations
        WHERE status = 'applied'
        ORDER BY timestamp DESC
        LIMIT 1
      `);
      return Number(result.rows?.[0]?.to_version ?? 0);
    } catch {
      return 0;
    }
  }

  async function refreshRowCounts() {
    const tableNames = [
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
      "memory_outbox_events"
    ];
    const counts = {};
    for (const tableName of tableNames) {
      try {
        const result = await activePool.query(`SELECT COUNT(*) AS count FROM ${safeSchema}.${tableName}`);
        counts[toCamelCase(tableName)] = Number(result.rows?.[0]?.count ?? 0);
      } catch {
        counts[toCamelCase(tableName)] = 0;
      }
    }
    rowCounts = counts;
  }
}

export function createRedisSessionView({
  url = "",
  keyPrefix = "bco:memory",
  ttlMs = 30 * 60 * 1000,
  retryCooldownMs = 15000,
  client = null,
  loadRedis = () => import("redis"),
  now = () => Date.now()
} = {}) {
  let activeClient = client;
  let status = "initializing";
  let reason = null;
  let sessionCount = 0;
  let lastCheckedAt = null;
  // A transient Redis error must not poison the view forever: after the
  // cooldown the next operation re-probes; success restores AVAILABLE.
  let lastFailureAt = 0;

  const inCooldown = () =>
    status !== AgentResultStatus.AVAILABLE && lastFailureAt > 0 && now() - lastFailureAt < retryCooldownMs;
  const markRecovered = () => {
    status = AgentResultStatus.AVAILABLE;
    reason = null;
    lastFailureAt = 0;
    lastCheckedAt = now();
  };
  const markFailed = (failureReason) => {
    status = AgentResultStatus.UNAVAILABLE;
    reason = failureReason;
    lastFailureAt = now();
    lastCheckedAt = now();
  };

  const sessionView = {
    kind: "redis",
    ready: null,
    async recordEvent({ sessionId = "default", canonicalName = "", type = "", timestamp = now() } = {}) {
      await sessionView.ready;
      if (status !== AgentResultStatus.AVAILABLE && (reason === "redis_dependency_missing" || inCooldown())) {
        return { status: AgentResultStatus.UNAVAILABLE, reason: reason ?? "redis_session_unavailable" };
      }
      const name = normalizeKnowledgeObjectName(canonicalName);
      if (!name) return { status: AgentResultStatus.AVAILABLE };
      try {
        const key = sessionKey(sessionId);
        const session = await readSession(key);
        upsertRecent(session.recentConcepts, {
          canonicalName: name,
          timestamp,
          expiresAt: timestamp + ttlMs
        });
        if (type === MemoryEventType.EXPLANATION_SHOWN) {
          upsertRecent(session.recentlyExplained, {
            canonicalName: name,
            timestamp,
            expiresAt: timestamp + ttlMs
          });
        }
        await activeClient.set(key, JSON.stringify(session), { PX: ttlMs });
        sessionCount += 1;
        markRecovered();
        return { status: AgentResultStatus.AVAILABLE };
      } catch (error) {
        markFailed("redis_session_write_failed");
        return { status, reason };
      }
    },
    async getContext({ sessionId = "default", timestamp = now() } = {}) {
      await sessionView.ready;
      if (status !== AgentResultStatus.AVAILABLE && (reason === "redis_dependency_missing" || inCooldown())) {
        return {
          recentConcepts: [],
          recentlyExplained: [],
          suppressions: [],
          status,
          reason: reason ?? "redis_session_unavailable"
        };
      }
      try {
        const key = sessionKey(sessionId);
        const session = await readSession(key);
        const active = {
          recentConcepts: filterActive(session.recentConcepts, timestamp),
          recentlyExplained: filterActive(session.recentlyExplained, timestamp),
          suppressions: filterActive(session.suppressions, timestamp)
        };
        // Read path stays read-only: the old write-back raced concurrent
        // recordEvent calls and refreshed TTLs on mere reads. Single-user
        // localhost makes lost-expiry pruning acceptable.
        markRecovered();
        return active;
      } catch {
        markFailed("redis_session_read_failed");
        return { recentConcepts: [], recentlyExplained: [], suppressions: [], status, reason };
      }
    },
    getHealth() {
      return {
        status,
        reason,
        mode: "redis",
        ttlMs,
        sessionCount,
        urlConfigured: Boolean(url || client),
        lastCheckedAt
      };
    },
    async close() {
      if (typeof activeClient?.quit === "function") await activeClient.quit();
      else if (typeof activeClient?.disconnect === "function") await activeClient.disconnect();
    }
  };

  sessionView.ready = initialize();
  return sessionView;

  async function initialize() {
    try {
      if (!activeClient) {
        const redis = await loadRedis();
        activeClient = redis.createClient({ url });
      }
      if (typeof activeClient.connect === "function") await activeClient.connect();
      status = AgentResultStatus.AVAILABLE;
      reason = null;
    } catch (error) {
      status = AgentResultStatus.UNAVAILABLE;
      reason = isModuleMissing(error) ? "redis_dependency_missing" : "redis_session_connection_failed";
      lastFailureAt = now();
    }
    lastCheckedAt = now();
    return sessionView.getHealth();
  }

  async function readSession(key) {
    const raw = await activeClient.get(key);
    if (!raw) return { recentConcepts: [], recentlyExplained: [], suppressions: [] };
    try {
      const parsed = JSON.parse(raw);
      return {
        recentConcepts: Array.isArray(parsed.recentConcepts) ? parsed.recentConcepts : [],
        recentlyExplained: Array.isArray(parsed.recentlyExplained) ? parsed.recentlyExplained : [],
        suppressions: Array.isArray(parsed.suppressions) ? parsed.suppressions : []
      };
    } catch {
      return { recentConcepts: [], recentlyExplained: [], suppressions: [] };
    }
  }

  function sessionKey(sessionId) {
    return `${keyPrefix}:session:${String(sessionId || "default")}`;
  }
}

function createUnavailablePostgresMemoryClient(reason, extra = {}) {
  return {
    available: false,
    ready: Promise.resolve(),
    getHealth() {
      return {
        status: "unavailable",
        reason,
        schemaVersion: null,
        migrationStatus: null,
        ...extra
      };
    },
    writeEventTransaction() {
      return unavailablePostgresResult(reason);
    },
    writeExplanationVersion() {
      return unavailablePostgresResult(reason);
    },
    writeMemoryCandidate() {
      return unavailablePostgresResult(reason);
    },
    writeRelationRecord() {
      return unavailablePostgresResult(reason);
    },
    processOutboxBatch() {
      return unavailablePostgresResult(reason);
    },
    close() {}
  };
}

function normalizeRepositoryMode(value = "sqlite") {
  if (value === "layered") return "layered";
  if (value === "memory") return "memory";
  return "sqlite";
}

function unavailablePostgresResult(reason, error = null) {
  return {
    status: AgentResultStatus.UNAVAILABLE,
    reason,
    unavailableReason: reason,
    lastError: error?.message ?? null
  };
}

async function insertRawMemoryEvent(connection, schema, event = {}) {
  await connection.query(`
    INSERT INTO ${schema}.raw_memory_events (
      id, repository, type, canonical_name, observed_alias, timestamp,
      knowledge_type, explanation_version_id, context_json,
      source_event_ids_json, uncertainty_json, related_concepts_json, record_json
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    ON CONFLICT (id) DO UPDATE SET
      repository = EXCLUDED.repository,
      type = EXCLUDED.type,
      canonical_name = EXCLUDED.canonical_name,
      observed_alias = EXCLUDED.observed_alias,
      timestamp = EXCLUDED.timestamp,
      context_json = EXCLUDED.context_json,
      record_json = EXCLUDED.record_json
  `, [
    event.id,
    event.repository ?? "learning",
    event.type,
    event.canonicalName,
    event.observedAlias ?? null,
    event.timestamp,
    event.knowledgeType ?? null,
    event.explanationVersionId ?? null,
    toJson(event.context ?? {}),
    toJson(event.sourceEventIds ?? []),
    toJson(event.uncertainty ?? null),
    toJson(event.relatedConcepts ?? []),
    toJson(event)
  ]);
}

async function insertOutboxEvent(connection, schema, outboxEvent = {}) {
  await connection.query(`
    INSERT INTO ${schema}.memory_outbox_events (
      id, kind, aggregate_id, status, attempt_count, reason,
      created_at, updated_at, processed_at, record_json
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      attempt_count = EXCLUDED.attempt_count,
      updated_at = EXCLUDED.updated_at,
      record_json = EXCLUDED.record_json
  `, [
    outboxEvent.id,
    outboxEvent.kind,
    outboxEvent.aggregateId,
    outboxEvent.status ?? "pending",
    outboxEvent.attemptCount ?? 0,
    outboxEvent.reason ?? null,
    outboxEvent.createdAt,
    outboxEvent.updatedAt,
    outboxEvent.processedAt ?? null,
    toJson(outboxEvent.record ?? outboxEvent)
  ]);
}

async function upsertConcept(connection, schema, concept = {}) {
  await connection.query(`
    INSERT INTO ${schema}.concepts (
      canonical_name, knowledge_type, created_at, updated_at, metadata_json
    ) VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (canonical_name) DO UPDATE SET
      knowledge_type = COALESCE(EXCLUDED.knowledge_type, ${schema}.concepts.knowledge_type),
      updated_at = EXCLUDED.updated_at
  `, [
    concept.canonicalName,
    concept.knowledgeType ?? null,
    concept.createdAt,
    concept.updatedAt,
    toJson(concept.metadata ?? {})
  ]);
}

async function upsertAlias(connection, schema, alias = {}) {
  await connection.query(`
    INSERT INTO ${schema}.concept_aliases (
      alias, canonical_name, source_event_id, confidence, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (alias, canonical_name) DO UPDATE SET
      source_event_id = COALESCE(EXCLUDED.source_event_id, ${schema}.concept_aliases.source_event_id),
      confidence = EXCLUDED.confidence,
      updated_at = EXCLUDED.updated_at
  `, [
    alias.alias,
    alias.canonicalName,
    alias.sourceEventId ?? null,
    alias.confidence ?? "low",
    alias.createdAt,
    alias.updatedAt
  ]);
}

function upsertRecent(items, entry) {
  const next = items.filter((item) => item.canonicalName !== entry.canonicalName);
  next.push(entry);
  next.sort((left, right) => Number(right.timestamp ?? 0) - Number(left.timestamp ?? 0));
  items.splice(0, items.length, ...next.slice(0, 20));
}

function filterActive(items = [], timestamp) {
  return items.filter((item) => !item.expiresAt || item.expiresAt > timestamp);
}

function sanitizeIdentifier(value = "public") {
  const text = String(value).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) return "public";
  return text;
}

function toJson(value) {
  return JSON.stringify(value ?? null);
}

function toCamelCase(value = "") {
  return String(value).replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function isModuleMissing(error) {
  return error?.code === "ERR_MODULE_NOT_FOUND" || /Cannot find package|Cannot find module/i.test(error?.message ?? "");
}

async function safeQuery(connection, sql) {
  try {
    await connection.query(sql);
  } catch {
    // Best-effort rollback/cleanup only.
  }
}
