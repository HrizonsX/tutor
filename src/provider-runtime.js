// @ts-nocheck
// Provider Runtime boundary: provider dispatch, role/capability state, and
// per-call timeout handling. The HTTP gateway composes this runtime but never
// touches provider adapters directly.
import { DEFAULT_CONFIG } from "./config.js";
import {
  AgentCapability,
  AgentResultStatus,
  ProviderAdapter,
  ProviderKind,
  ProviderRole,
  StructuredOutputMode
} from "./contracts.js";
import { createProviderAdapterClient } from "./provider-adapters.js";
import { isTimeoutError, withAbortTimeout } from "./async-control.js";
import {
  DEFAULT_GATEWAY_PROVIDER_CONFIG,
  createGatewayRuntimeConfig,
  mergeGatewayProviderRole,
  normalizeRuntimeAdapter,
  normalizeRuntimeProviderMode
} from "./runtime-config.js";

export function createGatewayProviderRuntime({
  providerConfig = createGatewayRuntimeConfig(),
  configState = null,
  fetchImpl = globalThis.fetch,
  logger = null,
  now = () => Date.now(),
  config = DEFAULT_CONFIG
} = {}) {
  const staticRuntimeConfig = createGatewayRuntimeConfig({ providerConfig });
  const getRuntimeConfig = () => configState?.getEffectiveConfig?.() ?? staticRuntimeConfig;

  // The single dispatch path shared by every provider call: validate the role
  // config, build the adapter client, guard the method, race it against an
  // aborting timeout, and normalize every failure into a structured
  // UNAVAILABLE result.
  async function dispatchProviderCall({
    roleConfig,
    role,
    capabilityKind,
    methodName,
    timeoutReason,
    request,
    options = null,
    extraUnavailableFields = {}
  }) {
    const provider = buildRuntimeProvider(roleConfig, role, capabilityKind);
    const unavailable = validateRuntimeProvider(provider, capabilityKind);
    if (unavailable) return unavailable;
    const adapterClient = createProviderAdapterClient({
      provider,
      fetchImpl,
      token: provider.token,
      config,
      now,
      logger
    });
    const method = adapterClient?.[methodName];
    if (typeof method !== "function") {
      return unavailableRuntimeProvider("provider_adapter_unconfigured", capabilityKind, provider, extraUnavailableFields);
    }
    try {
      return await withAbortTimeout(
        (signal) => method.call(adapterClient, request, { ...(options ?? {}), signal }),
        { timeoutMs: provider.timeoutMs, reason: timeoutReason, parentSignal: options?.signal ?? null }
      );
    } catch (error) {
      return unavailableRuntimeProvider(
        isTimeoutError(error, timeoutReason) ? timeoutReason : "provider_unavailable",
        capabilityKind,
        provider,
        extraUnavailableFields
      );
    }
  }

  async function explain(request = {}) {
    return dispatchProviderCall({
      roleConfig: getRuntimeConfig().explain,
      role: ProviderRole.EXPLAIN,
      capabilityKind: AgentCapability.EXPLAIN,
      methodName: "explain",
      timeoutReason: "agent_timeout",
      request
    });
  }

  async function rewrite(request = {}) {
    return dispatchProviderCall({
      roleConfig: getRuntimeConfig().explain,
      role: ProviderRole.EXPLAIN,
      capabilityKind: AgentCapability.REWRITE,
      methodName: "rewrite",
      timeoutReason: "agent_timeout",
      request
    });
  }

  async function streamExplanation(request = {}, options = {}) {
    return dispatchProviderCall({
      roleConfig: getRuntimeConfig().explain,
      role: ProviderRole.EXPLAIN,
      capabilityKind: AgentCapability.EXPLAIN,
      methodName: "streamExplanation",
      timeoutReason: "agent_timeout",
      request,
      options
    });
  }

  async function suggestRelatedConceptHints(request = {}) {
    return dispatchProviderCall({
      roleConfig: getRuntimeConfig().explain,
      role: ProviderRole.EXPLAIN,
      capabilityKind: AgentCapability.EXPLAIN,
      methodName: "suggestRelatedConceptHints",
      timeoutReason: "agent_timeout",
      request
    });
  }

  async function createEmbedding(payload = {}) {
    return dispatchProviderCall({
      roleConfig: getRuntimeConfig().embedding,
      role: ProviderRole.EMBEDDING,
      capabilityKind: AgentCapability.EMBEDDING,
      methodName: "createEmbedding",
      timeoutReason: "embedding_timeout",
      request: payload,
      extraUnavailableFields: { vector: null }
    });
  }

  async function proposeRelations(request = {}) {
    return dispatchProviderCall({
      roleConfig: resolveRelationProposerRoleConfig(getRuntimeConfig()),
      role: ProviderRole.RELATION_PROPOSER,
      capabilityKind: AgentCapability.RELATION_PROPOSAL,
      methodName: "proposeRelations",
      timeoutReason: "relation_proposer_timeout",
      request
    });
  }

  return {
    explain,
    rewrite,
    streamExplanation,
    suggestRelatedConceptHints,
    createEmbedding,
    proposeRelations,
    configState,
    get capabilities() {
      return createRuntimeCapabilities(getRuntimeConfig());
    },
    get providerRoles() {
      return createRuntimeProviderRoleState(getRuntimeConfig());
    }
  };
}

