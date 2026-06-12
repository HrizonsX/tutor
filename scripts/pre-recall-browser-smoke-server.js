#!/usr/bin/env node
import { createServer } from "node:http";
import { resolve } from "node:path";
import {
  createLocalGatewayHandler,
  createPersistentLocalMemoryStore
} from "../src/gateway/local-gateway.js";
import {
  AgentCapability,
  AgentResultStatus,
  MemoryEventType
} from "../src/shared/contracts.js";
import {
  ConceptRelationType,
  RelationBasis
} from "../src/gateway/cognitive-memory.js";

const RELATED_MEMORY = process.env.BCO_PRE_RECALL_SMOKE_MEMORY ?? "\u6787\u6777";
const TARGET_CONCEPT = process.env.BCO_PRE_RECALL_SMOKE_TARGET ?? "\u5e38\u592a";
const smokeKey = Buffer.from(`${TARGET_CONCEPT}:${RELATED_MEMORY}`).toString("hex").slice(0, 16);
const sourceEventId = `evt_browser_related_${smokeKey}`;

const host = "127.0.0.1";
const port = Number(process.env.BCO_PRE_RECALL_SMOKE_PORT ?? 17931);
const memoryDirectory = resolve(
  process.env.BCO_PRE_RECALL_SMOKE_MEMORY_DIR ??
  process.env.BCO_GATEWAY_MEMORY_DIR ??
  ".bco-memory"
);
const configuredNow = Number(process.env.BCO_PRE_RECALL_SMOKE_NOW ?? "");
const currentTime = Number.isFinite(configuredNow) && configuredNow > 0 ? configuredNow : Date.now();
const smokeDate = new Date(currentTime).toISOString().slice(0, 10);
const providerInputs = [];
const relationInputs = [];
const store = createPersistentLocalMemoryStore({
  directory: memoryDirectory,
  now: () => currentTime,
  autoProcessBacklog: false
});

store.writeEvent({
  event: {
    id: sourceEventId,
    type: MemoryEventType.KNOWLEDGE_ENCOUNTERED,
    canonicalName: RELATED_MEMORY,
    observedAlias: RELATED_MEMORY,
    timestamp: currentTime - 60_000
  }
});
store.processBacklog();

const runtime = {
  capabilities: {
    [AgentCapability.EXPLAIN]: true,
    [AgentCapability.REWRITE]: true,
    [AgentCapability.RELATION_PROPOSAL]: true,
    [AgentCapability.EMBEDDING]: false
  },
  providerRoles: {
    explain: { enabled: true, mode: "local-smoke" },
    relationProposer: { enabled: true, mode: "local-smoke" }
  },
  async proposeRelations(input) {
    relationInputs.push(input);
    return {
      status: AgentResultStatus.AVAILABLE,
      relationCandidates: [{
        sourceCanonicalName: TARGET_CONCEPT,
        relationType: ConceptRelationType.RELATED_TO,
        targetCanonicalName: RELATED_MEMORY,
        sourceDate: smokeDate,
        confidence: "high",
        basis: RelationBasis.PROVIDER_STRUCTURED_RELATION,
        usableForOverlay: true,
        sourceEventIds: [sourceEventId]
      }],
      rejectedCandidates: []
    };
  },
  async explain(request) {
    providerInputs.push(request);
    const bridgeNames = (request.memoryBridges ?? []).map((bridge) => bridge.relatedConcept);
    const text = bridgeNames.includes(RELATED_MEMORY)
      ? `${TARGET_CONCEPT}\u53ef\u4ee5\u7ed3\u5408\u4f60\u4e4b\u524d\u67e5\u8fc7\u7684${RELATED_MEMORY}\u6765\u7406\u89e3\uff1a\u8fd9\u91cc\u91cd\u70b9\u8bf4\u660e${TARGET_CONCEPT}\u4e0e${RELATED_MEMORY}\u8bb0\u5fc6\u6709\u5173\u3002`
      : `${TARGET_CONCEPT}\u89e3\u91ca\u7f3a\u5c11\u5173\u8054\u8bb0\u5fc6\u3002`;
    return {
      status: AgentResultStatus.AVAILABLE,
      capabilityKind: request.capabilityKind,
      target: request.target,
      text,
      microExplanation: text,
      explanation: text,
      versionMetadata: {
        id: "ver_browser_changtai",
        provider: "browser-smoke",
        model: "local-smoke"
      }
    };
  },
  async rewrite(request) {
    return this.explain(request);
  }
};

