#!/usr/bin/env node
import {
  createGatewayProviderRuntime,
  createGatewayRuntimeConfig,
  createLocalGatewayHandler,
  createLocalMemoryStore,
  createMemoryRepositoryFromRuntimeConfig,
  createProviderRouteChangeAuditLogger,
  resolveDefaultLocalMemoryStorePath,
  startLocalGatewayServer
} from "../src/local-gateway.js";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const useStubExplain = args.has("--stub-explain") || process.env.BCO_GATEWAY_STUB_EXPLAIN === "true";
const useInMemoryStore = process.env.BCO_GATEWAY_MEMORY_MODE === "memory" || args.has("--memory-store=memory");
const memoryDirectory = resolveDefaultLocalMemoryStorePath({ env: process.env });
const pairing = resolvePairingToken({ env: process.env, directory: memoryDirectory, logger: console });
const token = pairing.token;
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
  runtimeConfigState: configState,
  onProviderRouteChange: createProviderRouteChangeAuditLogger(console)
});

const server = await startLocalGatewayServer({ host, port, handler, logger: console });

console.log(`BCO local gateway listening on http://${host}:${port}`);
console.log(`Capabilities: health, memory${useStubExplain || providerRuntime?.capabilities.explain ? ", explain" : ""}${useStubExplain || providerRuntime?.capabilities.rewrite ? ", rewrite" : ""}${providerRuntime?.capabilities.embedding ? ", embedding" : ""}`);
console.log(`Memory store: ${store.getHealth?.().persistent ? "persistent" : "in-memory"}${store.getHealth?.().pathConfigured ? " (path configured)" : ""}`);
console.log({
  env: "Pairing token: configured from BCO_GATEWAY_TOKEN",
  file: `Pairing token: loaded from ${pairing.tokenPath}`,
  generated: `Pairing token: generated and saved to ${pairing.tokenPath}`,
  session: "Pairing token: generated for this session only (set BCO_GATEWAY_TOKEN to persist pairing)"
}[pairing.source]);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}

function resolvePairingToken({ env = {}, directory = ".bco-memory", logger = console } = {}) {
  const envToken = (env.BCO_GATEWAY_TOKEN ?? "").trim();
  if (envToken) return { token: envToken, source: "env", tokenPath: null };

  // The token file lives next to the other gateway state. Even with
  // --memory-store=memory the gateway already persists runtime config under
  // this directory, so it is a safe fallback location for the token too.
  const tokenPath = join(directory, "gateway-pairing-token");
  try {
    const stored = readFileSync(tokenPath, "utf8").trim();
    if (stored) return { token: stored, source: "file", tokenPath };
  } catch {
    // Missing or unreadable token file falls through to generation.
  }

  const generated = randomBytes(24).toString("base64url");
  try {
    mkdirSync(directory, { recursive: true });
    writeFileSync(tokenPath, `${generated}\n`, { encoding: "utf8", mode: 0o600 });
    logger.log(`Pairing token generated at ${tokenPath}. Copy the file contents into the extension options page (Pairing token) to pair this gateway.`);
    return { token: generated, source: "generated", tokenPath };
  } catch (error) {
    logger.warn(`Pairing token file could not be written (${error?.message ?? error}). Using a session-only token; set BCO_GATEWAY_TOKEN to pair the extension.`);
    return { token: generated, source: "session", tokenPath: null };
  }
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
