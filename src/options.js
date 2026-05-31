import {
  AgentCapability,
  AgentResultStatus,
  BackgroundMessageType,
  ProviderKind,
  ProviderRole
} from "./contracts.js";
import { BROWSER_CONFIG_STORAGE_KEY, DEFAULT_CONFIG, mergeConfig } from "./config.js";

export { BROWSER_CONFIG_STORAGE_KEY };

const SAMPLE_RUNTIME_SNAPSHOT = Object.freeze({
  overlay_active: true,
  current_context: {
    url: "https://dashboard.internal.corp/analytics",
    extracted_entities: 14,
    inferred_intent: "data_review"
  },
  local_model: {
    status: "loaded",
    vram_usage: "4.2GB",
    temperature: 0.2
  },
  event_queue_size: 0
});

const SAMPLE_DECISION_ROWS = Object.freeze([
  {
    id: "#DEC-092",
    timestamp: "14:02:11.405",
    trigger: "置信度 > 0.85",
    action: "高亮 DOM 节点",
    latency: "42ms",
    actionTone: "neutral"
  },
  {
    id: "#DEC-091",
    timestamp: "14:01:45.112",
    trigger: "语义匹配 (高)",
    action: "注入摘要徽章",
    latency: "115ms",
    actionTone: "neutral"
  },
  {
    id: "#DEC-090",
    timestamp: "13:58:22.001",
    trigger: "上下文歧义",
    action: "终止 (无动作)",
    latency: "18ms",
    actionTone: "danger"
  }
]);

const CAPABILITY_ROWS = Object.freeze([
  { key: "domRead", label: "DOM 读取", text: "可用", tone: "ok" },
  { key: "domWrite", label: "DOM 修改", text: "可用", tone: "ok" },
  { key: "networkIntercept", label: "网络拦截", text: "降级", tone: "danger" },
  { key: "indexedDb", label: "IndexedDB 访问", text: "可用", tone: "ok" }
]);

let latestViewModel = null;
let latestConfigSaveStatus = "";
const configSaveState = { inFlight: false };

export function buildOptionsViewModel({
  diagnostics = null,
  health = null,
  storageEstimate = null,
  latencyMs = null,
  indexedDbAvailable = true,
  now = () => Date.now()
} = {}) {
  const sampleMode = !diagnostics && !health;
  const providerRole = diagnostics?.providerRoles?.[ProviderRole.EXPLAIN]
    ?? health?.providerRoles?.[ProviderRole.EXPLAIN]
    ?? {};
  const providerHealth = diagnostics?.providerHealth ?? health ?? {};
  const providerMode = providerRole.mode ?? providerHealth.mode ?? diagnostics?.providerMode ?? ProviderKind.LOCAL;
  const providerSummary = sampleMode
    ? "本地 (llama-3-8b)"
    : formatProviderSummary(providerMode, providerRole.modelName || providerHealth.modelName);
  const healthStatus = providerHealth.status ?? health?.status ?? AgentResultStatus.UNAVAILABLE;
  const connectionAvailable = isAvailable(healthStatus);
  const connectionTone = sampleMode || connectionAvailable ? "steady" : "danger";
  const connectionSummary = sampleMode
    ? "稳定 (12ms 延迟)"
    : connectionAvailable
    ? `稳定 (${Number.isFinite(latencyMs) ? Math.max(0, Math.round(latencyMs)) : 12}ms 延迟)`
    : formatUnavailableReason(providerHealth.reason ?? health?.reason ?? "local_gateway_unreachable");

  const memoryRepository = health?.memoryRepository
    ?? diagnostics?.providerHealth?.memoryRepository
    ?? diagnostics?.memoryRepositoryStatus?.memoryRepository
    ?? diagnostics?.memoryRepositoryStatus
    ?? null;
  const memoryAvailable = sampleMode || memoryRepository?.status === "available" || isAvailable(memoryRepository?.status);
  const summarizer = memoryRepository?.summarizer ?? {};
  const cognitiveMemory = memoryRepository?.cognitiveMemory ?? {};
  const storage = formatStorageEstimate(storageEstimate, sampleMode);
  const vectorCount = sampleMode
    ? 4092
    : cognitiveMemory.conceptProjectionCount
      ?? cognitiveMemory.activeRelationCount
      ?? summarizer.processedEventCount
      ?? 0;
  const summarizerState = deriveSummarizerState(summarizer, sampleMode);

  return {
    provider: {
      text: providerSummary,
      tone: providerMode === ProviderKind.OFF ? "danger" : "ok"
    },
    connection: {
      text: connectionSummary,
      tone: connectionTone
    },
    domPermission: {
      text: "已授予",
      tone: "ok"
    },
    capabilities: CAPABILITY_ROWS.map((row) => {
      if (row.key === "indexedDb" && !indexedDbAvailable) {
        return { ...row, text: "降级", tone: "danger" };
      }
      return row;
    }),
    memory: {
      backend: {
        text: memoryRepository?.storeMode ?? memoryRepository?.mode ?? "unknown",
        tone: memoryAvailable ? "ok" : "danger"
      },
      architecture: {
        text: memoryAvailable ? "可用" : "降级",
        tone: memoryAvailable ? "ok" : "danger"
      },
      storage,
      vectorCount: {
        text: formatInteger(vectorCount),
        tone: vectorCount > 0 ? "danger" : "ok"
      },
      summarizer: summarizerState,
      layered: memoryRepository?.layered ? {
        postgres: { ...(memoryRepository.layered.postgres ?? {}) },
        redis: { ...(memoryRepository.layered.redis ?? {}) },
        vectorRecall: { ...(memoryRepository.layered.vectorRecall ?? {}) },
        outbox: { ...(memoryRepository.layered.outbox ?? {}) }
      } : null
    },
    decisions: buildDecisionRows(diagnostics, now),
    snapshot: sampleMode
      ? SAMPLE_RUNTIME_SNAPSHOT
      : {
          diagnostics,
          health
        }
  };
}

