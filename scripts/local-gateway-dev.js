#!/usr/bin/env node
import {
  createGatewayProviderRuntime,
  createGatewayRuntimeConfig,
  createLocalGatewayHandler,
  createLocalMemoryStore,
  createMemoryRepositoryFromRuntimeConfig,
  resolveDefaultLocalMemoryStorePath,
  startLocalGatewayServer
} from "../src/local-gateway.js";
import { join } from "node:path";
import {
  createGatewayRuntimeConfigState,
  createJsonFileRuntimeConfigStorage
} from "../src/runtime-config.js";
import {
  AgentCapability,
  AgentProtocolVersion,
  AgentResultStatus,
  ProviderKind
} from "../src/contracts.js";

const args = new Set(process.argv.slice(2));
const host = process.env.BCO_GATEWAY_HOST ?? "127.0.0.1";
const port = Number(process.env.BCO_GATEWAY_PORT ?? 17321);
const token = process.env.BCO_GATEWAY_TOKEN ?? "";
const useStubExplain = args.has("--stub-explain") || process.env.BCO_GATEWAY_STUB_EXPLAIN === "true";
const useInMemoryStore = process.env.BCO_GATEWAY_MEMORY_MODE === "memory" || args.has("--memory-store=memory");
const memoryDirectory = resolveDefaultLocalMemoryStorePath({ env: process.env });
const configState = createGatewayRuntimeConfigState({
  env: process.env,
  storage: createJsonFileRuntimeConfigStorage({
    filePath: process.env.BCO_GATEWAY_CONFIG_PATH ?? join(memoryDirectory, "gateway-runtime-config.json")
  })
});
const effectiveRuntimeConfig = configState.getEffectiveConfig();
const store = useInMemoryStore
  ? createLocalMemoryStore()
  : createMemoryRepositoryFromRuntimeConfig({
    config: effectiveRuntimeConfig,
    defaultDirectory: memoryDirectory
  });
const providerRuntime = useStubExplain
  ? null
  : createGatewayProviderRuntime({
    providerConfig: createGatewayRuntimeConfig({ env: process.env }),
    configState,
    fetchImpl: globalThis.fetch,
    logger: console
  });

const handler = createLocalGatewayHandler({
  token,
  store,
  explainHandler: useStubExplain ? explainWithDevStub : null,
  rewriteHandler: useStubExplain ? explainWithDevStub : null,
  providerRuntime,
  runtimeConfigState: configState
});

const server = await startLocalGatewayServer({ host, port, handler, logger: console });

console.log(`BCO local gateway listening on http://${host}:${port}`);
console.log(`Capabilities: health, memory${useStubExplain || providerRuntime?.capabilities.explain ? ", explain" : ""}${useStubExplain || providerRuntime?.capabilities.rewrite ? ", rewrite" : ""}${providerRuntime?.capabilities.embedding ? ", embedding" : ""}`);
console.log(`Memory store: ${store.getHealth?.().persistent ? "persistent" : "in-memory"}${store.getHealth?.().pathConfigured ? " (path configured)" : ""}`);
if (token) console.log("Pairing token: configured from BCO_GATEWAY_TOKEN");
else console.log("Pairing token: disabled for this dev session");

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}

function explainWithDevStub(request = {}) {
  const target = request.target ?? {};
  const name = target.observedText || target.canonicalName || "the selected term";
  const style = request.requestedStyle ?? "concise";
  const text = `Dev gateway is running. Configure a real Agent provider to explain "${name}".`;

  return {
    status: AgentResultStatus.AVAILABLE,
    schemaVersion: AgentProtocolVersion,
    capabilityKind: request.capabilityKind ?? AgentCapability.EXPLAIN,
    providerMode: ProviderKind.LOCAL,
    target,
    microExplanation: text,
    expandedExplanation: text,
    style,
    factSensitivity: {
      level: target.factSensitivity ?? "stable",
      requiresSource: false
    },
    versionMetadata: {
      id: `dev_gateway_${Date.now()}`,
      provider: "local_gateway_dev_stub",
      model: "dev-stub",
      style,
      source: "external_agent"
    }
  };
}
