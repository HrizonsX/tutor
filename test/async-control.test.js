import test from "node:test";
import assert from "node:assert/strict";
import {
  TimeoutError,
  isTimeoutError,
  linkAbortSignals,
  withAbortTimeout,
  withTimeout
} from "../src/async-control.js";
import { createGatewayProviderRuntime } from "../src/local-gateway.js";
import { createBackgroundAgentClient } from "../src/agent-service.js";
import { createLocalGatewayClient } from "../src/provider-registry.js";
import { AgentResultStatus, ProviderAdapter, ProviderKind } from "../src/contracts.js";

test("withAbortTimeout aborts the work signal before rejecting on timeout", async () => {
  let observedSignal = null;
  await assert.rejects(
    withAbortTimeout((signal) => {
      observedSignal = signal;
      return new Promise(() => {});
    }, { timeoutMs: 10, reason: "agent_timeout" }),
    (error) => isTimeoutError(error, "agent_timeout")
  );
  assert.equal(observedSignal.aborted, true);
});

test("withAbortTimeout resolves normally and propagates parent aborts", async () => {
  const value = await withAbortTimeout(async () => "done", { timeoutMs: 1000, reason: "agent_timeout" });
  assert.equal(value, "done");

  const parent = new AbortController();
  let observedSignal = null;
  const pending = withAbortTimeout((signal) => {
    observedSignal = signal;
    return new Promise((resolve) => {
      if (signal.aborted) return resolve("aborted");
      signal.addEventListener("abort", () => resolve("aborted"), { once: true });
    });
  }, { timeoutMs: 1000, reason: "agent_timeout", parentSignal: parent.signal });
  parent.abort();
  assert.equal(await pending, "aborted");
  assert.equal(observedSignal.aborted, true);
});

test("timeout errors keep message === reason for legacy checks", async () => {
  const error = new TimeoutError("agent_timeout");
  assert.equal(error.message, "agent_timeout");
  assert.equal(isTimeoutError(error, "agent_timeout"), true);
  assert.equal(isTimeoutError(error, "other_reason"), false);
  assert.equal(isTimeoutError(new Error("agent_timeout"), "agent_timeout"), true);
  await assert.rejects(withTimeout(new Promise(() => {}), 5, "legacy_timeout"), /legacy_timeout/);
});

test("linkAbortSignals aborts when any input aborts", () => {
  const a = new AbortController();
  const b = new AbortController();
  const linked = linkAbortSignals(a.signal, null, b.signal);
  assert.equal(linked.aborted, false);
  b.abort();
  assert.equal(linked.aborted, true);

  const preAborted = new AbortController();
  preAborted.abort();
  assert.equal(linkAbortSignals(preAborted.signal, new AbortController().signal).aborted, true);
});

test("provider runtime timeout aborts the underlying fetch signal", async () => {
  let fetchSignal = null;
  const runtime = createGatewayProviderRuntime({
    providerConfig: {
      embedding: {
        enabled: true,
        provider: ProviderKind.CLOUD,
        adapter: ProviderAdapter.OPENAI_COMPATIBLE,
        endpoint: "https://embed.example/v1",
        embeddingPath: "/embeddings",
        token: "embed-token",
        modelName: "embed-model",
        timeoutMs: 15
      }
    },
    fetchImpl: (url, options) => {
      fetchSignal = options.signal ?? null;
      return new Promise(() => {});
    }
  });

  const result = await runtime.createEmbedding({ text: "summary" });

  assert.equal(result.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(result.reason, "embedding_timeout");
  assert.ok(fetchSignal, "fetch should receive an abort signal");
  assert.equal(fetchSignal.aborted, true);
});

test("agent client stream watchdog settles a silent stream with runtime_stream_timeout", async () => {
  const posted = [];
  let disconnected = false;
  const runtime = {
    connect: () => ({
      postMessage: (message) => posted.push(message),
      disconnect: () => { disconnected = true; },
      onMessage: { addListener: () => {} },
      onDisconnect: { addListener: () => {} }
    })
  };
  const client = createBackgroundAgentClient(runtime, { streamIdleTimeoutMs: 10 });

  const result = await client.streamExplanation({ target: { canonicalName: "KL divergence" } }, { onEvent: () => {} });

  assert.equal(result.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(result.reason, "runtime_stream_timeout");
  assert.equal(posted.some((message) => message?.type === "cancel"), true);
  assert.equal(disconnected, true);
});

test("gateway stream client reports protocol error when every NDJSON line is garbage", async () => {
  const client = createLocalGatewayClient({
    endpoint: "http://127.0.0.1:17321",
    pairingToken: "secret",
    chromeApi: {},
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      body: (async function* () {
        yield "this is not json\n";
        yield "still not json\n";
      })()
    })
  });

  const result = await client.streamExplanation({ target: { canonicalName: "KL divergence" } }, { onEvent: () => {} });

  assert.equal(result.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(result.reason, "local_gateway_stream_protocol_error");
});

test("gateway stream client tolerates one corrupt line among valid events", async () => {
  const events = [];
  const client = createLocalGatewayClient({
    endpoint: "http://127.0.0.1:17321",
    pairingToken: "secret",
    chromeApi: {},
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      body: (async function* () {
        yield `${JSON.stringify({ type: "session_start", sequence: 0 })}\n`;
        yield "corrupt{line\n";
        yield `${JSON.stringify({ type: "session_done", sequence: 1 })}\n`;
      })()
    })
  });

  const result = await client.streamExplanation({ target: { canonicalName: "KL divergence" } }, {
    onEvent: (event) => events.push(event)
  });

  assert.equal(result.status, AgentResultStatus.AVAILABLE);
  assert.equal(result.eventCount, 2);
  assert.deepEqual(events.map((event) => event.type), ["session_start", "session_done"]);
});
