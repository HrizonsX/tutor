import { DEFAULT_CONFIG } from "./config.js";
import {
  AgentCapability,
  AgentProtocolVersion,
  AgentResultStatus,
  ProviderAdapter,
  ProviderKind,
  ProviderRole
} from "./contracts.js";

export const DEFAULT_CAPABILITIES = Object.freeze({
  [AgentCapability.HEALTH]: false,
  [AgentCapability.EXPLAIN]: false,
  [AgentCapability.REWRITE]: false,
  [AgentCapability.EMBEDDING]: false,
  [AgentCapability.RELATION_PROPOSAL]: false,
  [AgentCapability.MEMORY_EVENT_WRITE]: false,
  [AgentCapability.MEMORY_QUERY]: false,
  [AgentCapability.SOURCE_AWARE_EXPLANATION]: false,
  [AgentCapability.STREAMING_EXPLANATION]: false
});

export function normalizeProviderMode(provider = ProviderKind.OFF) {
  if (provider === "none" || provider === ProviderKind.OFF) return ProviderKind.OFF;
  if (provider === "custom_http" || provider === "test" || provider === ProviderKind.CUSTOM) return ProviderKind.CUSTOM;
  if (provider === ProviderKind.LOCAL) return ProviderKind.LOCAL;
  if (provider === ProviderKind.CLOUD) return ProviderKind.CLOUD;
  return ProviderKind.OFF;
}

export function normalizeProviderAdapter(adapter = ProviderAdapter.NONE) {
  if (adapter === "openai" || adapter === "openai_compatible" || adapter === ProviderAdapter.OPENAI_COMPATIBLE) {
    return ProviderAdapter.OPENAI_COMPATIBLE;
  }
  if (adapter === "agent" || adapter === "internal_agent" || adapter === ProviderAdapter.INTERNAL_AGENT) {
    return ProviderAdapter.INTERNAL_AGENT;
  }
  return ProviderAdapter.NONE;
}

export function normalizeProviderRole(role = ProviderRole.EXPLAIN) {
  return role === ProviderRole.EMBEDDING ? ProviderRole.EMBEDDING : ProviderRole.EXPLAIN;
}

export function getProviderRoleForCapability(capability = AgentCapability.EXPLAIN) {
  return capability === AgentCapability.EMBEDDING ? ProviderRole.EMBEDDING : ProviderRole.EXPLAIN;
}

export function getLocalGatewayConfig(config = DEFAULT_CONFIG) {
  return config.localGateway ?? config.providerConfig?.localGateway ?? DEFAULT_CONFIG.localGateway;
}

export function validateProviderRoleConfig(config = DEFAULT_CONFIG, {
  role = ProviderRole.EXPLAIN,
  capability = AgentCapability.EXPLAIN
} = {}) {
  const providerRole = normalizeProviderRole(role);
  const localGateway = getLocalGatewayConfig(config);
  if (!localGateway?.endpoint) {
    return invalidProviderConfig(providerRole, capability, ProviderKind.LOCAL, "local_gateway_endpoint_unconfigured");
  }
  if (capability !== AgentCapability.HEALTH && !localGateway?.pairingToken) {
    return invalidProviderConfig(providerRole, capability, ProviderKind.LOCAL, "local_gateway_pairing_required");
  }
  return {
    valid: true,
    role: providerRole,
    mode: ProviderKind.LOCAL,
    endpoint: localGateway.endpoint,
    adapter: ProviderAdapter.NONE,
    modelName: "",
    timeoutMs: localGateway.timeoutMs ?? DEFAULT_CONFIG.localGateway.timeoutMs
  };
}

