import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DEFAULT_CONFIG } from "./config.js";
import {
  AgentResultStatus,
  ProviderAdapter,
  ProviderKind,
  StructuredOutputMode
} from "./contracts.js";

export const DEFAULT_GATEWAY_PROVIDER_CONFIG = Object.freeze({
  explain: {
    enabled: false,
    provider: ProviderKind.OFF,
    adapter: ProviderAdapter.NONE,
    endpoint: "",
    token: "",
    modelName: "",
    chatPath: "/chat/completions",
    structuredOutput: {
      enabled: true,
      mode: StructuredOutputMode.JSON_SCHEMA,
      schemaName: "bco_explanation_result"
    },
    timeoutMs: 8000,
    health: {
      enabled: true,
      cacheTtlMs: 30 * 1000
    }
  },
  embedding: {
    enabled: false,
    provider: ProviderKind.OFF,
    adapter: ProviderAdapter.NONE,
    endpoint: "",
    token: "",
    modelName: "",
    embeddingPath: "/embeddings",
    timeoutMs: 8000,
    health: {
      enabled: true,
      cacheTtlMs: 30 * 1000
    }
  },
  relationProposer: {
    enabled: false,
    reuseExplainProvider: true,
    provider: ProviderKind.OFF,
    adapter: ProviderAdapter.NONE,
    endpoint: "",
    token: "",
    modelName: "",
    chatPath: "/chat/completions",
    structuredOutput: {
      enabled: true,
      mode: StructuredOutputMode.JSON_SCHEMA,
      schemaName: "bco_relation_proposal_result"
    },
    timeoutMs: 8000,
    health: {
      enabled: true,
      cacheTtlMs: 30 * 1000
    }
  }
});

export const DEFAULT_GATEWAY_RUNTIME_CONFIG = Object.freeze({
  ...DEFAULT_GATEWAY_PROVIDER_CONFIG,
  localGateway: {
    host: "127.0.0.1",
    port: 17321
  },
  memory: {
    schemaVersion: DEFAULT_CONFIG.memory.schemaVersion,
    repository: "sqlite",
    storeMode: "memory",
    path: "",
    postgres: {
      connectionString: "",
      schema: "public",
      ssl: false
    },
    redis: {
      url: "",
      sessionTtlMs: 30 * 60 * 1000,
      keyPrefix: "bco:memory"
    },
    vectorRecall: {
      mode: "disabled",
      maxCandidates: 8,
      minScore: 0.5
    },
    outbox: {
      enabled: true,
      pollIntervalMs: 5000,
      batchSize: 25,
      maxAttempts: 5,
      staleThresholdMs: 60 * 1000
    },
    cognitive: { ...DEFAULT_CONFIG.memory.cognitive }
  }
});

export const RESTART_REQUIRED_FIELDS = Object.freeze([
  "localGateway.host",
  "localGateway.port",
  "memory.schemaVersion",
  "memory.repository",
  "memory.storeMode",
  "memory.path",
  "memory.sqlitePath",
  "memory.postgres",
  "memory.redis",
  "memory.vectorRecall.mode",
  "memory.outbox",
  "maintenance.destructive"
]);

export const HOT_UPDATE_FIELD_PREFIXES = Object.freeze([
  "explain",
  "embedding",
  "relationProposer",
  "memory.cognitive"
]);

