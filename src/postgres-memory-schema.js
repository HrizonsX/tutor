// @ts-nocheck
export const POSTGRES_MEMORY_SCHEMA_VERSION = 1;

const TABLES = Object.freeze([
  `CREATE TABLE IF NOT EXISTS {schema}.schema_migrations (
    id TEXT PRIMARY KEY,
    from_version INTEGER NOT NULL,
    to_version INTEGER NOT NULL,
    status TEXT NOT NULL,
    timestamp BIGINT NOT NULL,
    type TEXT NOT NULL,
    details_json JSONB NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS {schema}.raw_memory_events (
    id TEXT PRIMARY KEY,
    repository TEXT NOT NULL,
    type TEXT NOT NULL,
    canonical_name TEXT NOT NULL,
    observed_alias TEXT,
    timestamp BIGINT NOT NULL,
    knowledge_type TEXT,
    explanation_version_id TEXT,
    context_json JSONB NOT NULL,
    source_event_ids_json JSONB NOT NULL,
    uncertainty_json JSONB,
    related_concepts_json JSONB NOT NULL,
    record_json JSONB NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS {schema}.explanation_versions (
    id TEXT PRIMARY KEY,
    target TEXT NOT NULL,
    style TEXT,
    text TEXT NOT NULL,
    summary TEXT,
    confidence TEXT,
    timestamp BIGINT NOT NULL,
    previous_version_id TEXT,
    feedback_event_id TEXT,
    fact_sensitivity TEXT,
    source TEXT,
    provider TEXT,
    model TEXT,
    structured_response_json JSONB NOT NULL,
    context_summary_json JSONB NOT NULL,
    record_json JSONB NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS {schema}.memory_candidates (
    id TEXT PRIMARY KEY,
    canonical_name TEXT NOT NULL,
    kind TEXT NOT NULL,
    signal TEXT NOT NULL,
    status TEXT NOT NULL,
    uncertainty TEXT,
    timestamp BIGINT NOT NULL,
    source_event_ids_json JSONB NOT NULL,
    source_candidate_ids_json JSONB NOT NULL,
    source_explanation_version_id TEXT,
    provider TEXT,
    model TEXT,
    metadata_json JSONB NOT NULL,
    record_json JSONB NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS {schema}.concepts (
    canonical_name TEXT PRIMARY KEY,
    knowledge_type TEXT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
  )`,
  `CREATE TABLE IF NOT EXISTS {schema}.concept_aliases (
    alias TEXT NOT NULL,
    canonical_name TEXT NOT NULL REFERENCES {schema}.concepts(canonical_name),
    source_event_id TEXT,
    confidence TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    PRIMARY KEY (alias, canonical_name)
  )`,
  `CREATE TABLE IF NOT EXISTS {schema}.user_concept_states (
    canonical_name TEXT PRIMARY KEY REFERENCES {schema}.concepts(canonical_name),
    projection_json JSONB NOT NULL,
    source_event_ids_json JSONB NOT NULL,
    updated_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS {schema}.relation_records (
    id TEXT PRIMARY KEY,
    source_canonical_name TEXT NOT NULL,
    relation_type TEXT NOT NULL,
    target_canonical_name TEXT NOT NULL,
    status TEXT NOT NULL,
    confidence TEXT NOT NULL,
    basis TEXT,
    source_dates_json JSONB NOT NULL,
    source_event_ids_json JSONB NOT NULL,
    source_explanation_version_ids_json JSONB NOT NULL,
    occurrence_count INTEGER NOT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    record_json JSONB NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS {schema}.daily_memory_summaries (
    date TEXT PRIMARY KEY,
    summary_hash TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    summary_json JSONB NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS {schema}.reflection_reports (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    date TEXT,
    start_date TEXT,
    end_date TEXT,
    created_at BIGINT NOT NULL,
    report_json JSONB NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS {schema}.memory_projection_jobs (
    id TEXT PRIMARY KEY,
    projection_kind TEXT NOT NULL,
    canonical_name TEXT,
    status TEXT NOT NULL,
    attempt_count INTEGER NOT NULL,
    reason TEXT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    payload_json JSONB NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS {schema}.memory_outbox_events (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    status TEXT NOT NULL,
    attempt_count INTEGER NOT NULL,
    reason TEXT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    processed_at BIGINT,
    record_json JSONB NOT NULL
  )`
]);

const INDEXES = Object.freeze([
  "CREATE INDEX IF NOT EXISTS idx_raw_memory_events_target_time ON {schema}.raw_memory_events(canonical_name, timestamp)",
  "CREATE INDEX IF NOT EXISTS idx_memory_candidates_target_status ON {schema}.memory_candidates(canonical_name, status)",
  "CREATE INDEX IF NOT EXISTS idx_concept_aliases_alias ON {schema}.concept_aliases(alias)",
  "CREATE INDEX IF NOT EXISTS idx_relation_records_source_status ON {schema}.relation_records(source_canonical_name, status)",
  "CREATE INDEX IF NOT EXISTS idx_relation_records_target_status ON {schema}.relation_records(target_canonical_name, status)",
  "CREATE INDEX IF NOT EXISTS idx_memory_projection_jobs_status ON {schema}.memory_projection_jobs(status, updated_at)",
  "CREATE INDEX IF NOT EXISTS idx_memory_outbox_events_status ON {schema}.memory_outbox_events(status, updated_at)"
]);

export function createPostgresMemorySchemaStatements({ schema = "public" } = {}) {
  const safeSchema = sanitizeIdentifier(schema || "public");
  return [
    `CREATE SCHEMA IF NOT EXISTS ${safeSchema}`,
    ...TABLES,
    ...INDEXES
  ].map((statement) => statement.replaceAll("{schema}", safeSchema));
}

export function validatePostgresMemorySchemaVersion({
  currentVersion = 0,
  targetVersion = POSTGRES_MEMORY_SCHEMA_VERSION
} = {}) {
  const current = Number(currentVersion ?? 0);
  const target = Number(targetVersion ?? POSTGRES_MEMORY_SCHEMA_VERSION);
  if (current > target) {
    return {
      status: "unsupported_future",
      fromVersion: current,
      toVersion: target,
      reason: "memory_schema_unsupported"
    };
  }
  if (current === target) {
    return {
      status: "current",
      fromVersion: current,
      toVersion: target
    };
  }
  return {
    status: "needs_migration",
    fromVersion: current,
    toVersion: target
  };
}

function sanitizeIdentifier(value = "public") {
  const text = String(value).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) return "public";
  return text;
}