export function createProviderRegistry({
  config = DEFAULT_CONFIG,
  chromeApi = globalThis.chrome,
  fetchImpl = globalThis.fetch,
  gatewayClient = null,
  now = () => Date.now(),
  healthCache = new Map()
} = {}) {
  const gatewayConfig = getLocalGatewayConfig(config);
  const localGatewayClient = gatewayClient ?? createLocalGatewayClient({
    endpoint: gatewayConfig.endpoint,
    pairingToken: gatewayConfig.pairingToken,
    pairingTokenStorageKey: gatewayConfig.pairingTokenStorageKey,
    chromeApi,
    fetchImpl,
    timeoutMs: gatewayConfig.timeoutMs,
    now
  });

  function resolveProvider(capability = AgentCapability.EXPLAIN, { role = getProviderRoleForCapability(capability) } = {}) {
    const providerRole = normalizeProviderRole(role);
    const validation = validateProviderRoleConfig(config, { role: providerRole, capability });
    if (!validation.valid) {
      return unavailableProvider({
        role: providerRole,
        capability,
        reason: validation.reason
      });
    }
    return {
      role: providerRole,
      mode: ProviderKind.LOCAL,
      capability,
      endpoint: gatewayConfig.endpoint,
      token: gatewayConfig.pairingToken ?? "",
      tokenStorageKey: gatewayConfig.pairingTokenStorageKey ?? "",
      adapter: ProviderAdapter.NONE,
      modelName: "",
      timeoutMs: gatewayConfig.timeoutMs ?? DEFAULT_CONFIG.localGateway.timeoutMs,
      capabilities: null,
      unavailableReason: null,
      client: localGatewayClient
    };
  }

  async function refreshHealth({ force = false, role = ProviderRole.EXPLAIN } = {}) {
    const providerRole = normalizeProviderRole(role);
    const cacheKey = `${providerRole}:local:health`;
    const cached = healthCache.get(cacheKey);
    const ttl = gatewayConfig.health?.cacheTtlMs ?? 30 * 1000;
    if (!force && cached && now() - cached.checkedAt <= ttl) return cached;

    const provider = resolveProvider(AgentCapability.HEALTH, { role: providerRole });
    let health;
    if (gatewayConfig.health?.enabled === false) {
      health = {
        status: AgentResultStatus.UNAVAILABLE,
        reason: "provider_health_disabled",
        role: providerRole,
        mode: ProviderKind.LOCAL,
        endpoint: provider.endpoint,
        adapter: ProviderAdapter.NONE,
        modelName: "",
        capabilities: { ...DEFAULT_CAPABILITIES },
        protocolVersion: AgentProtocolVersion,
        checkedAt: now()
      };
    } else if (provider.unavailableReason) {
      health = {
        status: AgentResultStatus.UNAVAILABLE,
        reason: provider.unavailableReason,
        role: providerRole,
        mode: ProviderKind.LOCAL,
        endpoint: provider.endpoint,
        adapter: ProviderAdapter.NONE,
        modelName: "",
        capabilities: { ...DEFAULT_CAPABILITIES },
        protocolVersion: AgentProtocolVersion,
        checkedAt: now()
      };
    } else {
      health = normalizeHealth(await localGatewayClient.health(), {
        role: providerRole,
        mode: ProviderKind.LOCAL,
        endpoint: provider.endpoint,
        adapter: ProviderAdapter.NONE,
        modelName: "",
        now
      });
    }
    healthCache.set(cacheKey, health);
    return health;
  }

  return {
    mode: ProviderKind.LOCAL,
    roles: {
      [ProviderRole.EXPLAIN]: ProviderKind.LOCAL,
      [ProviderRole.EMBEDDING]: ProviderKind.LOCAL
    },
    resolveProvider,
    refreshHealth,
    invalidateHealthCache: () => healthCache.clear(),
    getLocalGatewayClient: () => localGatewayClient,
    getMode: () => ProviderKind.LOCAL,
    usesLocalGateway: () => true,
    getDiagnosticsState: () => createProviderDiagnosticsState(config)
  };
}