export function createGatewayRuntimeConfig({ env = globalThis.process?.env ?? {}, providerConfig = {} } = {}) {
  const explain = mergeGatewayProviderRole(DEFAULT_GATEWAY_PROVIDER_CONFIG.explain, {
      ...providerConfig.explain,
      enabled: readBoolean(env.BCO_GATEWAY_EXPLAIN_ENABLED, providerConfig.explain?.enabled),
      provider: env.BCO_GATEWAY_EXPLAIN_PROVIDER ?? providerConfig.explain?.provider,
      adapter: env.BCO_GATEWAY_EXPLAIN_ADAPTER ?? providerConfig.explain?.adapter,
      endpoint: env.BCO_GATEWAY_EXPLAIN_ENDPOINT ?? providerConfig.explain?.endpoint,
      token: env.BCO_GATEWAY_EXPLAIN_TOKEN ?? providerConfig.explain?.token,
      modelName: env.BCO_GATEWAY_EXPLAIN_MODEL ?? providerConfig.explain?.modelName,
      chatPath: env.BCO_GATEWAY_EXPLAIN_CHAT_PATH ?? providerConfig.explain?.chatPath,
      timeoutMs: readNumber(env.BCO_GATEWAY_EXPLAIN_TIMEOUT_MS, providerConfig.explain?.timeoutMs),
      structuredOutput: {
        ...providerConfig.explain?.structuredOutput,
        mode: env.BCO_GATEWAY_EXPLAIN_STRUCTURED_OUTPUT ?? providerConfig.explain?.structuredOutput?.mode,
        schemaName: env.BCO_GATEWAY_EXPLAIN_SCHEMA_NAME ?? providerConfig.explain?.structuredOutput?.schemaName
      }
    });
  const embedding = mergeGatewayProviderRole(DEFAULT_GATEWAY_PROVIDER_CONFIG.embedding, {
      ...providerConfig.embedding,
      enabled: readBoolean(env.BCO_GATEWAY_EMBEDDING_ENABLED, providerConfig.embedding?.enabled),
      provider: env.BCO_GATEWAY_EMBEDDING_PROVIDER ?? providerConfig.embedding?.provider,
      adapter: env.BCO_GATEWAY_EMBEDDING_ADAPTER ?? providerConfig.embedding?.adapter,
      endpoint: env.BCO_GATEWAY_EMBEDDING_ENDPOINT ?? providerConfig.embedding?.endpoint,
      token: env.BCO_GATEWAY_EMBEDDING_TOKEN ?? providerConfig.embedding?.token,
      modelName: env.BCO_GATEWAY_EMBEDDING_MODEL ?? providerConfig.embedding?.modelName,
      embeddingPath: env.BCO_GATEWAY_EMBEDDING_PATH ?? providerConfig.embedding?.embeddingPath,
      timeoutMs: readNumber(env.BCO_GATEWAY_EMBEDDING_TIMEOUT_MS, providerConfig.embedding?.timeoutMs)
    });
  const relationProposer = mergeGatewayProviderRole(DEFAULT_GATEWAY_PROVIDER_CONFIG.relationProposer, {
      ...providerConfig.relationProposer,
      enabled: readBoolean(
        env.BCO_GATEWAY_RELATION_PROPOSER_ENABLED,
        providerConfig.relationProposer?.enabled ?? Boolean(explain.enabled)
      ),
      reuseExplainProvider: readBoolean(
        env.BCO_GATEWAY_RELATION_PROPOSER_REUSE_EXPLAIN,
        providerConfig.relationProposer?.reuseExplainProvider
      ),
      provider: env.BCO_GATEWAY_RELATION_PROPOSER_PROVIDER ?? providerConfig.relationProposer?.provider,
      adapter: env.BCO_GATEWAY_RELATION_PROPOSER_ADAPTER ?? providerConfig.relationProposer?.adapter,
      endpoint: env.BCO_GATEWAY_RELATION_PROPOSER_ENDPOINT ?? providerConfig.relationProposer?.endpoint,
      token: env.BCO_GATEWAY_RELATION_PROPOSER_TOKEN ?? providerConfig.relationProposer?.token,
      modelName: env.BCO_GATEWAY_RELATION_PROPOSER_MODEL ?? providerConfig.relationProposer?.modelName,
      chatPath: env.BCO_GATEWAY_RELATION_PROPOSER_CHAT_PATH ?? providerConfig.relationProposer?.chatPath,
      timeoutMs: readNumber(env.BCO_GATEWAY_RELATION_PROPOSER_TIMEOUT_MS, providerConfig.relationProposer?.timeoutMs),
      structuredOutput: {
        ...providerConfig.relationProposer?.structuredOutput,
        mode: env.BCO_GATEWAY_RELATION_PROPOSER_STRUCTURED_OUTPUT ?? providerConfig.relationProposer?.structuredOutput?.mode,
        schemaName: env.BCO_GATEWAY_RELATION_PROPOSER_SCHEMA_NAME ?? providerConfig.relationProposer?.structuredOutput?.schemaName
      }
    });
  return {
    explain,
    embedding,
    relationProposer,
    localGateway: {
      ...DEFAULT_GATEWAY_RUNTIME_CONFIG.localGateway,
      ...(providerConfig.localGateway ?? {}),
      host: env.BCO_GATEWAY_HOST ?? providerConfig.localGateway?.host ?? DEFAULT_GATEWAY_RUNTIME_CONFIG.localGateway.host,
      port: readNumber(env.BCO_GATEWAY_PORT, providerConfig.localGateway?.port ?? DEFAULT_GATEWAY_RUNTIME_CONFIG.localGateway.port)
    },
    memory: {
      ...DEFAULT_GATEWAY_RUNTIME_CONFIG.memory,
      ...(providerConfig.memory ?? {}),
      schemaVersion: readNumber(env.BCO_GATEWAY_MEMORY_SCHEMA_VERSION, providerConfig.memory?.schemaVersion ?? DEFAULT_CONFIG.memory.schemaVersion),
      repository: env.BCO_GATEWAY_MEMORY_REPOSITORY ??
        providerConfig.memory?.repository ??
        providerConfig.memory?.storeMode ??
        DEFAULT_GATEWAY_RUNTIME_CONFIG.memory.repository,
      postgres: {
        ...DEFAULT_GATEWAY_RUNTIME_CONFIG.memory.postgres,
        ...(providerConfig.memory?.postgres ?? {}),
        connectionString: env.BCO_GATEWAY_POSTGRES_URL ?? providerConfig.memory?.postgres?.connectionString ?? DEFAULT_GATEWAY_RUNTIME_CONFIG.memory.postgres.connectionString,
        schema: env.BCO_GATEWAY_POSTGRES_SCHEMA ?? providerConfig.memory?.postgres?.schema ?? DEFAULT_GATEWAY_RUNTIME_CONFIG.memory.postgres.schema,
        ssl: readBoolean(env.BCO_GATEWAY_POSTGRES_SSL, providerConfig.memory?.postgres?.ssl ?? DEFAULT_GATEWAY_RUNTIME_CONFIG.memory.postgres.ssl)
      },
      redis: {
        ...DEFAULT_GATEWAY_RUNTIME_CONFIG.memory.redis,
        ...(providerConfig.memory?.redis ?? {}),
        url: env.BCO_GATEWAY_REDIS_URL ?? providerConfig.memory?.redis?.url ?? DEFAULT_GATEWAY_RUNTIME_CONFIG.memory.redis.url,
        sessionTtlMs: readNumber(env.BCO_GATEWAY_REDIS_SESSION_TTL_MS, providerConfig.memory?.redis?.sessionTtlMs ?? DEFAULT_GATEWAY_RUNTIME_CONFIG.memory.redis.sessionTtlMs),
        keyPrefix: env.BCO_GATEWAY_REDIS_KEY_PREFIX ?? providerConfig.memory?.redis?.keyPrefix ?? DEFAULT_GATEWAY_RUNTIME_CONFIG.memory.redis.keyPrefix
      },
      vectorRecall: {
        ...DEFAULT_GATEWAY_RUNTIME_CONFIG.memory.vectorRecall,
        ...(providerConfig.memory?.vectorRecall ?? {}),
        mode: env.BCO_GATEWAY_VECTOR_RECALL_MODE ?? providerConfig.memory?.vectorRecall?.mode ?? DEFAULT_GATEWAY_RUNTIME_CONFIG.memory.vectorRecall.mode,
        maxCandidates: readNumber(env.BCO_GATEWAY_VECTOR_RECALL_MAX_CANDIDATES, providerConfig.memory?.vectorRecall?.maxCandidates ?? DEFAULT_GATEWAY_RUNTIME_CONFIG.memory.vectorRecall.maxCandidates),
        minScore: readNumber(env.BCO_GATEWAY_VECTOR_RECALL_MIN_SCORE, providerConfig.memory?.vectorRecall?.minScore ?? DEFAULT_GATEWAY_RUNTIME_CONFIG.memory.vectorRecall.minScore)
      },
      outbox: {
        ...DEFAULT_GATEWAY_RUNTIME_CONFIG.memory.outbox,
        ...(providerConfig.memory?.outbox ?? {}),
        enabled: readBoolean(env.BCO_GATEWAY_OUTBOX_ENABLED, providerConfig.memory?.outbox?.enabled ?? DEFAULT_GATEWAY_RUNTIME_CONFIG.memory.outbox.enabled),
        pollIntervalMs: readNumber(env.BCO_GATEWAY_OUTBOX_POLL_INTERVAL_MS, providerConfig.memory?.outbox?.pollIntervalMs ?? DEFAULT_GATEWAY_RUNTIME_CONFIG.memory.outbox.pollIntervalMs),
        batchSize: readNumber(env.BCO_GATEWAY_OUTBOX_BATCH_SIZE, providerConfig.memory?.outbox?.batchSize ?? DEFAULT_GATEWAY_RUNTIME_CONFIG.memory.outbox.batchSize),
        maxAttempts: readNumber(env.BCO_GATEWAY_OUTBOX_MAX_ATTEMPTS, providerConfig.memory?.outbox?.maxAttempts ?? DEFAULT_GATEWAY_RUNTIME_CONFIG.memory.outbox.maxAttempts),
        staleThresholdMs: readNumber(env.BCO_GATEWAY_OUTBOX_STALE_THRESHOLD_MS, providerConfig.memory?.outbox?.staleThresholdMs ?? DEFAULT_GATEWAY_RUNTIME_CONFIG.memory.outbox.staleThresholdMs)
      },
      cognitive: {
        ...DEFAULT_GATEWAY_RUNTIME_CONFIG.memory.cognitive,
        ...(providerConfig.memory?.cognitive ?? {})
      }
    }
  };
}

