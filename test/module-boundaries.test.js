// Static dependency-direction tests for the gateway boundary split: the thin
// HTTP layer may only reach implementation code through the runtime modules,
// and the runtime modules may not depend back on the layers above them.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function moduleImports(relPath) {
  const source = readFileSync(new URL(`../${relPath}`, import.meta.url), "utf8");
  const specifiers = [];
  for (const match of source.matchAll(/(?:\bimport\b|\bexport\b)[^"';]*?\bfrom\s+"([^"]+)"/g)) {
    specifiers.push(match[1]);
  }
  for (const match of source.matchAll(/\bimport\(\s*"([^"]+)"\s*\)/g)) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

test("gateway HTTP layer does not import implementation modules directly", () => {
  const imports = moduleImports("src/local-gateway.js");
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
  const imports = moduleImports("src/memory-runtime.js");
  for (const forbidden of ["./provider-runtime.js", "./local-agent-runtime.js", "./local-gateway.js"]) {
    assert.ok(!imports.includes(forbidden), `memory-runtime.js must not import ${forbidden}`);
  }
});

test("provider runtime does not reach into memory or HTTP layers", () => {
  const imports = moduleImports("src/provider-runtime.js");
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
  const imports = moduleImports("src/local-agent-runtime.js");
  assert.ok(!imports.includes("./local-gateway.js"), "local-agent-runtime.js must not import local-gateway.js");
  assert.ok(imports.includes("./memory-runtime.js"), "local-agent-runtime.js composes the memory runtime");
  assert.ok(imports.includes("./runtime-explain-pipeline.js"), "local-agent-runtime.js owns pipeline construction");
});