export function buildRuntimeProvider(roleConfig = {}, role = ProviderRole.EXPLAIN, capability = AgentCapability.EXPLAIN) {
  return {
    role,
    mode: normalizeRuntimeProviderMode(roleConfig.provider),
    capability,
    adapter: normalizeRuntimeAdapter(roleConfig.adapter),
    endpoint: roleConfig.endpoint ?? "",
    token: roleConfig.token ?? "",
    modelName: roleConfig.modelName ?? "",
    chatPath: roleConfig.chatPath ?? "",
    embeddingPath: roleConfig.embeddingPath ?? "",
    structuredOutput: { ...(roleConfig.structuredOutput ?? {}) },
    timeoutMs: roleConfig.timeoutMs ?? 8000,
    enabled: Boolean(roleConfig.enabled)
  };
}

export function resolveRelationProposerRoleConfig(runtimeConfig = {}) {
  const relationConfig = mergeGatewayProviderRole(
    DEFAULT_GATEWAY_PROVIDER_CONFIG.relationProposer,
    runtimeConfig.relationProposer ?? {}
  );
  if (!relationConfig.reuseExplainProvider) return relationConfig;
  const explainConfig = mergeGatewayProviderRole(DEFAULT_GATEWAY_PROVIDER_CONFIG.explain, runtimeConfig.explain ?? {});
  return mergeGatewayProviderRole(explainConfig, {
    enabled: Boolean(relationConfig.enabled && explainConfig.enabled),
    reuseExplainProvider: true,
    structuredOutput: relationConfig.structuredOutput ?? DEFAULT_GATEWAY_PROVIDER_CONFIG.relationProposer.structuredOutput,
    timeoutMs: relationConfig.timeoutMs ?? explainConfig.timeoutMs,
    health: relationConfig.health ?? explainConfig.health
  });
}

export function validateRuntimeProvider(provider, capabilityKind) {
  if (!provider.enabled || provider.mode === ProviderKind.OFF) {
    const reason = provider.role === ProviderRole.EMBEDDING
      ? "embedding_provider_disabled"
      : provider.role === ProviderRole.RELATION_PROPOSER
        ? "relation_proposer_disabled"
        : "explain_provider_off";
    return unavailableRuntimeProvider(reason, capabilityKind, provider, provider.role === ProviderRole.EMBEDDING ? { vector: null } : {});
  }
  if (!provider.endpoint) {
    const reason = provider.role === ProviderRole.EMBEDDING
      ? "embedding_endpoint_unconfigured"
      : provider.role === ProviderRole.RELATION_PROPOSER
        ? "relation_proposer_endpoint_unconfigured"
        : "explain_endpoint_unconfigured";
    return unavailableRuntimeProvider(reason, capabilityKind, provider, provider.role === ProviderRole.EMBEDDING ? { vector: null } : {});
  }
  if (!provider.adapter) {
    return unavailableRuntimeProvider("provider_adapter_unconfigured", capabilityKind, provider, provider.role === ProviderRole.EMBEDDING ? { vector: null } : {});
  }
  if (provider.adapter === ProviderAdapter.INTERNAL_AGENT) {
    // No adapter client exists for the internal-agent mode: validating it as
    // available would advertise a capability that every dispatch then fails.
    return unavailableRuntimeProvider("provider_adapter_unconfigured", capabilityKind, provider, provider.role === ProviderRole.EMBEDDING ? { vector: null } : {});
  }
  if (provider.adapter === ProviderAdapter.OPENAI_COMPATIBLE) {
    if ((capabilityKind === AgentCapability.EXPLAIN || capabilityKind === AgentCapability.REWRITE || capabilityKind === AgentCapability.RELATION_PROPOSAL) && !provider.chatPath) {
      const reason = capabilityKind === AgentCapability.RELATION_PROPOSAL
        ? "relation_proposer_chat_path_unconfigured"
        : "explain_chat_path_unconfigured";
      return unavailableRuntimeProvider(reason, capabilityKind, provider);
    }
    if (capabilityKind === AgentCapability.EMBEDDING && !provider.embeddingPath) {
      return unavailableRuntimeProvider("embedding_path_unconfigured", capabilityKind, provider, { vector: null });
    }
    const mode = provider.structuredOutput?.mode ?? StructuredOutputMode.PROMPT_JSON;
    if ((provider.role === ProviderRole.EXPLAIN || provider.role === ProviderRole.RELATION_PROPOSER) && !Object.values(StructuredOutputMode).includes(mode)) {
      return unavailableRuntimeProvider("provider_model_unsupported", capabilityKind, provider);
    }
  }
  return null;
}