export function buildConfigFormModel({
  browserConfig = {},
  gatewayConfig = null
} = {}) {
  const effectiveBrowser = {
    featureEnabled: browserConfig.featureEnabled !== false,
    inference: { ...(browserConfig.inference ?? {}) },
    composer: { ...(browserConfig.composer ?? {}) },
    privacy: { ...(browserConfig.privacy ?? {}) },
    localGateway: { ...(browserConfig.localGateway ?? {}) }
  };
  const gateway = gatewayConfig?.config ?? {};
  return {
    browser: {
      featureEnabled: effectiveBrowser.featureEnabled,
      showThreshold: effectiveBrowser.inference.showThreshold ?? null,
      maxMicroChars: effectiveBrowser.composer.maxMicroChars ?? null,
      maxContextChars: effectiveBrowser.privacy.maxContextChars ?? null,
      localGateway: {
        endpoint: effectiveBrowser.localGateway.endpoint ?? "",
        timeoutMs: effectiveBrowser.localGateway.timeoutMs ?? null,
        pairingTokenPresent: Boolean(effectiveBrowser.localGateway.pairingToken)
      }
    },
    gateway: {
      provider: {
        enabled: Boolean(gateway.explain?.enabled),
        provider: gateway.explain?.provider ?? ProviderKind.OFF,
        adapter: gateway.explain?.adapter ?? "",
        endpoint: gateway.explain?.endpoint ?? "",
        modelName: gateway.explain?.modelName ?? "",
        tokenPresent: Boolean(gateway.explain?.tokenPresent),
        structuredOutput: { ...(gateway.explain?.structuredOutput ?? {}) },
        timeoutMs: gateway.explain?.timeoutMs ?? null
      },
      embedding: {
        enabled: Boolean(gateway.embedding?.enabled),
        provider: gateway.embedding?.provider ?? ProviderKind.OFF,
        endpoint: gateway.embedding?.endpoint ?? "",
        modelName: gateway.embedding?.modelName ?? "",
        tokenPresent: Boolean(gateway.embedding?.tokenPresent),
        timeoutMs: gateway.embedding?.timeoutMs ?? null
      },
      relationProposer: {
        enabled: Boolean(gateway.relationProposer?.enabled),
        reuseExplainProvider: gateway.relationProposer?.reuseExplainProvider !== false,
        provider: gateway.relationProposer?.provider ?? ProviderKind.OFF,
        endpoint: gateway.relationProposer?.endpoint ?? "",
        modelName: gateway.relationProposer?.modelName ?? "",
        tokenPresent: Boolean(gateway.relationProposer?.tokenPresent),
        timeoutMs: gateway.relationProposer?.timeoutMs ?? null
      },
      memory: {
        selectedDayLimit: gateway.memory?.cognitive?.selectedDayLimit ?? null,
        relationDepth: gateway.memory?.cognitive?.relationDepth ?? null,
        microBridgeLimit: gateway.memory?.cognitive?.microBridgeLimit ?? null,
        expandedBridgeLimit: gateway.memory?.cognitive?.expandedBridgeLimit ?? null,
        reportRelationLimit: gateway.memory?.cognitive?.reportRelationLimit ?? null
      },
      hotUpdateFields: Array.isArray(gatewayConfig?.hotUpdateFields) ? gatewayConfig.hotUpdateFields : [],
      restartRequiredFields: Array.isArray(gatewayConfig?.restartRequiredFields) ? gatewayConfig.restartRequiredFields : [],
      version: gatewayConfig?.version ?? null,
      lastUpdatedAt: gatewayConfig?.lastUpdatedAt ?? null,
      lastUpdateStatus: gatewayConfig?.lastUpdateStatus ?? null
    }
  };
}

