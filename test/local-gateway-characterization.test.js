// Characterization net for the gateway HTTP protocol. These tests pin the
// behavior of the EXISTING handler before the P8 boundary split moves code
// into provider/memory/local-agent runtime modules: any refactor must keep
// every assertion here green without edits.
import test from "node:test";
import assert from "node:assert/strict";
import {
  AgentCapability,
  AgentProtocolVersion,
  AgentResultStatus,
  ProviderKind
} from "../src/shared/contracts.js";
import { createLocalGatewayHandler, createLocalMemoryStore } from "../src/gateway/local-gateway.js";

const AUTHED_JSON_HEADERS = { "x-bco-pairing-token": "secret", "content-type": "application/json" };

function createHandler(overrides = {}) {
  return createLocalGatewayHandler({
    token: "secret",
    store: createLocalMemoryStore({ now: () => 1000, autoProcessBacklog: false }),
    now: () => 1000,
    ...overrides
  });
}

test("unknown paths answer 404 provider_capability_unsupported", async () => {
  const handler = createHandler();
  const response = await handler({
    method: "POST",
    url: "http://127.0.0.1:17321/definitely-not-a-route",
    headers: AUTHED_JSON_HEADERS,
    body: JSON.stringify({})
  });
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(body.reason, "provider_capability_unsupported");
});

test("POST-only routes reject GET with 405 method_not_allowed", async () => {
  const handler = createHandler();
  for (const path of ["/explain", "/explain/stream-session", "/rewrite", "/embedding", "/memory/events", "/memory/query"]) {
    const response = await handler({
      method: "GET",
      url: `http://127.0.0.1:17321${path}`,
      headers: { "x-bco-pairing-token": "secret" }
    });
    const body = await response.json();

    assert.equal(response.status, 405, `${path} should be POST-only`);
    assert.equal(body.status, AgentResultStatus.UNAVAILABLE);
    assert.equal(body.reason, "method_not_allowed");
  }
});

test("authorization is checked before routing and request guards", async () => {
  const handler = createHandler();
  const unknownPath = await handler({
    method: "POST",
    url: "http://127.0.0.1:17321/definitely-not-a-route",
    headers: { "x-bco-pairing-token": "wrong", "content-type": "application/json" },
    body: JSON.stringify({})
  });
  const evilOrigin = await handler({
    method: "POST",
    url: "http://127.0.0.1:17321/config",
    headers: { "x-bco-pairing-token": "wrong", "content-type": "application/json", origin: "https://evil.example" },
    body: JSON.stringify({})
  });

  assert.equal(unknownPath.status, 401);
  assert.equal((await unknownPath.json()).reason, "local_gateway_pairing_rejected");
  assert.equal(evilOrigin.status, 401, "401 pairing rejection wins over 403 origin rejection");
  assert.equal((await evilOrigin.json()).reason, "local_gateway_pairing_rejected");
});

test("malformed JSON on /explain degrades to an invalid-input decision instead of crashing", async () => {
  const handler = createHandler();
  const response = await handler({
    method: "POST",
    url: "http://127.0.0.1:17321/explain",
    headers: AUTHED_JSON_HEADERS,
    body: "{not valid json"
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, AgentResultStatus.INVALID);
  assert.equal(body.reason, "reject_invalid_input");
  assert.equal(body.runtimeDecision.kind, "reject_invalid_input");
  assert.equal(body.runtimeDecision.providerCallStatus, "skipped");
});

test("health response shape stays stable without a provider runtime", async () => {
  const handler = createHandler();
  const response = await handler({
    method: "GET",
    url: "http://127.0.0.1:17321/health",
    headers: { "x-bco-pairing-token": "secret" }
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, AgentResultStatus.AVAILABLE);
  assert.equal(body.mode, ProviderKind.LOCAL);
  assert.equal(body.protocolVersion, AgentProtocolVersion);
  assert.equal(body.checkedAt, 1000);
  assert.deepEqual(body.capabilities, {
    [AgentCapability.HEALTH]: true,
    [AgentCapability.EXPLAIN]: false,
    [AgentCapability.STREAMING_EXPLANATION]: false,
    [AgentCapability.REWRITE]: false,
    [AgentCapability.EMBEDDING]: false,
    [AgentCapability.RELATION_PROPOSAL]: false,
    [AgentCapability.MEMORY_EVENT_WRITE]: true,
    [AgentCapability.MEMORY_QUERY]: true,
    [AgentCapability.SOURCE_AWARE_EXPLANATION]: false
  });
  assert.deepEqual(body.providerRoles, {});
  assert.equal(body.runtimeConfig, null);
  assert.ok(body.memoryRepository);
  assert.equal(typeof body.memoryRepository.mode, "string");
});

test("trailing slashes are normalized away from route paths", async () => {
  const handler = createHandler();
  const response = await handler({
    method: "GET",
    url: "http://127.0.0.1:17321/health///",
    headers: { "x-bco-pairing-token": "secret" }
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, AgentResultStatus.AVAILABLE);
});

test("/config without runtime config state answers 503 runtime_config_unavailable", async () => {
  const handler = createHandler();
  const read = await handler({
    method: "GET",
    url: "http://127.0.0.1:17321/config",
    headers: { "x-bco-pairing-token": "secret" }
  });
  const update = await handler({
    method: "POST",
    url: "http://127.0.0.1:17321/config",
    headers: AUTHED_JSON_HEADERS,
    body: JSON.stringify({ config: { explain: { enabled: true } } })
  });

  assert.equal(read.status, 503);
  assert.equal((await read.json()).reason, "runtime_config_unavailable");
  assert.equal(update.status, 503);
  assert.equal((await update.json()).reason, "runtime_config_unavailable");
});

test("/embedding without any provider reports capability unsupported in a 200 envelope", async () => {
  const handler = createHandler();
  const response = await handler({
    method: "POST",
    url: "http://127.0.0.1:17321/embedding",
    headers: AUTHED_JSON_HEADERS,
    body: JSON.stringify({ text: "KL divergence" })
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(body.reason, "provider_capability_unsupported");
  assert.equal(body.capabilityKind, AgentCapability.EMBEDDING);
});

test("memory write envelope keeps its repository metadata shape", async () => {
  const handler = createHandler();
  const response = await handler({
    method: "POST",
    url: "http://127.0.0.1:17321/memory/events",
    headers: AUTHED_JSON_HEADERS,
    body: JSON.stringify({
      repository: "learning",
      event: { type: "knowledge_encountered", canonicalName: "KL divergence", timestamp: 1000 }
    })
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, AgentResultStatus.AVAILABLE);
  assert.equal(body.capabilityKind, AgentCapability.MEMORY_EVENT_WRITE);
  assert.equal(body.shared, true);
  assert.equal(body.repositoryStatus, "local_gateway");
  assert.equal(body.eventCount, 1);
  assert.equal(body.event.canonicalName, "KL divergence");
  assert.deepEqual(body.events, [body.event]);
  assert.ok(body.memoryRepository);
});
