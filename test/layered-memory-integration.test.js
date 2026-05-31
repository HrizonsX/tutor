import test from "node:test";
import assert from "node:assert/strict";
import { createGatewayRuntimeConfig } from "../src/runtime-config.js";
import { createMemoryRepositoryFromRuntimeConfig } from "../src/memory-repository-factory.js";

const hasLayeredIntegrationEnv = Boolean(
  process.env.BCO_TEST_POSTGRES_URL &&
  process.env.BCO_TEST_REDIS_URL
);

test("optional layered repository integration uses configured Postgres and Redis", {
  skip: hasLayeredIntegrationEnv ? false : "Set BCO_TEST_POSTGRES_URL and BCO_TEST_REDIS_URL to run live layered integration."
}, async () => {
  const repository = createMemoryRepositoryFromRuntimeConfig({
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
  await repository.ready;
  const health = repository.getHealth();

  assert.equal(health.storeMode, "layered");
  assert.equal(health.mode, "local_gateway");
  assert.equal(health.layered.postgres.status, "available");
  assert.equal(health.layered.redis.status, "available");
  await repository.close();
});
