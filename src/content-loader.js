// @ts-nocheck
(async () => {
  const root = document.documentElement;
  root.dataset.bcoLoaderState = "loading";
  const contentUrl = chrome.runtime.getURL("src/content.js");

  try {
    await import(contentUrl);
    root.dataset.bcoLoaderState = "loaded";
  } catch (error) {
    root.dataset.bcoLoaderState = "module_import_failed";
    root.dataset.bcoLoaderError = error?.message ?? String(error);
    console.error("[BCO] Failed to start Browser Cognitive Overlay", error);
    injectPageModule(contentUrl, root);
  }
})();

function injectPageModule(src, root) {
  const script = document.createElement("script");
  script.type = "module";
  script.src = src;
  script.onload = () => {
    root.dataset.bcoLoaderState = "loaded_via_page_module";
    script.remove();
  };
  script.onerror = () => {
    root.dataset.bcoLoaderState = "failed";
    root.dataset.bcoLoaderError = "Could not load content module";
    script.remove();
  };
  (document.head || document.documentElement).append(script);
}
