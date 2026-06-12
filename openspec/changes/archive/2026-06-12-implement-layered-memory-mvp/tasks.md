## 1. Runtime Configuration And Dependencies

- [x] 1.1 Add layered memory runtime configuration fields for repository mode, Postgres connection, Redis connection, vector adapter mode, outbox worker settings, and restart-required metadata.
- [x] 1.2 Add optional Postgres and Redis client dependencies without making SQLite/in-memory tests require live external services.
- [x] 1.3 Add startup validation that reports missing layered repository configuration as structured unavailable memory rather than silently falling back.
- [x] 1.4 Update development startup scripts to select SQLite fallback by default and layered repository only when explicitly configured.

## 2. Repository Contract And Test Harness

- [x] 2.1 Define a runtime memory repository contract covering health, config update, event write, memory query, relation discovery scheduling, report generation, outbox processing, and close/dispose.
- [x] 2.2 Add repository contract tests for write/query/health behavior shared by SQLite/in-memory fallback and layered repository implementations.
- [x] 2.3 Add test fixtures for the layered repository using fake Postgres, fake Redis, and disabled vector adapter implementations when live services are not configured.
- [x] 2.4 Verify fallback Local Memory Store still passes existing memory, gateway, runtime explain pipeline, and diagnostics tests.

## 3. Postgres Memory Store

- [x] 3.1 Implement Postgres connection creation, schema initialization, schema version tracking, and unsupported future schema handling.
- [x] 3.2 Add Postgres tables for raw memory events, explanation versions, memory candidates, concepts, concept aliases, user concept states, relation records, daily summaries, reflection reports, projection jobs, and outbox events.
- [x] 3.3 Implement transactional memory event writes that persist raw event evidence and outbox rows together.
- [x] 3.4 Implement explanation version and memory candidate writes with the same privacy sanitization currently used by the Local Memory Store.
- [x] 3.5 Implement concept registry and alias upsert logic without merging ambiguous aliases.
- [x] 3.6 Implement exact concept state, prior explanation, candidate, relation, daily summary, and reflection report reads from Postgres.
- [x] 3.7 Add Postgres health diagnostics for connection state, schema version, migration status, row counts, and unavailable reasons without exposing secrets or raw payloads.

## 4. Redis Session View

- [x] 4.1 Implement a Redis session view adapter for recent concepts, recently explained targets, short-lived suppression state, TTL handling, and health checks.
- [x] 4.2 Add an in-memory fake session view for unit tests and local contract tests.
- [x] 4.3 Update memory event and explanation persistence paths to synchronously update session view after durable Postgres writes.
- [x] 4.4 Make Redis write failures degrade session recall while preserving successful Postgres writes.
- [x] 4.5 Add tests for TTL expiry, dropped session state, degraded Redis health, and long-term Postgres fallback query behavior.

## 5. Vector Recall Adapter Boundary

- [x] 5.1 Define a VectorRecallAdapter interface that accepts sanitized target/context input and returns bounded candidate concepts with scores, recall reasons, source metadata, and freshness.
- [x] 5.2 Implement a disabled vector adapter that returns no semantic candidates and explicitly reports vector recall disabled.
- [x] 5.3 Implement a deterministic test vector adapter for recall planner tests.
- [x] 5.4 Add config and health reporting for vector adapter mode, availability, last error, and candidate count without requiring Milvus.
- [x] 5.5 Add tests proving disabled vector recall does not invent semantic similarity results.

## 6. Layered Recall Planner

- [x] 6.1 Implement layered memory query planning over exact Postgres state, Redis session context, active one-hop relations, and vector adapter candidates.
- [x] 6.2 Rank recall candidates with current relevance, evidence strength, relation status, recency, forgetting risk, and configured bridge limits.
- [x] 6.3 Return compatible `memoryPacket`, `memoryBridges`, `relatedMemories`, freshness, policy, and repository status fields.
- [x] 6.4 Preserve exact-only prior explanation reuse so related or vector-recalled concepts cannot bypass provider generation.
- [x] 6.5 Add tests for bounded Top 1-3 bridge injection, unrelated memory exclusion, non-fact-source cautions, and examples such as `常太枇杷 -> 枇杷` and `常太枇杷 -> 莆田常太`.

## 7. Outbox Projection Worker

- [x] 7.1 Implement Postgres outbox polling with configurable batch size, retry count, lock/claim behavior, and processed/failure metadata.
- [x] 7.2 Implement projection handlers for concept state, relation candidate aggregates, daily summary refresh, reflection report inputs, and vector profile projection hooks.
- [x] 7.3 Ensure projection failures mark retryable outbox state without deleting raw event evidence.
- [x] 7.4 Expose outbox lag, failed projection count, last processed timestamp, and worker status in memory health.
- [x] 7.5 Add tests for successful projection, retryable failure, stale projection query fallback, and degraded freshness reporting.

## 8. Gateway Runtime Integration

- [x] 8.1 Add memory repository factory logic that selects layered repository, SQLite fallback, or in-memory fallback from runtime configuration.
- [x] 8.2 Route `/health`, `/memory/events`, `/memory/query`, `/explain`, `/rewrite`, relation discovery, and report generation through the selected repository contract.
- [x] 8.3 Keep browser-facing endpoint request and response shapes compatible across layered and fallback repositories.
- [x] 8.4 Ignore browser-provided memory packets, relation candidates, vector candidates, daily summaries, and memory bridges when layered repository is active.
- [x] 8.5 Add gateway tests for layered repository selection, degraded layered health, fallback selection, and stateless browser boundary behavior.

## 9. Privacy, Diagnostics, And Documentation

- [x] 9.1 Audit layered repository persistence to ensure full page text, provider tokens, connection secrets, and evidence snippets are not stored or returned.
- [x] 9.2 Extend diagnostics and options-facing memory health models to display layered component status and degraded reasons.
- [x] 9.3 Update README setup notes for SQLite fallback, layered Postgres/Redis MVP configuration, vector adapter modes, and deferred Neo4j/Kafka/Debezium/Milvus scope.
- [x] 9.4 Add troubleshooting notes for missing Postgres, missing Redis, disabled vector recall, outbox lag, and fallback mode.

## 10. Verification

- [x] 10.1 Run the full Node test suite and fix regressions in existing SQLite/in-memory behavior.
- [x] 10.2 Run layered repository contract tests with fake services in normal CI mode.
- [x] 10.3 Run optional integration tests against real local Postgres and Redis when connection environment variables are present.
- [x] 10.4 Smoke-test gateway startup in SQLite fallback mode and layered mode.
- [x] 10.5 Verify OpenSpec status reports the change as ready for implementation.