export function createConfigUpdatePayload({ browser = {}, gateway = {} } = {}) {
  const browserPayload = {
    ...browser,
    localGateway: browser.localGateway ? { ...browser.localGateway } : undefined
  };
  const gatewayPayload = {
    ...gateway,
    explain: gateway.explain ? { ...gateway.explain } : undefined,
    embedding: gateway.embedding ? { ...gateway.embedding } : undefined,
    relationProposer: gateway.relationProposer ? { ...gateway.relationProposer } : undefined,
    memory: gateway.memory ? {
      ...gateway.memory,
      cognitive: { ...(gateway.memory.cognitive ?? gateway.memory) }
    } : undefined
  };
  return {
    browser: stripUndefined(browserPayload),
    gateway: stripUndefined(gatewayPayload)
  };
}

export function resolveConfigSaveStatus({ transientStatus = "", gatewayStatus = "" } = {}) {
  return transientStatus || gatewayStatus || "";
}

export async function runConfigSaveOnce(state, operation) {
  if (state?.inFlight) return { skipped: true };
  if (!state) state = { inFlight: false };
  state.inFlight = true;
  try {
    return { skipped: false, value: await operation() };
  } finally {
    state.inFlight = false;
  }
}

export async function saveConfigUpdate({
  payload,
  writeBrowserConfig: writeBrowser,
  updateBrowserRuntimeConfig: updateBrowserRuntime,
  updateRuntimeConfig: updateGatewayRuntime
}) {
  const browserResult = await writeBrowser(payload.browser);
  if (browserResult.status === AgentResultStatus.AVAILABLE) {
    await updateBrowserRuntime(payload.browser);
  }
  const gatewayResult = await updateGatewayRuntime(payload.gateway);
  return { browserResult, gatewayResult };
}

export function formatBytes(value = 0) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const precision = unitIndex <= 1 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
}

export function formatStorageEstimate(estimate = null, sampleMode = false) {
  if (sampleMode || !estimate || !Number.isFinite(estimate.usage) || !Number.isFinite(estimate.quota) || estimate.quota <= 0) {
    return {
      text: "12.4 MB / 50 MB",
      ratio: 24.8
    };
  }
  return {
    text: `${formatBytes(estimate.usage)} / ${formatBytes(estimate.quota)}`,
    ratio: clamp((estimate.usage / estimate.quota) * 100, 0, 100)
  };
}

