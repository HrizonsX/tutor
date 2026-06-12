import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("manifest loads the ESM content script through a classic loader", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
  const loaderSource = await readFile(new URL("../src/extension/content-loader.js", import.meta.url), "utf8");

  assert.deepEqual(manifest.content_scripts[0].js, ["src/extension/content-loader.js"]);
  assert.match(loaderSource, /chrome\.runtime\.getURL\("src\/extension\/content\.js"\)/);
  assert.match(loaderSource, /import\(contentUrl\)/);
  assert.match(loaderSource, /Failed to start Browser Cognitive Overlay/);
  assert.match(loaderSource, /bcoLoaderState/);
  assert.match(loaderSource, /loaded_via_page_module/);
});

test("manifest exposes only extension and shared modules to dynamic content imports", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));

  assert.ok(
    manifest.web_accessible_resources.some((entry) =>
      entry.resources.includes("src/extension/*.js") &&
      entry.resources.includes("src/shared/*.js") &&
      entry.matches.includes("<all_urls>")
    )
  );
  assert.equal(
    manifest.web_accessible_resources.some((entry) => entry.resources.includes("src/*.js")),
    false,
    "gateway modules (prompt templates, schema) must not be web-accessible"
  );
});

test("manifest registers a module background service worker", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
  const backgroundSource = await readFile(new URL("../src/extension/background.js", import.meta.url), "utf8");

  assert.equal(manifest.background.service_worker, "src/extension/background.js");
  assert.equal(manifest.background.type, "module");
  assert.equal(manifest.options_ui.page, "src/extension/options.html");
  assert.equal(manifest.options_ui.open_in_tab, true);
  assert.ok(manifest.permissions.includes("storage"));
  assert.ok(manifest.host_permissions.includes("http://127.0.0.1/*"));
  assert.ok(manifest.host_permissions.includes("http://localhost/*"));
  assert.equal(manifest.host_permissions.some((host) => /deepseek|openai/i.test(host)), false);
  assert.match(backgroundSource, /openOptionsPage/);
});

test("options dashboard loads module script and Figma-matched stylesheet", async () => {
  const optionsHtml = await readFile(new URL("../src/extension/options.html", import.meta.url), "utf8");
  const optionsCss = await readFile(new URL("../src/extension/options.css", import.meta.url), "utf8");

  assert.match(optionsHtml, /诊断视图/);
  assert.match(optionsHtml, /src="\.\/options\.js"/);
  assert.match(optionsHtml, /href="\.\/options\.css"/);
  assert.match(optionsCss, /width:\s*1200px/);
  assert.match(optionsCss, /min-height:\s*1303px/);
});

test("content script does not call external services directly", async () => {
  const contentSource = await readFile(new URL("../src/extension/content.js", import.meta.url), "utf8");
  const backgroundSource = await readFile(new URL("../src/extension/background.js", import.meta.url), "utf8");

  assert.doesNotMatch(contentSource, /\bfetch\s*\(/);
  assert.doesNotMatch(contentSource, /apiKey|authorization/i);
  assert.doesNotMatch(contentSource, /localGatewayEndpoint|pairingToken/i);
  assert.match(contentSource, /createBackgroundAgentClient/);
  assert.match(backgroundSource, /createBackgroundService/);
});
