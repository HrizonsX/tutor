## Why

The current memory runtime has the right local-gateway ownership model, but its durable store is still a single local SQLite-backed implementation with no production-grade session view or semantic recall boundary. We need the first physical step toward the target layered memory architecture while preserving the existing quiet browser workflow and local development fallback.

## What Changes

- Introduce a layered memory repository MVP with Postgres as the durable source of truth for raw events, concepts, aliases, concept states, relation records, derived summaries, and an outbox.
- Add a Redis-backed session view for recent concepts, recent explanations, short-lived suppression state, and immediate post-explanation continuity.
- Add a vector recall adapter boundary so semantic/hybrid recall can be integrated without hard-wiring Milvus in the first implementation.
- Route memory query planning through exact memory, session view, active relations, and vector recall candidates while keeping current-explanation-first limits.
- Keep the existing SQLite/in-memory Local Memory Store as a development and test fallback during migration.
- Defer Neo4j confirmed graph projection, Debezium/Kafka CDC, and full Milvus hybrid retrieval to later changes.

## Capabilities

### New Capabilities

- `layered-memory-repository`: Postgres-backed source-of-truth memory repository, Redis session view, vector recall adapter boundary, and outbox-based projection workflow for the first layered-memory MVP.

### Modified Capabilities

- `local-memory-store`: The active memory repository can be backed by the new layered repository while preserving SQLite/in-memory fallback behavior and existing privacy constraints.
- `local-agent-memory-gateway`: Gateway / Local Agent Runtime memory health, configuration, write, query, and explain/rewrite injection must support the layered repository without changing browser-facing endpoint contracts.

## Impact

- Affected code: memory repository/store modules, gateway runtime composition, runtime config, diagnostics, explain pipeline memory injection, tests, and development startup scripts.
- New optional runtime dependencies: Postgres client, Redis client, and vector recall adapter implementation or test stub.
- New local infrastructure for the MVP path: PostgreSQL and Redis. Milvus, Neo4j, Debezium, and Kafka are not required for this change.
- Browser extension APIs remain compatible: `/health`, `/config`, `/explain`, `/rewrite`, `/embedding`, `/memory/events`, and `/memory/query` continue to expose stable shapes.
