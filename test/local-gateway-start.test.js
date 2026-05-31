import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("package exposes local gateway startup scripts", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

  assert.equal(pkg.scripts["gateway:dev"], "node scripts/local-gateway-dev.js");
  assert.equal(pkg.scripts["gateway:stub"], "node scripts/local-gateway-dev.js --stub-explain");
});

test("local gateway startup script only wraps existing gateway module", async () => {
  const source = await readFile(new URL("../scripts/local-gateway-dev.js", import.meta.url), "utf8");

  assert.match(source, /startLocalGatewayServer/);
  assert.match(source, /createLocalGatewayHandler/);
  assert.match(source, /--stub-explain/);
  assert.doesNotMatch(source, /from "\.\.\/src\/agent-service\.js"/);
});