const gatewayHandler = createLocalGatewayHandler({
  store,
  providerRuntime: runtime,
  now: () => currentTime,
  // This harness serves its own trusted page from the same origin, so the
  // unauthenticated and origin escapes are deliberate and local-only.
  allowUnauthenticated: true,
  allowedOrigins: [`http://${host}:${port}`]
});

const page = `<!doctype html>
<meta charset="utf-8">
<title>Pre-recall memory smoke</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 32px; line-height: 1.5; }
  main { max-width: 760px; }
  #status { color: #555; }
  #result { margin-top: 16px; padding: 16px; border: 1px solid #bbb; border-radius: 8px; }
  .ok { color: #126b36; font-weight: 700; }
</style>
<main>
  <h1>关联记忆浏览器烟测</h1>
  <p>浏览器请求解释 <strong>${TARGET_CONCEPT}</strong>，网关应在调用解释模型前召回已保存的 <strong>${RELATED_MEMORY}</strong> 记忆，并把关系边写入持久库。</p>
  <p id="status">running</p>
  <div id="result"></div>
</main>
<script>
(async () => {
  const response = await fetch("/explain", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      target: { canonicalName: "${TARGET_CONCEPT}", observedText: "${TARGET_CONCEPT}" },
      minimalContext: { fragmentId: "browser-smoke", text: "${TARGET_CONCEPT}" },
      constraints: { forceRefresh: true }
    })
  });
  const body = await response.json();
  window.__smokeResult = body;
  document.getElementById("status").textContent = body.status === "available" ? "available" : body.reason;
  document.getElementById("status").className = body.status === "available" ? "ok" : "";
  document.getElementById("result").textContent = body.text || body.microExplanation || "";
})();
</script>`;

const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", `http://${host}:${port}`).pathname;
  if (path === "/") {
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    });
    res.end(page);
    return;
  }
  if (path === "/__smoke-state") {
    const latestProviderInput = providerInputs.at(-1) ?? {};
    const memoryPacket = store.queryMemory({
      canonicalName: TARGET_CONCEPT,
      timestamp: currentTime + 1000,
      maxBridgeCount: 3
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      memoryDirectory,
      memoryRepository: store.getHealth?.() ?? null,
      providerCallCount: providerInputs.length,
      relationCallCount: relationInputs.length,
      providerBridgeNames: (latestProviderInput.memoryBridges ?? []).map((bridge) => bridge.relatedConcept),
      providerText: latestProviderInput.minimalContext?.text ?? null,
      relationCandidateNames: relationInputs.flatMap((input) =>
        (input.dailyMemoryBlocks ?? []).flatMap((block) => (block.concepts ?? []).map((concept) => concept.canonicalName))
      ),
      storedBridges: (memoryPacket.memoryBridges ?? []).map((bridge) => bridge.relatedConcept),
      storedRelationIds: (memoryPacket.relationProposals ?? memoryPacket.relations ?? []).map((relation) => relation.id).filter(Boolean)
    }));
    return;
  }
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", async () => {
    try {
      const response = await gatewayHandler({
        method: req.method,
        url: `http://${host}:${port}${req.url}`,
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8")
      });
      res.writeHead(response.status, response.headers);
      res.end(response.body);
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: AgentResultStatus.UNAVAILABLE, reason: error?.message ?? String(error) }));
    }
  });
});

server.listen(port, host, () => {
  console.log(`pre-recall browser smoke listening on http://${host}:${port}/`);
  console.log(`memory directory: ${memoryDirectory}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
}