export function createRuntimeCapabilities(runtimeConfig = {}) {
  return {
    [AgentCapability.EXPLAIN]: isRuntimeRoleAvailable(runtimeConfig.explain, AgentCapability.EXPLAIN),
    [AgentCapability.STREAMING_EXPLANATION]: isRuntimeRoleAvailable(runtimeConfig.explain, AgentCapability.EXPLAIN),
    [AgentCapability.REWRITE]: isRuntimeRoleAvailable(runtimeConfig.explain, AgentCapability.REWRITE),
    [AgentCapability.EMBEDDING]: isRuntimeRoleAvailable(runtimeConfig.embedding, AgentCapability.EMBEDDING),
    [AgentCapability.RELATION_PROPOSAL]: isRuntimeRoleAvailable(
      resolveRelationProposerRoleConfig(runtimeConfig),
      AgentCapability.RELATION_PROPOSAL
    )
  };
}

function isRuntimeRoleAvailable(roleConfig = {}, capabilityKind) {
  const role = capabilityKind === AgentCapability.EMBEDDING
    ? ProviderRole.EMBEDDING
    : capabilityKind === AgentCapability.RELATION_PROPOSAL
      ? ProviderRole.RELATION_PROPOSER
      : ProviderRole.EXPLAIN;
  const provider = buildRuntimeProvider(roleConfig, role, capabilityKind);
  return !validateRuntimeProvider(provider, capabilityKind);
}

export function createRuntimeProviderRoleState(runtimeConfig = {}) {
  return {
    [ProviderRole.EXPLAIN]: runtimeRoleState(runtimeConfig.explain, ProviderRole.EXPLAIN),
    [ProviderRole.EMBEDDING]: runtimeRoleState(runtimeConfig.embedding, ProviderRole.EMBEDDING),
    [ProviderRole.RELATION_PROPOSER]: runtimeRoleState(
      resolveRelationProposerRoleConfig(runtimeConfig),
      ProviderRole.RELATION_PROPOSER
    )
  };
}

function runtimeRoleState(roleConfig = {}, role = ProviderRole.EXPLAIN) {
  const provider = buildRuntimeProvider(roleConfig, role, role === ProviderRole.EMBEDDING
    ? AgentCapability.EMBEDDING
    : role === ProviderRole.RELATION_PROPOSER
      ? AgentCapability.RELATION_PROPOSAL
      : AgentCapability.EXPLAIN);
  return {
    role,
    enabled: provider.enabled,
    mode: provider.mode,
    adapter: provider.adapter,
    endpoint: redactUrlPathForLog(provider.endpoint),
    chatPath: redactUrlPathForLog(provider.chatPath),
    embeddingPath: redactUrlPathForLog(provider.embeddingPath),
    structuredOutput: { ...(provider.structuredOutput ?? {}) },
    modelName: provider.modelName,
    tokenPresent: Boolean(provider.token),
    timeoutMs: provider.timeoutMs,
    reuseExplainProvider: Boolean(roleConfig.reuseExplainProvider),
    health: { ...(roleConfig.health ?? {}) }
  };
}

export function unavailableRuntimeProvider(reason, capabilityKind, provider = {}, extra = {}) {
  return {
    status: AgentResultStatus.UNAVAILABLE,
    reason,
    unavailableReason: reason,
    capabilityKind,
    providerRole: provider.role ?? null,
    providerMode: provider.mode ?? null,
    adapter: provider.adapter ?? null,
    modelName: provider.modelName ?? null,
    ...extra
  };
}

// Intentionally path-only: role state diagnostics never carry the endpoint
// host. Kept in sync with the gateway server's log redaction until the shared
// redact-util consolidation (P14).
function redactUrlPathForLog(value = "") {
  try {
    const parsed = new URL(String(value));
    for (const key of parsed.searchParams.keys()) {
      if (/token|secret|key|authorization/i.test(key)) {
        parsed.searchParams.set(key, "<redacted>");
      }
    }
    return `${parsed.pathname}${parsed.search}`.replaceAll("%3Credacted%3E", "<redacted>");
  } catch {
    return String(value).replace(/([?&][^=]*(?:token|secret|key|authorization)[^=]*=)[^&]*/gi, "$1<redacted>");
  }
}