export function createGatewayRuntimeConfigState({
  env = globalThis.process?.env ?? {},
  providerConfig = {},
  initialConfig = {},
  storage = null,
  now = () => Date.now()
} = {}) {
  const startup = createGatewayRuntimeConfig({ env, providerConfig });
  const stored = safeReadStorage(storage);
  let effectiveConfig = mergeGatewayRuntimeConfig(startup, stored, initialConfig);
  let version = 1;
  let lastUpdatedAt = null;
  let lastUpdateStatus = "loaded";
  let lastUpdateResult = {
    status: AgentResultStatus.AVAILABLE,
    appliedPaths: [],
    restartRequiredPaths: [],
    validationFailures: []
  };

  function read() {
    return {
      status: AgentResultStatus.AVAILABLE,
      config: redactRuntimeConfig(effectiveConfig),
      version,
      loadedAt: null,
      lastUpdatedAt,
      lastUpdateStatus,
      lastUpdateResult: clone(lastUpdateResult),
      hotUpdateFields: [...HOT_UPDATE_FIELD_PREFIXES],
      restartRequiredFields: [...RESTART_REQUIRED_FIELDS]
    };
  }

  function update(patch = {}) {
    const requestedPatch = patch?.config && typeof patch.config === "object" ? patch.config : patch;
    const classification = classifyRuntimeConfigPatch(requestedPatch);
    if (classification.validationFailures.length > 0) {
      lastUpdateStatus = "invalid";
      lastUpdateResult = {
        status: AgentResultStatus.INVALID,
        reason: "runtime_config_validation_failed",
        appliedPaths: [],
        restartRequiredPaths: classification.restartRequiredPaths,
        validationFailures: classification.validationFailures,
        version,
        lastUpdatedAt
      };
      return clone(lastUpdateResult);
    }

    effectiveConfig = mergeGatewayRuntimeConfig(effectiveConfig, classification.appliedPatch);
    if (classification.appliedPaths.length > 0) {
      version += 1;
      lastUpdatedAt = now();
      safeWriteStorage(storage, effectiveConfig);
    }
    lastUpdateStatus = classification.restartRequiredPaths.length > 0 && classification.appliedPaths.length === 0
      ? "restart_required"
      : "hot_applied";
    lastUpdateResult = {
      status: AgentResultStatus.AVAILABLE,
      appliedPaths: classification.appliedPaths,
      restartRequiredPaths: classification.restartRequiredPaths,
      validationFailures: [],
      version,
      lastUpdatedAt,
      hotUpdateClass: classification.restartRequiredPaths.length > 0 ? "partial_hot_update" : "hot_update",
      config: redactRuntimeConfig(effectiveConfig)
    };
    return clone(lastUpdateResult);
  }

  return {
    getEffectiveConfig: () => clone(effectiveConfig),
    read,
    update,
    getDiagnosticsState: () => ({
      version,
      lastUpdatedAt,
      lastUpdateStatus,
      lastUpdateResult: clone(lastUpdateResult),
      hotUpdateFields: [...HOT_UPDATE_FIELD_PREFIXES],
      restartRequiredFields: [...RESTART_REQUIRED_FIELDS]
    })
  };
}

