// @ts-nocheck
import { createBackgroundService } from "./agent-service.js";
import { initializeBackground } from "./background-init.js";

const chromeApi = globalThis.chrome;
initializeBackground({
  chromeApi,
  baseConfig: globalThis.__BCO_BACKGROUND_CONFIG__ ?? {},
  createService: createBackgroundService
});

chromeApi?.action?.onClicked?.addListener?.(() => {
  chromeApi?.runtime?.openOptionsPage?.();
});
