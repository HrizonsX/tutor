// @ts-nocheck
(async () => {
  const root = document.documentElement;
  root.dataset.bcoLoaderState = "loading";
  const contentUrl = chrome.runtime.getURL("src/extension/content.js");

  try {
    await import(contentUrl);
    root.dataset.bcoLoaderState = "loaded";
  } catch (error) {
    // Honest terminal failure. We deliberately do NOT fall back to injecting a
    // page-world <script type="module">: that runs in the page main world, where
    // the extension's chrome.runtime/chrome.storage are unavailable, so
    // content.js could not reach the background service or the gateway and would
    // fail silently while still looking "loaded". Failing loudly is the honest
    // state and surfaces real module-evaluation errors (e.g. a TDZ crash).
    root.dataset.bcoLoaderState = "module_import_failed";
    root.dataset.bcoLoaderError = error?.message ?? String(error);
    console.error("[BCO] Failed to start Browser Cognitive Overlay", error);
  }
})();