export function createJsonFileRuntimeConfigStorage({ filePath = "" } = {}) {
  return {
    read() {
      if (!filePath) return {};
      try {
        return JSON.parse(readFileSync(filePath, "utf8"));
      } catch {
        return {};
      }
    },
    write(config = {}) {
      if (!filePath) return;
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    }
  };
}

export function mergeGatewayRuntimeConfig(...configs) {
  return configs.reduce((merged, config = {}) => ({
    ...merged,
    ...removeUndefined(config),
    explain: mergeGatewayProviderRole(merged.explain ?? DEFAULT_GATEWAY_PROVIDER_CONFIG.explain, config.explain ?? {}),
    embedding: mergeGatewayProviderRole(merged.embedding ?? DEFAULT_GATEWAY_PROVIDER_CONFIG.embedding, config.embedding ?? {}),
    relationProposer: mergeGatewayProviderRole(
      merged.relationProposer ?? DEFAULT_GATEWAY_PROVIDER_CONFIG.relationProposer,
      config.relationProposer ?? {}
    ),
    localGateway: {
      ...(merged.localGateway ?? DEFAULT_GATEWAY_RUNTIME_CONFIG.localGateway),
      ...removeUndefined(config.localGateway ?? {})
    },
    memory: {
      ...(merged.memory ?? DEFAULT_GATEWAY_RUNTIME_CONFIG.memory),
      ...removeUndefined(config.memory ?? {}),
      postgres: {
        ...((merged.memory ?? DEFAULT_GATEWAY_RUNTIME_CONFIG.memory).postgres ?? {}),
        ...removeUndefined(config.memory?.postgres ?? {})
      },
      redis: {
        ...((merged.memory ?? DEFAULT_GATEWAY_RUNTIME_CONFIG.memory).redis ?? {}),
        ...removeUndefined(config.memory?.redis ?? {})
      },
      vectorRecall: {
        ...((merged.memory ?? DEFAULT_GATEWAY_RUNTIME_CONFIG.memory).vectorRecall ?? {}),
        ...removeUndefined(config.memory?.vectorRecall ?? {})
      },
      outbox: {
        ...((merged.memory ?? DEFAULT_GATEWAY_RUNTIME_CONFIG.memory).outbox ?? {}),
        ...removeUndefined(config.memory?.outbox ?? {})
      },
      cognitive: {
        ...((merged.memory ?? DEFAULT_GATEWAY_RUNTIME_CONFIG.memory).cognitive ?? {}),
        ...removeUndefined(config.memory?.cognitive ?? {})
      }
    }
  }), clone(DEFAULT_GATEWAY_RUNTIME_CONFIG));
}