function formatProviderSummary(mode, modelName = "") {
  const modeLabel = {
    [ProviderKind.LOCAL]: "本地",
    [ProviderKind.CLOUD]: "云端",
    [ProviderKind.CUSTOM]: "自定义",
    [ProviderKind.OFF]: "关闭"
  }[mode] ?? "本地";
  if (modelName) return `${modeLabel} (${modelName})`;
  if (mode === ProviderKind.LOCAL) return "本地 (local gateway)";
  return modeLabel;
}

function formatUnavailableReason(reason = "") {
  const normalized = String(reason);
  if (normalized.includes("unreachable")) return "离线 (网关不可达)";
  if (normalized.includes("pairing")) return "降级 (配对待确认)";
  if (normalized.includes("timeout")) return "降级 (请求超时)";
  if (normalized.includes("unsupported")) return "降级 (能力受限)";
  return "降级";
}

function deriveSummarizerState(summarizer = {}, sampleMode = false) {
  if (sampleMode) return { text: "空闲", tone: "ok", dotTone: "muted" };
  if (summarizer.status === "degraded" || summarizer.reason) {
    return { text: "降级", tone: "danger", dotTone: "danger" };
  }
  if ((summarizer.backlogSize ?? 0) > 0 || (summarizer.staleTargets ?? 0) > 0) {
    return { text: "排队", tone: "ok", dotTone: "warning" };
  }
  return { text: "空闲", tone: "ok", dotTone: "muted" };
}

function buildDecisionRows(diagnostics, now) {
  if (!diagnostics?.lastAgentResult && !diagnostics?.lastDecision) return SAMPLE_DECISION_ROWS.map((row) => ({ ...row }));
  const rows = [];
  const lastAgentResult = diagnostics.lastAgentResult;
  const lastDecision = diagnostics.lastDecision;
  const timestamp = lastAgentResult?.timestamp ?? lastDecision?.timestamp ?? now();
  if (lastAgentResult) {
    rows.push({
      id: formatDecisionId(timestamp),
      timestamp: formatClock(timestamp),
      trigger: lastDecision?.reasons?.[0] ?? lastDecision?.suppressionReasons?.[0] ?? lastAgentResult.target ?? lastAgentResult.reason ?? "运行结果",
      action: lastAgentResult.status === AgentResultStatus.AVAILABLE ? "显示解释" : "终止 (无动作)",
      latency: "--",
      actionTone: lastAgentResult.status === AgentResultStatus.AVAILABLE ? "neutral" : "danger"
    });
  }
  if (lastDecision) {
    rows.push({
      id: formatDecisionId(timestamp - 1),
      timestamp: formatClock(lastDecision.timestamp ?? timestamp),
      trigger: lastDecision.reasons?.[0] ?? lastDecision.suppressionReasons?.[0] ?? "策略评估",
      action: lastDecision.shouldShow ? "高亮 DOM 节点" : "终止 (无动作)",
      latency: "--",
      actionTone: lastDecision.shouldShow ? "neutral" : "danger"
    });
  }
  return rows.concat(SAMPLE_DECISION_ROWS).slice(0, 3);
}

function formatDecisionId(timestamp) {
  const suffix = String(Math.abs(Math.trunc(Number(timestamp) || 0)) % 1000).padStart(3, "0");
  return `#DEC-${suffix}`;
}

