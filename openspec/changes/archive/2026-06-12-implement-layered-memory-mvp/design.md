## Context

The browser extension already treats the localhost gateway as the only Agent,
memory, provider, and embedding boundary. The gateway owns durable memory,
summarization, relation discovery, and provider request memory injection. That
product boundary is correct for the target architecture.

The current implementation keeps durable memory inside the Local Memory Store,
with SQLite for persistence and in-memory mode for tests and demos. It already
stores raw learning events, explanation versions, memory candidates, concept
projections, daily summaries, relation proposals, reflection reports, and FTS
records. It also returns `memoryBridges` from active one-hop relations. This is
enough for local prototypes, but it is not the first physical step toward the
layered architecture because there is no production source-of-truth store,
session view, outbox projection boundary, or semantic recall adapter.

The target layered architecture remains Postgres + Redis + vector recall +
confirmed graph projection + CDC. This change intentionally implements only the
first MVP slice: Postgres, Redis, and a vector recall adapter boundary. Neo4j,
Milvus, Kafka, and Debezium are deferred until the first slice proves the memory
experience and data model.

## Goals / Non-Goals

**Goals:**

- Add a Postgres-backed memory repository that can be selected by runtime
  configuration without changing browser-facing gateway endpoints.
- Store raw memory evidence, concept registry data, aliases, concept state,
  relation records, daily/report views, and outbox records in Postgres.
- Add a Redis session view for current-page/current-session continuity,
  recently explained targets, short-lived suppression state, and immediate
  post-explanation recall.
- Add a vector recall adapter interface that the recall planner can call
  without hard-wiring Milvus in this change.
- Keep SQLite and in-memory Local Memory Store behavior available as local
  development and test fallbacks.
- Preserve privacy and uncertainty constraints: no full page text, no memory as
  authoritative world knowledge, and bounded Top 1-3 memory bridge injection.

**Non-Goals:**

- Do not introduce Neo4j or graph projection workers.
- Do not introduce Kafka, Debezium, or CDC connectors.
- Do not require Milvus or a specific vector database implementation.
- Do not perform a bulk migration from existing SQLite stores.
- Do not add browser-side memory caches, vector indexes, or graph caches.
- Do not implement multi-hop graph path explanations in this change.

## Decisions

### Add a layered repository beside the existing Local Memory Store

Introduce a new layered memory repository implementation instead of replacing
the SQLite Local Memory Store in place. The repository should expose the same
runtime-facing operations the gateway already needs: health, config update,
event write, memory query, relation discovery scheduling, report generation,
and close/dispose.

Rationale: the current SQLite store is valuable for unit tests, local demos, and
fallback development. Replacing it directly would make the first layered slice
harder to verify and harder to roll back.

Alternative considered: migrate `src/local-memory-store.js` directly to
Postgres. That would reduce adapter count, but it would mix storage migration
with behavior changes and make it easier to break existing tests.

### Use Postgres as the MVP source of truth

Postgres should own raw events, concept registry rows, aliases, user concept
state, relation records, daily summaries, reflection reports, runtime projection
metadata, and outbox events. It should be the durable source of truth whenever
the layered repository is active.

The first schema should be explicit and event-first:

- `raw_memory_events`
- `explanation_versions`
- `memory_candidates`
- `concepts`
- `concept_aliases`
- `user_concept_states`
- `relation_records`
- `daily_memory_summaries`
- `reflection_reports`
- `memory_projection_jobs`
- `memory_outbox_events`

Rationale: this mirrors the current SQLite evidence/derived-view separation,
but moves it into a store that can later support projections, partitioning, and
multi-view rebuilds.

Alternative considered: keep SQLite and add only a vector store. That improves
semantic recall, but it leaves the system without an outbox-friendly truth table
and would make later projection work more disruptive.

### Use Redis only for session view in the MVP

Redis should not become a second source of truth. It should store only short
lived session data such as recent concepts, recently explained concepts,
suppression/cooldown hints, and continuity needed immediately after a write.
All Redis records should be rebuildable or safely droppable.