export function redactRuntimeConfig(config = {}) {
  return {
    ...clone(config),
    explain: redactProviderRole(config.explain),
    embedding: redactProviderRole(config.embedding),
    relationProposer: redactProviderRole(config.relationProposer),
    localGateway: { ...(config.localGateway ?? {}) },
    memory: {
      ...(config.memory ?? {}),
      postgres: {
        ...(config.memory?.postgres ?? {}),
        connectionString: redactConnectionString(config.memory?.postgres?.connectionString ?? "")
      },
      redis: {
        ...(config.memory?.redis ?? {}),
        url: redactConnectionString(config.memory?.redis?.url ?? "")
      },
      cognitive: { ...(config.memory?.cognitive ?? {}) }
    }
  };
}

export function classifyRuntimeConfigPatch(patch = {}) {
  const appliedPatch = {};
  const appliedPaths = [];
  const restartRequiredPaths = [];
  const validationFailures = [];
  for (const [path, value] of flattenPatch(patch)) {
    if (isRestartRequiredPath(path)) {
      restartRequiredPaths.push(path);
      continue;
    }
    if (!isHotUpdatePath(path)) {
      validationFailures.push({ path, reason: "runtime_config_field_unsupported" });
      continue;
    }
    const validation = validateRuntimeConfigValue(path, value);
    if (!validation.valid) {
      validationFailures.push({ path, reason: validation.reason });
      continue;
    }
    setDeep(appliedPatch, path, value);
    appliedPaths.push(path);
  }
  return {
    appliedPatch,
    appliedPaths,
    restartRequiredPaths,
    validationFailures
  };
}

