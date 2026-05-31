import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const LOQUAT = "\u6787\u6777";
const CHANGTAI = "\u5e38\u592a";

test("pre-recall browser smoke persists discovered relation edges", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "bco-pre-recall-smoke-"));
  const port = 19000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, ["scripts/pre-recall-browser-smoke-server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      BCO_PRE_RECALL_SMOKE_PORT: String(port),
      BCO_PRE_RECALL_SMOKE_MEMORY_DIR: directory,
      BCO_PRE_RECALL_SMOKE_NOW: String(Date.parse("2026-05-28T12:00:00.000Z"))
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  t.after(async () => {
    if (!child.killed) child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
    rmSync(directory, { recursive: true, force: true });
  });

  await waitForServer(port, () => `${stdout}\n${stderr}`);
  const response = await fetch(`http://127.0.0.1:${port}/explain`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      target: { canonicalName: CHANGTAI, observedText: CHANGTAI },
      minimalContext: { fragmentId: "test-smoke", text: CHANGTAI },
      constraints: { forceRefresh: true }
    })
  });
  const result = await response.json();
  const state = await fetch(`http://127.0.0.1:${port}/__smoke-state`).then((entry) => entry.json());
  const databasePath = join(directory, "local-memory.sqlite");

  assert.equal(result.status, "available");
  assert.match(result.text, new RegExp(LOQUAT));
  assert.ok(state.providerBridgeNames.includes(LOQUAT));
  assert.ok(existsSync(databasePath));

  const db = new DatabaseSync(databasePath);
  try {
    const rows = db.prepare(`
      SELECT source_canonical_name, relation_type, target_canonical_name, status
      FROM relation_proposals
      ORDER BY timestamp DESC
    `).all();
    assert.deepEqual(rows.map((row) => ({
      source: row.source_canonical_name,
      type: row.relation_type,
      target: row.target_canonical_name,
      status: row.status
    })), [{
      source: CHANGTAI,
      type: "related_to",
      target: LOQUAT,
      status: "active"
    }]);
  } finally {
    db.close();
  }
});

async function waitForServer(port, logs) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/__smoke-state`);
      if (response.ok) return;
    } catch {
      // Keep polling until the child process binds the port.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`pre-recall smoke server did not start:\n${logs()}`);
}
