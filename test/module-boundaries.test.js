// Static dependency-direction tests for the two trust domains and the
// gateway boundary split. Rules: extension and gateway modules may only
// import shared (and their own layer); shared imports only shared; the thin
// HTTP layer may only reach implementation code through the runtime modules.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const LAYERS = ["shared", "extension", "gateway"];
const ALLOWED_IMPORT_LAYERS = {
  shared: ["shared"],
  extension: ["extension", "shared"],
  gateway: ["gateway", "shared"]
};

function relativeSpecifiers(source) {
  const specifiers = [];
  for (const match of source.matchAll(/(?:\bimport\b|\bexport\b)[^"';]*?\bfrom\s+"([^"]+)"/g)) {
    specifiers.push(match[1]);
  }
  for (const match of source.matchAll(/\bimport\(\s*"([^"]+)"\s*\)/g)) {
    specifiers.push(match[1]);
  }
  return specifiers.filter((specifier) => specifier.startsWith("."));
}

function layerFiles(layer) {
  const dir = fileURLToPath(new URL(`../src/${layer}`, import.meta.url));
  return readdirSync(dir)
    .filter((file) => file.endsWith(".js"))
    .map((file) => ({ file, source: readFileSync(`${dir}/${file}`, "utf8") }));
}

test("extension and gateway import only shared across layer boundaries", () => {
  for (const layer of LAYERS) {
    const allowed = ALLOWED_IMPORT_LAYERS[layer];
    for (const { file, source } of layerFiles(layer)) {
      for (const specifier of relativeSpecifiers(source)) {
        let targetLayer;
        if (specifier.startsWith("./")) {
          targetLayer = layer;
        } else {
          const match = /^\.\.\/(shared|extension|gateway)\//.exec(specifier);
          assert.ok(match, `src/${layer}/${file} has unresolvable relative import ${specifier}`);
          targetLayer = match[1];
        }
        assert.ok(
          allowed.includes(targetLayer),
          `src/${layer}/${file} must not import ${specifier} (${layer} -> ${targetLayer} is forbidden)`
        );
      }
    }
  }
});

function moduleImports(relPath) {
  const source = readFileSync(new URL(`../${relPath}`, import.meta.url), "utf8");
  return relativeSpecifiers(source);
}

test("gateway HTTP layer does not import implementation modules directly", () => {
  const imports = moduleImports("src/gateway/local-gateway.js");
  for (const forbidden of [
    "./local-memory-store.js",
    "./provider-adapters.js",
    "./runtime-explain-pipeline.js",
    "./memory-repository-factory.js"
  ]) {
    assert.ok(!imports.includes(forbidden), `local-gateway.js must not import ${forbidden} (got: ${imports.join(", ")})`);
  }
});

test("memory runtime stays a leaf below provider and agent runtime layers", () => {
  const imports = moduleImports("src/gateway/memory-runtime.js");
  for (const forbidden of ["./provider-runtime.js", "./local-agent-runtime.js", "./local-gateway.js"]) {
    assert.ok(!imports.includes(forbidden), `memory-runtime.js must not import ${forbidden}`);
  }
});

test("provider runtime does not reach into memory or HTTP layers", () => {
  const imports = moduleImports("src/gateway/provider-runtime.js");
  for (const forbidden of [
    "./memory-runtime.js",
    "./local-agent-runtime.js",
    "./local-gateway.js",
    "./local-memory-store.js",
    "./memory-repository-factory.js"
  ]) {
    assert.ok(!imports.includes(forbidden), `provider-runtime.js must not import ${forbidden}`);
  }
});

test("local agent runtime composes runtimes without importing the HTTP layer", () => {
  const imports = moduleImports("src/gateway/local-agent-runtime.js");
  assert.ok(!imports.includes("./local-gateway.js"), "local-agent-runtime.js must not import local-gateway.js");
  assert.ok(imports.includes("./memory-runtime.js"), "local-agent-runtime.js composes the memory runtime");
  assert.ok(imports.includes("./runtime-explain-pipeline.js"), "local-agent-runtime.js owns pipeline construction");
});

test("web accessible resources expose only extension and shared modules", async () => {
  const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
  const resources = manifest.web_accessible_resources.flatMap((entry) => entry.resources);
  assert.deepEqual(resources.sort(), ["src/extension/*.js", "src/shared/*.js"]);
  assert.ok(!resources.includes("src/*.js"), "gateway modules must not be web-accessible");
});