export function createLocalGatewayClient({
  endpoint = DEFAULT_CONFIG.localGateway.endpoint,
  pairingToken = "",
  pairingTokenStorageKey = "",
  chromeApi = globalThis.chrome,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_CONFIG.localGateway.timeoutMs,
  logger = createDefaultGatewayLogger(chromeApi)
} = {}) {
  async function request(path, { method = "POST", body = null, capability = null, tokenOptional = false } = {}) {
    const requestUrl = joinEndpoint(endpoint, path);
    if (!endpoint || !fetchImpl) {
      logGateway(logger, "warn", "request_skipped", {
        method,
        path,
        capability,
        reason: "local_gateway_endpoint_unconfigured"
      });
      return unavailable("local_gateway_endpoint_unconfigured", capability);
    }

    const token = await readCredential(chromeApi, pairingTokenStorageKey, pairingToken);
    if (!token && !tokenOptional) {
      logGateway(logger, "warn", "request_skipped", {
        method,
        path,
        capability,
        reason: "local_gateway_pairing_required"
      });
      return unavailable("local_gateway_pairing_required", capability);
    }

    const startedAt = Date.now();
    logGateway(logger, "info", "request_start", {
      method,
      path,
      url: redactUrlForLog(requestUrl),
      capability,
      hasBody: body !== null,
      tokenPresent: Boolean(token)
    });

    try {
      const response = await withTimeout(fetchImpl(requestUrl, {
        method,
        headers: {
          "content-type": "application/json",
          ...(token ? { "x-bco-pairing-token": token } : {})
        },
        body: body === null ? undefined : JSON.stringify(body)
      }), timeoutMs, "local_gateway_timeout");
      const durationMs = Date.now() - startedAt;

      if (response?.status === 401 || response?.status === 403) {
        logGateway(logger, "warn", "request_unavailable", {
          method,
          path,
          capability,
          status: response.status,
          durationMs,
          reason: "local_gateway_pairing_rejected"
        });
        return unavailable("local_gateway_pairing_rejected", capability);
      }
      if (response?.status === 404) {
        logGateway(logger, "warn", "request_unavailable", {
          method,
          path,
          capability,
          status: response.status,
          durationMs,
          reason: "provider_capability_unsupported"
        });
        return unavailable("provider_capability_unsupported", capability);
      }
      if (!response?.ok) {
        logGateway(logger, "warn", "request_unavailable", {
          method,
          path,
          capability,
          status: response?.status ?? "error",
          durationMs,
          reason: `local_gateway_http_${response?.status ?? "error"}`
        });
        return unavailable(`local_gateway_http_${response?.status ?? "error"}`, capability);
      }
      logGateway(logger, "info", "request_success", {
        method,
        path,
        capability,
        status: response.status,
        durationMs
      });
      return response.json();
    } catch (error) {
      const reason = error?.message === "local_gateway_timeout" ? "local_gateway_timeout" : "local_gateway_unreachable";
      logGateway(logger, "warn", "request_failed", {
        method,
        path,
        capability,
        durationMs: Date.now() - startedAt,
        reason,
        message: error?.message ?? String(error)
      });
      return unavailable(reason, capability, {
        message: error?.message ?? String(error)
      });
    }
  }

  async function streamRequest(path, {
    method = "POST",
    body = null,
    capability = null,
    onEvent = () => {},
    signal = null
  } = {}) {
    const requestUrl = joinEndpoint(endpoint, path);
    if (!endpoint || !fetchImpl) {
      return unavailable("local_gateway_endpoint_unconfigured", capability);
    }

    const token = await readCredential(chromeApi, pairingTokenStorageKey, pairingToken);
    if (!token) {
      return unavailable("local_gateway_pairing_required", capability);
    }

    const startedAt = Date.now();
    logGateway(logger, "info", "request_start", {
      method,
      path,
      url: redactUrlForLog(requestUrl),
      capability,
      hasBody: body !== null,
      tokenPresent: Boolean(token)
    });

    try {
      const response = await withTimeout(fetchImpl(requestUrl, {
        method,
        headers: {
          "content-type": "application/json",
          ...(token ? { "x-bco-pairing-token": token } : {})
        },
        body: body === null ? undefined : JSON.stringify(body),
        ...(signal ? { signal } : {})
      }), timeoutMs, "local_gateway_timeout");
      const durationMs = Date.now() - startedAt;

      if (response?.status === 401 || response?.status === 403) {
        return unavailable("local_gateway_pairing_rejected", capability);
      }
      if (response?.status === 404) {
        return unavailable("provider_capability_unsupported", capability);
      }
      if (!response?.ok) {
        return unavailable(`local_gateway_http_${response?.status ?? "error"}`, capability);
      }

      const read = await readNdjsonEvents(response.body, { onEvent });
      logGateway(logger, "info", "request_success", {
        method,
        path,
        capability,
        status: response.status,
        durationMs,
        eventCount: read.eventCount
      });
      return {
        status: AgentResultStatus.AVAILABLE,
        capabilityKind: capability,
        eventCount: read.eventCount,
        lastEvent: read.lastEvent
      };
    } catch (error) {
      const reason = error?.message === "local_gateway_timeout" ? "local_gateway_timeout" : "local_gateway_unreachable";
      logGateway(logger, "warn", "request_failed", {
        method,
        path,
        capability,
        durationMs: Date.now() - startedAt,
        reason,
        message: error?.message ?? String(error)
      });
      return unavailable(reason, capability, {
        message: error?.message ?? String(error)
      });
    }
  }

  return {
    health: () => request("/health", { method: "GET", capability: AgentCapability.HEALTH, tokenOptional: true }),
    readRuntimeConfig: () => request("/config", { method: "GET", capability: "runtime_config" }),
    updateRuntimeConfig: (config) => request("/config", { body: { config }, capability: "runtime_config" }),
    explain: (requestBody) => request("/explain", { body: requestBody, capability: AgentCapability.EXPLAIN }),
    streamExplanation: (requestBody, options = {}) => streamRequest("/explain/stream-session", {
      body: requestBody,
      capability: AgentCapability.STREAMING_EXPLANATION,
      ...options
    }),
    rewrite: (requestBody) => request("/rewrite", { body: requestBody, capability: AgentCapability.REWRITE }),
    createEmbedding: (payload) => request("/embedding", { body: payload, capability: AgentCapability.EMBEDDING }),
    writeMemoryEvent: (event) => request("/memory/events", { body: event, capability: AgentCapability.MEMORY_EVENT_WRITE }),
    queryMemory: (query) => request("/memory/query", { body: query, capability: AgentCapability.MEMORY_QUERY })
  };
}

