import { DEFAULT_CONFIG, mergeConfig } from "./config.js";
import { createBackgroundService } from "./agent-service.js";

const chromeApi = globalThis.chrome;
const runtimeConfig = mergeConfig(DEFAULT_CONFIG, globalThis.__BCO_BACKGROUND_CONFIG__ ?? {});
const service = createBackgroundService({ config: runtimeConfig, chromeApi });

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

chromeApi?.action?.onClicked?.addListener?.(() => {
  chromeApi?.runtime?.openOptionsPage?.();
});