Rationale: Redis solves the "just saw/explained this" latency problem without
forcing every memory query to wait for long-term projections.

Alternative considered: keep session state in Postgres. That is simpler
operationally, but it does not model the target session/long-term split and
pushes short-lived TTL data into the durable store.

### Add VectorRecallAdapter before choosing Milvus

The recall planner should depend on a stable vector recall interface that
accepts sanitized query context and returns bounded candidate concepts with
scores, source metadata, and recall reasons. The first implementation may be a
disabled adapter or deterministic local/test adapter. A later change can bind
the interface to Milvus/Zilliz or another vector backend.

Rationale: the product behavior needs a semantic recall boundary, but forcing
Milvus into the first change adds installation and infrastructure complexity
before the repository and session split are proven.

Alternative considered: implement Milvus immediately. That is closer to the
target architecture, but it makes the MVP depend on a heavier service before
the query planner contract is stable.

### Start with Postgres outbox polling

The layered repository should write durable outbox rows in the same transaction
as memory events and relation writes. A local worker can poll unprocessed outbox
rows and update concept projections, daily summaries, relation candidate
aggregates, and vector profile projection hooks.

Rationale: outbox polling preserves the event projection model without requiring
Debezium or Kafka in the first slice.

Alternative considered: synchronous projection on every write. That keeps the
system smaller but makes writes slower and blurs the raw/derived boundary.

### Preserve current-explanation-first recall limits

Memory query planning should combine exact target state, Redis session context,
active one-hop relation records, and vector candidates. The planner must keep
memory context bounded and label it as local learning history rather than world
knowledge. Exact prior explanation reuse remains limited to exact canonical
target matches.

Rationale: this preserves the existing safety boundary while allowing examples
like `常太枇杷 --is_a--> 枇杷` and `常太枇杷 --located_in--> 莆田常太` to support
lightweight continuity.

Alternative considered: use vector or relation recall to return prior
explanations for related concepts. That risks factual drift and over-reuse of
historical explanations.

## Risks / Trade-offs

- Infrastructure burden -> Keep SQLite/in-memory fallbacks and make Postgres,
  Redis, and vector adapter configuration explicit in gateway health.
- Dual implementation drift -> Define repository contract tests that run
  against both SQLite/in-memory and layered repository fixtures.
- Session/long-term inconsistency -> Treat Redis as ephemeral and Postgres as
  authoritative; include repository status and session freshness in diagnostics.
- Outbox backlog growth -> Track worker lag, retry counts, and failed projection
  reasons in health without exposing raw private payloads.
- Recall noise -> Keep Top 1-3 bridge limits, relation confidence/status gates,
  vector score thresholds, and non-fact-source cautions.
- Privacy creep -> Store hashes, aliases, source ids, and minimal context
  metadata rather than full page text or evidence snippets.
- Local installation friction -> Make the layered repository opt-in until the
  developer has configured Postgres and Redis.

## Migration Plan

1. Add layered repository configuration and health fields while leaving the
   current SQLite default behavior intact.
2. Add Postgres schema initialization/migration code and repository contract
   tests using a test connection when configured.
3. Add Redis session view adapter and tests with a deterministic fake/session
   implementation when Redis is not available in unit tests.
4. Add VectorRecallAdapter interface and disabled/test adapters.
5. Wire the runtime composition so `memory.repository=layered` selects the
   layered repository and otherwise falls back to existing Local Memory Store.
6. Add outbox polling worker behavior behind the layered repository.
7. Update diagnostics and README/runtime setup notes.

Rollback is to switch runtime configuration back to the existing SQLite or
in-memory Local Memory Store. Existing SQLite stores are not modified by this
change, and Postgres data can remain dormant until the layered repository is
selected again.

## Open Questions

- Should Postgres and Redis connection strings be environment-only in the first
  implementation, or editable through the gateway config UI as restart-required
  fields?
- Should the first vector adapter be a disabled no-op only, or should it include
  a lightweight local lexical fallback for development demos?
- Should the first relation table use `relation_records` for both candidate and
  active records, or keep separate candidate/confirmed tables in Postgres while
  Neo4j remains deferred?
