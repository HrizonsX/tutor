import test from "node:test";
import assert from "node:assert/strict";
import { createGatewayRuntimeConfig } from "../src/gateway/runtime-config.js";
import { createMemoryRepositoryFromRuntimeConfig } from "../src/gateway/memory-repository-factory.js";

const hasLayeredIntegrationEnv = Boolean(
  process.env.BCO_TEST_POSTGRES_URL &&
  process.env.BCO_TEST_REDIS_URL
);
const skipReason = "Set BCO_TEST_POSTGRES_URL and BCO_TEST_REDIS_URL to run live layered integration (npm run db:up; see .env.example).";

function createIntegrationRepository() {
  return createMemoryRepositoryFromRuntimeConfig({
    config: createGatewayRuntimeConfig({
      providerConfig: {
        memory: {
          repository: "layered",
          postgres: { connectionString: process.env.BCO_TEST_POSTGRES_URL },
          redis: { url: process.env.BCO_TEST_REDIS_URL }
        }
      }
    })
  });
}

test("optional layered repository integration uses configured Postgres and Redis", {
  skip: hasLayeredIntegrationEnv ? false : skipReason
}, async () => {
  const repository = createIntegrationRepository();
  await repository.ready;
  const health = repository.getHealth();

  assert.equal(health.storeMode, "layered");
  assert.equal(health.mode, "local_gateway");
  assert.equal(health.layered.postgres.status, "available");
  assert.equal(health.layered.redis.status, "available");
  await repository.close();
});

test("layered round-trip: a fresh repository recalls events written by a previous one", {
  skip: hasLayeredIntegrationEnv ? false : skipReason
}, async () => {
  const concept = `IntegrationConcept-${Date.now()}`;
  const eventId = `evt_integration_${Date.now()}`;
  const writer = createIntegrationRepository();
  await writer.ready;
  const stored = await writer.writeEvent({
    event: {
      id: eventId,
      type: "knowledge_encountered",
      canonicalName: concept,
      observedAlias: concept,
      timestamp: Date.now()
    }
  });
  await writer.close();

  // A brand-new repository over the same Postgres must hydrate and recall
  // (long-term memory SHALL remain queryable from Postgres).
  const reader = createIntegrationRepository();
  await reader.ready;
  const packet = reader.queryMemory({ canonicalName: concept, timestamp: Date.now() });
  const health = reader.getHealth();
  await reader.close();

  assert.equal(stored.id, eventId);
  assert.equal(packet.status, "available");
  assert.ok(packet.summaryEvidenceEventIds.includes(eventId));
  assert.equal(health.layered.hydration.hydrated, true);
});