async function readNdjsonEvents(body, { onEvent = () => {} } = {}) {
  if (!body) return { eventCount: 0, lastEvent: null };
  const decoder = new TextDecoder();
  let buffer = "";
  let eventCount = 0;
  let lastEvent = null;
  const processLine = (line) => {
    const text = line.trim();
    if (!text) return;
    const event = JSON.parse(text);
    eventCount += 1;
    lastEvent = event;
    onEvent(event);
  };

  for await (const chunk of iterateReadableBody(body)) {
    buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) processLine(line);
  }
  buffer += decoder.decode();
  if (buffer.trim()) processLine(buffer);
  return { eventCount, lastEvent };
}

async function* iterateReadableBody(body) {
  if (typeof body.getReader === "function") {
    const reader = body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        yield value;
      }
    } finally {
      reader.releaseLock?.();
    }
    return;
  }
  if (typeof body[Symbol.asyncIterator] === "function") {
    for await (const chunk of body) yield chunk;
    return;
  }
  throw new Error("unsupported_stream_body");
}

export async function readCredential(chromeApi, key, directValue = "") {
  if (directValue) return directValue;
  if (!key || !chromeApi?.storage?.local?.get) return "";
  return new Promise((resolve) => {
    try {
      chromeApi.storage.local.get([key], (result) => resolve(result?.[key] ?? ""));
    } catch {
      resolve("");
    }
  });
}

export function hasCapability(health = {}, capability) {
  return Boolean(health.capabilities?.[capability]);
}

function unavailable(reason, capability = null, details = null) {
  return {
    status: AgentResultStatus.UNAVAILABLE,
    reason,
    unavailableReason: reason,
    capabilityKind: capability,
    details
  };
}

function unavailableProvider({ role = null, capability, reason }) {
  return {
    role,
    mode: ProviderKind.LOCAL,
    capability,
    endpoint: "",
    adapter: ProviderAdapter.NONE,
    modelName: "",
    capabilities: { ...DEFAULT_CAPABILITIES },
    unavailableReason: reason,
    client: null
  };
}

