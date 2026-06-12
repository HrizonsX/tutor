import test from "node:test";
import assert from "node:assert/strict";
import { initializeBackground } from "../src/extension/background-init.js";
import { createBackgroundService } from "../src/extension/agent-service.js";
import { BROWSER_CONFIG_STORAGE_KEY } from "../src/shared/config.js";
import { AgentResultStatus, BackgroundMessageType } from "../src/shared/contracts.js";

function fakeChromeApi({
  storedBrowserConfig = null,
  deferStorageRead = false
} = {}) {
  const state = {
    storageReads: [],
    storageChangeListeners: [],
    suspendListeners: [],
    messageListeners: [],
    connectListeners: [],
    pendingStorageCallbacks: []
  };
  return {
    state,
    api: {
      storage: {
        local: {
          get: (keys, callback) => {
            state.storageReads.push(keys);
            const respond = () => callback(
              storedBrowserConfig ? { [BROWSER_CONFIG_STORAGE_KEY]: storedBrowserConfig } : {}
            );
            if (deferStorageRead) {
              state.pendingStorageCallbacks.push(respond);
            } else {
              respond();
            }
          }
        },
        onChanged: {
          addListener: (listener) => state.storageChangeListeners.push(listener)
        }
      },
      runtime: {
        onSuspend: {
          addListener: (listener) => state.suspendListeners.push(listener)
        },
        onMessage: {
          addListener: (listener) => state.messageListeners.push(listener)
        },
        onConnect: {
          addListener: (listener) => state.connectListeners.push(listener)
        }
      }
    }
  };
}

test("background init hydrates persisted browser config before answering messages", async () => {
  const { api, state } = fakeChromeApi({
    storedBrowserConfig: { localGateway: { endpoint: "http://127.0.0.1:19999", pairingToken: "stored-token" } },
    deferStorageRead: true
  });
  const { service } = initializeBackground({
    chromeApi: api,
    baseConfig: {},
    createService: createBackgroundService
  });

  // Message dispatched before hydration completes must still observe the
  // stored endpoint once it resolves.
  const pendingEcho = service.handleMessage({
    type: BackgroundMessageType.UPDATE_BROWSER_CONFIG,
    payload: {}
  });
  let settled = false;
  void pendingEcho.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false, "message must wait for hydration");

  for (const respond of state.pendingStorageCallbacks.splice(0)) respond();
  const echo = await pendingEcho;

  assert.equal(echo.status, AgentResultStatus.AVAILABLE);
  assert.equal(echo.config.localGateway.endpoint, "http://127.0.0.1:19999");
  assert.equal(echo.config.localGateway.pairingTokenPresent, true);
  assert.deepEqual(state.storageReads, [[BROWSER_CONFIG_STORAGE_KEY]]);
});

test("background init follows storage change events with live config updates", async () => {
  const { api, state } = fakeChromeApi();
  const { service, configHydration } = initializeBackground({
    chromeApi: api,
    baseConfig: {},
    createService: createBackgroundService
  });
  await configHydration;

  assert.equal(state.storageChangeListeners.length, 1);
  for (const listener of state.storageChangeListeners) {
    listener({
      [BROWSER_CONFIG_STORAGE_KEY]: {
        newValue: { localGateway: { endpoint: "http://127.0.0.1:18888" } }
      }
    }, "local");
    // Non-local areas and unrelated keys are ignored.
    listener({
      [BROWSER_CONFIG_STORAGE_KEY]: {
        newValue: { localGateway: { endpoint: "http://127.0.0.1:17777" } }
      }
    }, "sync");
  }
  await Promise.resolve();

  const echo = await service.handleMessage({
    type: BackgroundMessageType.UPDATE_BROWSER_CONFIG,
    payload: {}
  });
  assert.equal(echo.config.localGateway.endpoint, "http://127.0.0.1:18888");
});

test("background init flushes pending memory event batch on suspend", async () => {
  const written = [];
  const { api, state } = fakeChromeApi();
  const { service, configHydration } = initializeBackground({
    chromeApi: api,
    baseConfig: {},
    createService: (options) => createBackgroundService({
      ...options,
      memoryEventBatchDelayMs: 60 * 60 * 1000,
      providerRegistry: {
        mode: "local",
        usesLocalGateway: () => true,
        getMode: () => "local",
        getDiagnosticsState: () => ({}),
        resolveProvider: () => ({}),
        invalidateHealthCache: () => {},
        getLocalGatewayClient: () => ({
          writeMemoryEvent: async (payload) => {
            written.push(payload);
            return { status: AgentResultStatus.AVAILABLE };
          }
        })
      }
    })
  });
  await configHydration;

  const pendingWrite = service.writeMemoryEvent({
    event: { id: "evt_suspend", type: "knowledge_encountered", canonicalName: "KL divergence", timestamp: 1000 }
  });
  assert.equal(written.length, 0, "event should still be batched");

  assert.equal(state.suspendListeners.length, 1);
  for (const listener of state.suspendListeners) listener();
  const result = await pendingWrite;

  assert.equal(result.status, AgentResultStatus.AVAILABLE);
  assert.equal(written.length, 1);
  assert.equal(written[0].event.id, "evt_suspend");
});

test("background service retries a failed memory batch once without touching settled promises", async () => {
  const attempts = [];
  let failNext = true;
  const service = createBackgroundService({
    memoryEventBatchDelayMs: 0,
    memoryEventRetryDelayMs: 0,
    providerRegistry: {
      mode: "local",
      usesLocalGateway: () => true,
      getMode: () => "local",
      getDiagnosticsState: () => ({}),
      resolveProvider: () => ({}),
      invalidateHealthCache: () => {},
      getLocalGatewayClient: () => ({
        writeMemoryEvent: async (payload) => {
          attempts.push(payload);
          if (failNext) {
            failNext = false;
            throw new Error("gateway down");
          }
          return { status: AgentResultStatus.AVAILABLE };
        }
      })
    }
  });

  const result = await service.writeMemoryEvent({
    event: { id: "evt_retry", type: "knowledge_encountered", canonicalName: "KV cache", timestamp: 2000 }
  });
  assert.equal(result.status, AgentResultStatus.UNAVAILABLE);

  // Allow the zero-delay retry timer and flush to run.
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(attempts.length, 2);
  assert.equal(attempts[1].event.id, "evt_retry");
});
