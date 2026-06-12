// @ts-nocheck
import { BROWSER_CONFIG_STORAGE_KEY, DEFAULT_CONFIG, mergeConfig } from "./config.js";

// MV3 service workers are evicted and restarted at any time; a restarted
// worker must rehydrate the persisted browser config before answering
// messages, follow live config changes, and flush pending memory events on
// suspend. This module owns that lifecycle wiring so background.js stays a
// thin entry point and the behavior is testable with a fake chrome API.
export function initializeBackground({
  chromeApi = globalThis.chrome,
  baseConfig = {},
  createService
} = {}) {
  const runtimeConfig = mergeConfig(DEFAULT_CONFIG, baseConfig ?? {});

  let resolveHydration;
  const configHydration = new Promise((resolve) => {
    resolveHydration = resolve;
  });
  const finishHydration = () => {
    resolveHydration?.();
    resolveHydration = null;
  };

  const service = createService({
    config: runtimeConfig,
    chromeApi,
    configHydration
  });

  const storage = chromeApi?.storage;
  if (storage?.local?.get) {
    try {
      storage.local.get([BROWSER_CONFIG_STORAGE_KEY], (result) => {
        const stored = result?.[BROWSER_CONFIG_STORAGE_KEY];
        if (stored && typeof stored === "object") {
          Promise.resolve(service.updateBrowserConfig(stored)).then(finishHydration, finishHydration);
        } else {
          finishHydration();
        }
      });
    } catch {
      finishHydration();
    }
  } else {
    finishHydration();
  }

  storage?.onChanged?.addListener?.((changes, areaName) => {
    if (areaName !== "local") return;
    const nextConfig = changes?.[BROWSER_CONFIG_STORAGE_KEY]?.newValue;
    if (!nextConfig || typeof nextConfig !== "object") return;
    void service.updateBrowserConfig(nextConfig);
  });

  // onSuspend cannot await asynchronous work, so this flush is fire-and-forget:
  // it improves durability of the pending event batch but cannot guarantee it.
  chromeApi?.runtime?.onSuspend?.addListener?.(() => {
    void service.flushMemoryEvents?.();
  });

  chromeApi?.runtime?.onMessage?.addListener?.((message, sender, sendResponse) => {
    service.handleMessage(message, sender)
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({
        status: "unavailable",
        reason: "background_handler_failed",
        details: { message: error?.message ?? String(error) }
      }));
    return true;
  });

  chromeApi?.runtime?.onConnect?.addListener?.((port) => {
    service.handleStreamPort(port);
  });

  return { service, configHydration };
}