function normalizeHealth(raw = {}, { role, mode, endpoint, adapter = null, modelName, now }) {
  const providerRole = raw?.role === ProviderRole.EMBEDDING ? ProviderRole.EMBEDDING : role;
  if (!raw || typeof raw !== "object" || raw.status === AgentResultStatus.UNAVAILABLE) {
    return {
      status: AgentResultStatus.UNAVAILABLE,
      reason: raw?.reason ?? "provider_health_unavailable",
      role: providerRole,
      mode,
      endpoint,
      adapter: raw?.adapter ?? adapter,
      modelName: raw?.modelName ?? modelName ?? "",
      capabilities: { ...DEFAULT_CAPABILITIES, ...(raw?.capabilities ?? {}) },
      protocolVersion: raw?.protocolVersion ?? AgentProtocolVersion,
      providerRoles: raw?.providerRoles ?? {},
      memoryRepository: raw?.memoryRepository ?? null,
      checkedAt: now()
    };
  }
  return {
    status: raw.status ?? AgentResultStatus.AVAILABLE,
    reason: raw.reason ?? null,
    role: providerRole,
    mode: raw.mode ?? mode,
    endpoint: raw.endpoint ?? endpoint,
    adapter: raw.adapter ?? adapter,
    modelName: raw.modelName ?? modelName ?? "",
    capabilities: { ...DEFAULT_CAPABILITIES, ...(raw.capabilities ?? {}) },
    protocolVersion: raw.protocolVersion ?? AgentProtocolVersion,
    providerRoles: raw.providerRoles ?? {},
    memoryRepository: raw.memoryRepository ?? null,
    checkedAt: raw.checkedAt ?? now()
  };
}

function invalidProviderConfig(role, capability, mode, reason) {
  return { valid: false, role, capability, mode, reason };
}

function createProviderDiagnosticsState(config = DEFAULT_CONFIG) {
  const localGateway = getLocalGatewayConfig(config);
  return {
    providerRoles: {
      [ProviderRole.EXPLAIN]: diagnosticsGatewayRoleState(ProviderRole.EXPLAIN),
      [ProviderRole.EMBEDDING]: diagnosticsGatewayRoleState(ProviderRole.EMBEDDING),
      [ProviderRole.RELATION_PROPOSER]: diagnosticsGatewayRoleState(ProviderRole.RELATION_PROPOSER)
    },
    localGateway: {
      endpoint: localGateway.endpoint ?? "",
      pairingTokenPresent: Boolean(localGateway.pairingToken),
      timeoutMs: localGateway.timeoutMs ?? null,
      health: { ...(localGateway.health ?? {}) }
    }
  };
}

function diagnosticsGatewayRoleState(role) {
  return {
    role,
    enabled: true,
    mode: ProviderKind.LOCAL,
    adapter: ProviderAdapter.NONE,
    endpoint: "",
    chatPath: "",
    embeddingPath: "",
    structuredOutput: {},
    modelName: "",
    tokenPresent: false,
    timeoutMs: null,
    health: {}
  };
}

function joinEndpoint(endpoint, path) {
  return `${String(endpoint).replace(/\/+$/, "")}/${String(path).replace(/^\/+/, "")}`;
}

function createDefaultGatewayLogger(chromeApi) {
  if (!chromeApi?.runtime || !globalThis.console) return null;
  return globalThis.console;
}

function logGateway(logger, level, event, details = {}) {
  if (!logger) return;
  const log = logger[level] ?? logger.log;
  if (typeof log !== "function") return;
  log.call(logger, `[BCO][local-gateway] ${event}`, details);
}

function redactUrlForLog(value = "") {
  try {
    const parsed = new URL(String(value));
    for (const key of parsed.searchParams.keys()) {
      if (/token|secret|key|authorization/i.test(key)) {
        parsed.searchParams.set(key, "<redacted>");
      }
    }
    return parsed.toString().replaceAll("%3Credacted%3E", "<redacted>");
  } catch {
    return String(value).replace(/([?&][^=]*(?:token|secret|key|authorization)[^=]*=)[^&]*/gi, "$1<redacted>");
  }
}

function withTimeout(promise, timeoutMs, reason) {
  let timer = null;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(reason)), timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
}