function formatClock(timestamp) {
  const date = new Date(Number(timestamp) || Date.now());
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${hours}:${minutes}:${seconds}.${ms}`;
}

function isAvailable(status) {
  return status === AgentResultStatus.AVAILABLE || status === "available";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatInteger(value) {
  return new Intl.NumberFormat("en-US").format(Number(value) || 0);
}

function stripUndefined(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

async function requestRuntimeState() {
  if (!globalThis.chrome?.runtime?.sendMessage) {
    return { diagnostics: null, health: null, latencyMs: null };
  }
  const startedAt = performance.now();
  const health = await sendMessage(BackgroundMessageType.GET_PROVIDER_HEALTH, { force: true });
  const latencyMs = performance.now() - startedAt;
  const diagnostics = await sendMessage(BackgroundMessageType.GET_DIAGNOSTICS, {});
  return { diagnostics, health, latencyMs };
}

async function requestRuntimeConfig() {
  if (!globalThis.chrome?.runtime?.sendMessage) return null;
  return sendMessage(BackgroundMessageType.GET_RUNTIME_CONFIG, {});
}

async function updateRuntimeConfig(config) {
  if (!globalThis.chrome?.runtime?.sendMessage) {
    return { status: AgentResultStatus.UNAVAILABLE, reason: "runtime_unavailable" };
  }
  return sendMessage(BackgroundMessageType.UPDATE_RUNTIME_CONFIG, { config });
}

async function updateBrowserRuntimeConfig(config) {
  if (!globalThis.chrome?.runtime?.sendMessage) {
    return { status: AgentResultStatus.UNAVAILABLE, reason: "runtime_unavailable" };
  }
  return sendMessage(BackgroundMessageType.UPDATE_BROWSER_CONFIG, { config });
}

function sendMessage(type, payload = {}) {
  return new Promise((resolve) => {
    try {
      globalThis.chrome.runtime.sendMessage({ type, payload }, (response) => resolve(response ?? null));
    } catch {
      resolve(null);
    }
  });
}

async function readStorageEstimate() {
  try {
    if (!navigator.storage?.estimate) return null;
    return await navigator.storage.estimate();
  } catch {
    return null;
  }
}

async function readBrowserConfig() {
  const storage = globalThis.chrome?.storage?.local;
  if (!storage?.get) return {};
  return new Promise((resolve) => {
    try {
      storage.get([BROWSER_CONFIG_STORAGE_KEY], (result) => resolve(result?.[BROWSER_CONFIG_STORAGE_KEY] ?? {}));
    } catch {
      resolve({});
    }
  });
}

async function writeBrowserConfig(config = {}) {
  const storage = globalThis.chrome?.storage?.local;
  if (!storage?.set) return { status: AgentResultStatus.UNAVAILABLE, reason: "browser_storage_unavailable" };
  const existingConfig = await readBrowserConfig();
  const nextConfig = mergeBrowserConfigForStorage(existingConfig, config);
  return new Promise((resolve) => {
    try {
      storage.set({ [BROWSER_CONFIG_STORAGE_KEY]: nextConfig }, () => resolve({ status: AgentResultStatus.AVAILABLE }));
    } catch (error) {
      resolve({
        status: AgentResultStatus.UNAVAILABLE,
        reason: "browser_storage_write_failed",
        details: { message: error?.message ?? String(error) }
      });
    }
  });
}

export function mergeBrowserConfigForStorage(existing = {}, patch = {}) {
  return mergePlainObject(existing, patch);
}

function mergePlainObject(existing = {}, patch = {}) {
  const output = { ...(isPlainObject(existing) ? existing : {}) };
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (value === undefined) continue;
    output[key] = isPlainObject(value) && isPlainObject(output[key])
      ? mergePlainObject(output[key], value)
      : value;
  }
  return output;
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function renderDashboard(viewModel) {
  latestViewModel = viewModel;
  setText("bco-provider-summary", viewModel.provider.text);
  setTone("bco-provider-dot", viewModel.provider.tone);
  setText("bco-connection-summary", viewModel.connection.text);
  setTone("bco-connection-dot", viewModel.connection.tone);
  setText("bco-dom-summary", viewModel.domPermission.text);

  renderCapabilities(viewModel.capabilities);
  setText("bco-memory-architecture", viewModel.memory.architecture.text);
  setPillTone("bco-memory-architecture", viewModel.memory.architecture.tone);
  setText("bco-storage-usage", viewModel.memory.storage.text);
  const track = document.getElementById("bco-storage-track");
  track?.style.setProperty("--bco-storage-ratio", `${viewModel.memory.storage.ratio}%`);
  setText("bco-vector-count", viewModel.memory.vectorCount.text);
  setPillTone("bco-vector-count", viewModel.memory.vectorCount.tone);
  setText("bco-summarizer-status", viewModel.memory.summarizer.text);
  setPillTone("bco-summarizer-status", viewModel.memory.summarizer.tone);
  setTone("bco-summarizer-dot", viewModel.memory.summarizer.dotTone);
  renderDecisionRows(viewModel.decisions);
  setText("bco-json-snapshot", JSON.stringify(viewModel.snapshot, null, 2));
}

function renderConfigConsole(model) {
  const section = ensureConfigConsole();
  if (!section) return;
  section.replaceChildren(
    configHeader(model),
    configGroup("General", [
      checkboxField("Enabled", "browser.featureEnabled", model.browser.featureEnabled),
      numberField("Show threshold", "browser.inference.showThreshold", model.browser.showThreshold, { min: 0, max: 1, step: 0.01 }),
      numberField("Max explanation chars", "browser.composer.maxMicroChars", model.browser.maxMicroChars, { min: 80, step: 10 }),
      numberField("Max context chars", "browser.privacy.maxContextChars", model.browser.maxContextChars, { min: 200, step: 100 })
    ]),
    configGroup("Local Gateway", [
      textField("Endpoint", "browser.localGateway.endpoint", model.browser.localGateway.endpoint),
      passwordField("Pairing token", "browser.localGateway.pairingToken", model.browser.localGateway.pairingTokenPresent),
      numberField("Timeout ms", "browser.localGateway.timeoutMs", model.browser.localGateway.timeoutMs, { min: 500, step: 500 })
    ]),
    configGroup("Provider", [
      checkboxField("Explain enabled", "gateway.explain.enabled", model.gateway.provider.enabled),
      textField("Provider mode", "gateway.explain.provider", model.gateway.provider.provider),
      textField("Adapter", "gateway.explain.adapter", model.gateway.provider.adapter),
      textField("Endpoint", "gateway.explain.endpoint", model.gateway.provider.endpoint),
      passwordField("Provider token", "gateway.explain.token", model.gateway.provider.tokenPresent),
      textField("Model", "gateway.explain.modelName", model.gateway.provider.modelName),
      numberField("Timeout ms", "gateway.explain.timeoutMs", model.gateway.provider.timeoutMs, { min: 500, step: 500 })
    ]),
    configGroup("Relation Proposer", [
      checkboxField("Enabled", "gateway.relationProposer.enabled", model.gateway.relationProposer.enabled),
      checkboxField("Reuse explain provider", "gateway.relationProposer.reuseExplainProvider", model.gateway.relationProposer.reuseExplainProvider),
      textField("Provider mode", "gateway.relationProposer.provider", model.gateway.relationProposer.provider),
      textField("Endpoint", "gateway.relationProposer.endpoint", model.gateway.relationProposer.endpoint),
      passwordField("Token", "gateway.relationProposer.token", model.gateway.relationProposer.tokenPresent),
      textField("Model", "gateway.relationProposer.modelName", model.gateway.relationProposer.modelName),
      numberField("Timeout ms", "gateway.relationProposer.timeoutMs", model.gateway.relationProposer.timeoutMs, { min: 500, step: 500 })
    ]),
    configGroup("Memory", [
      numberField("Selected day limit", "gateway.memory.cognitive.selectedDayLimit", model.gateway.memory.selectedDayLimit, { min: 0, step: 1 }),
      numberField("Relation depth", "gateway.memory.cognitive.relationDepth", model.gateway.memory.relationDepth, { min: 0, step: 1 }),
      numberField("Micro bridge limit", "gateway.memory.cognitive.microBridgeLimit", model.gateway.memory.microBridgeLimit, { min: 0, step: 1 }),
      numberField("Expanded bridge limit", "gateway.memory.cognitive.expandedBridgeLimit", model.gateway.memory.expandedBridgeLimit, { min: 0, step: 1 })
    ]),
    configActions(model)
  );
  section.querySelector("[data-config-save]")?.addEventListener("click", () => saveConfigConsole(section));
}

function ensureConfigConsole() {
  let section = document.getElementById("bco-config-console");
  if (section) return section;
  const main = document.querySelector?.(".bco-main");
  if (!main) return null;
  section = document.createElement("section");
  section.id = "bco-config-console";
  section.className = "bco-config-console";
  section.setAttribute("aria-label", "Runtime configuration");
  const jsonCard = document.querySelector?.(".bco-json-card");
  if (jsonCard && main.insertBefore) main.insertBefore(section, jsonCard);
  else main.append(section);
  return section;
}

function configHeader(model) {
  const header = document.createElement("div");
  header.className = "bco-config-header";
  const title = document.createElement("h3");
  title.textContent = "Runtime Config";
  const meta = document.createElement("span");
  meta.textContent = model.gateway.version ? `v${model.gateway.version}` : "not connected";
  header.append(title, meta);
  return header;
}

function configGroup(title, fields) {
  const group = document.createElement("div");
  group.className = "bco-config-group";
  const heading = document.createElement("h4");
  heading.textContent = title;
  const grid = document.createElement("div");
  grid.className = "bco-config-grid";
  grid.append(...fields);
  group.append(heading, grid);
  return group;
}

function textField(label, path, value = "") {
  return inputField(label, path, value, { type: "text" });
}

function passwordField(label, path, present = false) {
  const field = inputField(label, path, "", { type: "password", placeholder: present ? "configured" : "" });
  field.dataset.secret = "true";
  return field;
}

function numberField(label, path, value = "", options = {}) {
  return inputField(label, path, value ?? "", { type: "number", ...options });
}

function checkboxField(label, path, checked = false) {
  const wrapper = document.createElement("label");
  wrapper.className = "bco-config-field is-checkbox";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(checked);
  input.dataset.configPath = path;
  const span = document.createElement("span");
  span.textContent = label;
  wrapper.append(input, span);
  return wrapper;
}

function inputField(label, path, value = "", options = {}) {
  const wrapper = document.createElement("label");
  wrapper.className = "bco-config-field";
  const span = document.createElement("span");
  span.textContent = label;
  const input = document.createElement("input");
  input.type = options.type ?? "text";
  input.value = value ?? "";
  input.dataset.configPath = path;
  if (options.placeholder) input.placeholder = options.placeholder;
  for (const key of ["min", "max", "step"]) {
    if (options[key] !== undefined) input.setAttribute(key, String(options[key]));
  }
  wrapper.append(span, input);
  return wrapper;
}

function configActions(model) {
  const actions = document.createElement("div");
  actions.className = "bco-config-actions";
  const restart = document.createElement("span");
  restart.textContent = `Restart fields: ${(model.gateway.restartRequiredFields ?? []).join(", ") || "none"}`;
  const status = document.createElement("span");
  status.id = "bco-config-save-status";
  status.textContent = resolveConfigSaveStatus({
    transientStatus: latestConfigSaveStatus,
    gatewayStatus: model.gateway.lastUpdateStatus
  });
  const button = document.createElement("button");
  button.type = "button";
  button.className = "bco-export-button";
  button.dataset.configSave = "true";
  button.textContent = "Save config";
  actions.append(restart, status, button);
  return actions;
}

async function saveConfigConsole(section) {
  await runConfigSaveOnce(configSaveState, async () => {
    const status = document.getElementById("bco-config-save-status");
    const payload = createConfigUpdatePayload(collectConfigConsole(section));
    const { browserResult, gatewayResult } = await saveConfigUpdate({
      payload,
      writeBrowserConfig,
      updateBrowserRuntimeConfig,
      updateRuntimeConfig
    });
    const statusText = browserResult.status === AgentResultStatus.AVAILABLE && gatewayResult.status === AgentResultStatus.AVAILABLE
      ? "saved"
      : (gatewayResult.reason ?? browserResult.reason ?? "save_failed");
    latestConfigSaveStatus = statusText;
    if (status) {
      status.textContent = statusText;
    }
    await refreshConfigConsole();
    await refreshDashboard();
  });
}

function collectConfigConsole(section) {
  const values = {};
  for (const input of section.querySelectorAll("[data-config-path]")) {
    const path = input.dataset.configPath;
    if (!path) continue;
    if (input.type === "password" && !input.value) continue;
    if (input.type === "number" && input.value === "") continue;
    const value = input.type === "checkbox"
      ? input.checked
      : input.type === "number"
        ? Number(input.value)
        : input.value;
    setNested(values, path, value);
  }
  return {
    browser: values.browser ?? {},
    gateway: values.gateway ?? {}
  };
}

function setNested(target, dottedPath, value) {
  const parts = dottedPath.split(".");
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    cursor[part] = cursor[part] && typeof cursor[part] === "object" ? cursor[part] : {};
    cursor = cursor[part];
  }
  cursor[parts.at(-1)] = value;
}

function renderCapabilities(rows) {
  const list = document.getElementById("bco-capability-list");
  if (!list) return;
  list.replaceChildren(...rows.map((row, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = `bco-matrix-row${index === rows.length - 1 ? " bco-matrix-row-last" : ""}`;

    const label = document.createElement("span");
    label.textContent = row.label;

    const pill = document.createElement("span");
    pill.className = `bco-pill ${pillClass(row.tone)}`;
    pill.textContent = row.text;

    wrapper.append(label, pill);
    return wrapper;
  }));
}

function renderDecisionRows(rows) {
  const tbody = document.getElementById("bco-decision-rows");
  if (!tbody) return;
  tbody.replaceChildren(...rows.map((row) => {
    const tr = document.createElement("tr");
    tr.append(
      tableCell(row.id, "bco-mono"),
      tableCell(row.timestamp, "bco-muted-mono"),
      tableCell(row.trigger, "bco-trigger"),
      actionCell(row.action, row.actionTone),
      tableCell(row.latency, "bco-latency is-right")
    );
    return tr;
  }));
}

function tableCell(text, className = "") {
  const td = document.createElement("td");
  if (className) td.className = className;
  td.textContent = text;
  return td;
}

function actionCell(text, tone = "neutral") {
  const td = document.createElement("td");
  const pill = document.createElement("span");
  pill.className = tone === "danger" ? "bco-pill is-soft-danger" : "bco-pill is-neutral";
  pill.textContent = text;
  td.append(pill);
  return td;
}

function setText(id, text) {
  const node = document.getElementById(id);
  if (node) node.textContent = text;
}

function setTone(id, tone = "ok") {
  const node = document.getElementById(id);
  if (!node) return;
  node.classList.remove("is-ok", "is-steady", "is-warning", "is-danger", "is-muted");
  node.classList.add(`is-${tone}`);
}

function setPillTone(id, tone = "ok") {
  const node = document.getElementById(id);
  if (!node) return;
  node.classList.remove("is-ok", "is-danger");
  node.classList.add(pillClass(tone).replace(".", ""));
}

function pillClass(tone = "ok") {
  return tone === "danger" ? "is-danger" : "is-ok";
}

async function refreshDashboard() {
  const [{ diagnostics, health, latencyMs }, storageEstimate] = await Promise.all([
    requestRuntimeState(),
    readStorageEstimate()
  ]);
  renderDashboard(buildOptionsViewModel({
    diagnostics,
    health,
    storageEstimate,
    latencyMs,
    indexedDbAvailable: "indexedDB" in globalThis
  }));
}

async function refreshConfigConsole() {
  const [browserStoredConfig, gatewayConfig] = await Promise.all([
    readBrowserConfig(),
    requestRuntimeConfig()
  ]);
  renderConfigConsole(buildConfigFormModel({
    browserConfig: mergeConfig(DEFAULT_CONFIG, browserStoredConfig),
    gatewayConfig
  }));
}

function exportSnapshot() {
  const snapshot = latestViewModel?.snapshot ?? SAMPLE_RUNTIME_SNAPSHOT;
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `bco-diagnostics-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function initOptionsPage() {
  renderDashboard(buildOptionsViewModel());
  document.getElementById("bco-export-config")?.addEventListener("click", exportSnapshot);
  refreshDashboard();
  refreshConfigConsole();
  setInterval(refreshDashboard, 15_000);
}

if (typeof document !== "undefined") {
  initOptionsPage();
}