export function mergeGatewayProviderRole(base = {}, override = {}) {
  return {
    ...base,
    ...removeUndefined(override),
    structuredOutput: {
      ...(base.structuredOutput ?? {}),
      ...removeUndefined(override.structuredOutput ?? {})
    },
    health: {
      ...(base.health ?? {}),
      ...removeUndefined(override.health ?? {})
    }
  };
}

export function readBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return value === true || String(value).toLowerCase() === "true";
}

export function readNumber(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function redactProviderRole(role = {}) {
  return {
    ...(role ?? {}),
    endpoint: redactEndpoint(role?.endpoint ?? ""),
    chatPath: redactEndpoint(role?.chatPath ?? ""),
    embeddingPath: redactEndpoint(role?.embeddingPath ?? ""),
    token: "",
    tokenPresent: Boolean(role?.token)
  };
}

function validateRuntimeConfigValue(path, value) {
  if (path.endsWith(".timeoutMs") || path.endsWith(".cacheTtlMs")) {
    return Number.isFinite(Number(value)) && Number(value) >= 0
      ? { valid: true }
      : { valid: false, reason: "runtime_config_number_out_of_range" };
  }
  if (path.endsWith(".enabled") || path === "relationProposer.reuseExplainProvider" || path.endsWith(".strict")) {
    return typeof value === "boolean"
      ? { valid: true }
      : { valid: false, reason: "runtime_config_boolean_required" };
  }
  if (path.endsWith(".temperature")) {
    return Number.isFinite(Number(value))
      ? { valid: true }
      : { valid: false, reason: "runtime_config_number_required" };
  }
  if (path.endsWith(".structuredOutput.mode")) {
    return Object.values(StructuredOutputMode).includes(value)
      ? { valid: true }
      : { valid: false, reason: "runtime_config_structured_output_unsupported" };
  }
  if (path.startsWith("memory.cognitive.")) {
    const defaultValue = DEFAULT_CONFIG.memory.cognitive[path.replace("memory.cognitive.", "")];
    if (typeof defaultValue === "number") {
      return Number.isFinite(Number(value)) && Number(value) >= 0
        ? { valid: true }
        : { valid: false, reason: "runtime_config_number_out_of_range" };
    }
  }
  if (path === "memory.repository") {
    return ["sqlite", "memory", "layered"].includes(value)
      ? { valid: true }
      : { valid: false, reason: "runtime_config_memory_repository_unsupported" };
  }
  return { valid: true };
}

function isRestartRequiredPath(path = "") {
  return RESTART_REQUIRED_FIELDS.some((field) => path === field || path.startsWith(`${field}.`));
}

function isHotUpdatePath(path = "") {
  return HOT_UPDATE_FIELD_PREFIXES.some((field) => path === field || path.startsWith(`${field}.`));
}

function flattenPatch(value = {}, prefix = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [[prefix, value]];
  const entries = [];
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      entries.push(...flattenPatch(entry, path));
    } else {
      entries.push([path, entry]);
    }
  }
  return entries;
}

function setDeep(target, path, value) {
  const parts = path.split(".");
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    cursor[part] = cursor[part] && typeof cursor[part] === "object" ? cursor[part] : {};
    cursor = cursor[part];
  }
  cursor[parts.at(-1)] = value;
}

function removeUndefined(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function safeReadStorage(storage) {
  if (!storage?.read) return {};
  try {
    return storage.read() ?? {};
  } catch {
    return {};
  }
}

function safeWriteStorage(storage, value) {
  if (!storage?.write) return;
  try {
    storage.write(clone(value));
  } catch {
    // Runtime config remains hot-applied even if persistence is degraded.
  }
}

function redactEndpoint(endpoint = "") {
  if (!endpoint) return "";
  return String(endpoint).replace(/([?&][^=]*(?:token|secret|key|authorization)[^=]*=)[^&]*/gi, "$1<redacted>");
}

function redactConnectionString(value = "") {
  if (!value) return "";
  return String(value)
    .replace(/:\/\/([^:@/]+):([^@/]+)@/g, "://$1:<redacted>@")
    .replace(/:\/\/:([^@/]+)@/g, "://:<redacted>@")
    .replace(/([?&][^=]*(?:token|secret|key|password|authorization)[^=]*=)[^&]*/gi, "$1<redacted>");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}
