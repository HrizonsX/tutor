// @ts-nocheck
// Thin HTTP boundary for the local gateway: authorization, request guards,
// the route table, JSON serialization, HTTP status mapping, server lifecycle,
// and redacted logging. Endpoint behavior lives in the Local Agent Runtime
// (local-agent-runtime.js), provider dispatch in the Provider Runtime
// (provider-runtime.js), and store access in the Memory Runtime
// (memory-runtime.js).
import {
  AgentCapability,
  AgentResultStatus,
  StreamEventType
} from "../shared/contracts.js";
import { createLocalAgentRuntime } from "./local-agent-runtime.js";
// Intentionally path-only: request logs never carry the endpoint host.
import { redactUrlPathForLog } from "../shared/redact-util.js";
import { timingSafeEqual } from "node:crypto";
import { inspect } from "node:util";

// Compatibility exports: tests and scripts historically import these from the
// gateway module. They re-export from the runtime modules that own them now.
export {
  createLocalMemoryStore,
  createPersistentLocalMemoryStore,
  createMemoryRepositoryFromRuntimeConfig,
  createMemoryRuntime,
  resolveDefaultLocalMemoryStorePath
} from "./memory-runtime.js";
export { createGatewayProviderRuntime } from "./provider-runtime.js";
export { createLocalAgentRuntime } from "./local-agent-runtime.js";
export { DEFAULT_GATEWAY_PROVIDER_CONFIG, createGatewayRuntimeConfig } from "./runtime-config.js";

export function createLocalGatewayHandler({
  token = "",
  allowUnauthenticated = false,
  maxBodyBytes = DEFAULT_MAX_REQUEST_BODY_BYTES,
  allowedOrigins = [],
  agentRuntime = null,
  store = undefined,
  capabilities = {},
  explainHandler = null,
  rewriteHandler = null,
  embeddingHandler = null,
  providerRuntime = null,
  runtimeConfigState = null,
  onProviderRouteChange = null,
  now = () => Date.now()
} = {}) {
  // Compatibility shim: the historical signature passes the store and
  // provider pieces directly. Assemble a Local Agent Runtime from them when
  // the caller does not provide one.
  const runtime = agentRuntime ?? createLocalAgentRuntime({
    store,
    capabilities,
    explainHandler,
    rewriteHandler,
    embeddingHandler,
    providerRuntime,
    runtimeConfigState,
    now
  });

  return async function handleLocalGatewayRequest(request = {}) {
    const method = request.method ?? "GET";
    const url = new URL(request.url ?? "http://127.0.0.1/");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (!isAuthorized(request, token, allowUnauthenticated)) {
      return jsonResponse({ status: AgentResultStatus.UNAVAILABLE, reason: "local_gateway_pairing_rejected" }, 401);
    }
    const guardRejection = evaluateGatewayRequestGuards({
      method,
      path,
      headers: request.headers ?? {},
      body: request.body,
      maxBodyBytes,
      allowedOrigins
    });
    if (guardRejection) {
      return jsonResponse({ status: AgentResultStatus.UNAVAILABLE, reason: guardRejection.reason }, guardRejection.status);
    }

    if (path === "/health") {
      return jsonResponse(runtime.getHealth());
    }

    if (path === "/config" && method === "GET") {
      const config = runtime.readConfig();
      if (config === null) {
        return jsonResponse({ status: AgentResultStatus.UNAVAILABLE, reason: "runtime_config_unavailable" }, 503);
      }
      return jsonResponse(config);
    }

    if (method !== "POST") {
      return jsonResponse({ status: AgentResultStatus.UNAVAILABLE, reason: "method_not_allowed" }, 405);
    }

    const body = await readBody(request);
    if (path === "/config") {
      const result = runtime.updateConfig(body);
      if (result === null) {
        return jsonResponse({ status: AgentResultStatus.UNAVAILABLE, reason: "runtime_config_unavailable" }, 503);
      }
      notifyProviderRouteChange(onProviderRouteChange, result, runtime.runtimeConfigState);
      return jsonResponse(result, result.status === AgentResultStatus.INVALID ? 400 : 200);
    }
    if (path === "/explain") {
      return jsonResponse(await runtime.explain(body));
    }
    if (path === "/explain/stream-session") {
      return jsonLineStreamResponse(runtime.streamExplainSession(body, { signal: request.signal ?? null }));
    }
    if (path === "/rewrite") {
      return jsonResponse(await runtime.rewrite(body));
    }
    if (path === "/embedding") {
      if (runtime.hasEmbeddingProvider()) {
        return jsonResponse(await runtime.createEmbedding(body));
      }
      if (!runtime.capabilities[AgentCapability.EMBEDDING]) {
        return jsonResponse(unavailableCapability(AgentCapability.EMBEDDING));
      }
    }
    if (path === "/memory/events") {
      const result = await runtime.writeMemoryEvents(body);
      return jsonResponse(result, result?.status === AgentResultStatus.UNAVAILABLE ? 503 : 200);
    }
    if (path === "/memory/query") {
      const result = await runtime.queryMemory(body);
      return jsonResponse(result, result?.status === AgentResultStatus.UNAVAILABLE ? 503 : 200);
    }

    return jsonResponse({ status: AgentResultStatus.UNAVAILABLE, reason: "provider_capability_unsupported" }, 404);
  };
}

export async function startLocalGatewayServer({
  host = "127.0.0.1",
  port = 17321,
  handler = createLocalGatewayHandler(),
  logger = null,
  maxBodyBytes = DEFAULT_MAX_REQUEST_BODY_BYTES
} = {}) {
  const { createServer } = await import("node:http");
  const server = createServer(async (req, res) => {
    const startedAt = Date.now();
    const startedAtIso = new Date(startedAt).toISOString();
    const requestUrl = `http://${host}:${port}${req.url}`;
    const method = req.method ?? "GET";
    const path = redactUrlPathForLog(requestUrl);
    // End-to-end cancellation: when the browser disconnects mid-response the
    // abort propagates through the handler into streaming lanes and provider
    // calls instead of letting them run to completion unobserved.
    const requestController = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) {
        requestController.abort();
        logGatewayServer(logger, "info", "request_cancelled", {
          method,
          path,
          startedAt: startedAtIso,
          cancelledAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt
        });
      }
    });
    const chunks = [];
    let receivedBodyBytes = 0;
    let rejectedTooLarge = false;
    req.on("data", (chunk) => {
      if (rejectedTooLarge) return;
      receivedBodyBytes += chunk.length;
      if (receivedBodyBytes > maxBodyBytes) {
        // Reject once, drop buffered chunks, and stop the upload. The flag
        // also keeps the "end" listener from writing a second response head.
        rejectedTooLarge = true;
        chunks.length = 0;
        res.writeHead(413, { "content-type": "application/json" });
        res.end(JSON.stringify({
          status: AgentResultStatus.UNAVAILABLE,
          reason: "request_body_too_large"
        }), () => req.destroy());
        logGatewayServer(logger, "warn", "request_finish", {
          method,
          path,
          status: 413,
          startedAt: startedAtIso,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt
        });
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", async () => {
      if (rejectedTooLarge) return;
      const body = Buffer.concat(chunks).toString("utf8");
      try {
        const response = await handler({
          method,
          url: requestUrl,
          headers: req.headers,
          body,
          signal: requestController.signal
        });
        res.writeHead(response.status, response.headers);
        if (isAsyncIterable(response.body)) {
          for await (const chunk of response.body) {
            logStreamChunk(logger, requestUrl, chunk);
            try {
              res.write(typeof chunk === "string" || Buffer.isBuffer(chunk) ? chunk : JSON.stringify(chunk));
            } catch {
              // The socket went away mid-stream: stop producing instead of
              // throwing past headers that were already sent.
              requestController.abort();
              break;
            }
            if (requestController.signal.aborted) break;
          }
          res.end();
        } else {
          res.end(response.body);
        }
        logGatewayServer(logger, response.ok ? "info" : "warn", "request_finish", {
          method,
          path,
          status: response.status,
          startedAt: startedAtIso,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt
        });
        logExplainResult(logger, requestUrl, response);
      } catch (error) {
        if (!res.headersSent) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({
            status: AgentResultStatus.UNAVAILABLE,
            reason: "local_gateway_handler_failed"
          }));
        } else {
          // Headers already went out (mid-stream failure): destroying the
          // socket is the only honest signal left.
          res.destroy();
        }
        logGatewayServer(logger, "warn", "request_error", {
          method,
          path,
          status: 500,
          startedAt: startedAtIso,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
          message: error?.message ?? String(error)
        });
      }
    });
  });

  await new Promise((resolve) => server.listen(port, host, resolve));
  return server;
}

function unavailableCapability(capabilityKind) {
  return {
    status: AgentResultStatus.UNAVAILABLE,
    reason: "provider_capability_unsupported",
    capabilityKind
  };
}

function isAuthorized(request, token, allowUnauthenticated = false) {
  if (!token) return allowUnauthenticated === true;
  const headers = request.headers ?? {};
  const headerValue = readHeaderValue(headers, "x-bco-pairing-token");
  const authorization = readHeaderValue(headers, "authorization");
  if (typeof headerValue === "string" && constantTimeEquals(headerValue, token)) return true;
  return typeof authorization === "string" && constantTimeEquals(authorization, `Bearer ${token}`);
}

function constantTimeEquals(left, right) {
  const leftBuffer = Buffer.from(String(left), "utf8");
  const rightBuffer = Buffer.from(String(right), "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export const DEFAULT_MAX_REQUEST_BODY_BYTES = 1024 * 1024;

// Request guards are small composable functions owned by this thin HTTP
// layer; they run after authorization and before route dispatch.
export function isAllowedGatewayOrigin(origin, allowedOrigins = []) {
  if (origin === undefined || origin === null || origin === "") return true;
  const value = String(origin);
  if (value === "null") return true;
  if (/^(chrome|moz)-extension:\/\//.test(value)) return true;
  return allowedOrigins.includes(value);
}

export function evaluateGatewayRequestGuards({
  method = "GET",
  path = "/",
  headers = {},
  body = null,
  maxBodyBytes = DEFAULT_MAX_REQUEST_BODY_BYTES,
  allowedOrigins = []
} = {}) {
  const origin = readHeaderValue(headers, "origin");
  if ((method !== "GET" || path === "/config") && !isAllowedGatewayOrigin(origin, allowedOrigins)) {
    return { status: 403, reason: "forbidden_origin" };
  }
  if (method === "POST" && typeof body === "string" && body.length > 0) {
    if (Buffer.byteLength(body, "utf8") > maxBodyBytes) {
      return { status: 413, reason: "request_body_too_large" };
    }
    const contentType = String(readHeaderValue(headers, "content-type") ?? "").toLowerCase();
    if (!contentType.includes("application/json")) {
      return { status: 415, reason: "unsupported_content_type" };
    }
  }
  return null;
}

const PROVIDER_ROUTE_CHANGE_PATH_PATTERN = /^(explain|embedding|relationProposer)\.(endpoint|token|adapter|provider)$/;

// Audit hook for /config provider route rewrites. The payload is restricted to
// role + endpoint host + token presence: never the token value and never a
// full URL that could carry query-string secrets.
function notifyProviderRouteChange(onProviderRouteChange, result, configState) {
  if (typeof onProviderRouteChange !== "function") return;
  if (result?.status !== AgentResultStatus.AVAILABLE) return;
  const changedRoles = new Set((result.appliedPaths ?? [])
    .map((path) => PROVIDER_ROUTE_CHANGE_PATH_PATTERN.exec(path)?.[1])
    .filter(Boolean));
  if (changedRoles.size === 0) return;
  const effective = configState?.getEffectiveConfig?.() ?? {};
  for (const role of changedRoles) {
    const roleConfig = effective?.[role] ?? {};
    try {
      onProviderRouteChange({
        role,
        endpointHost: extractEndpointHostForAudit(roleConfig.endpoint ?? ""),
        tokenPresent: Boolean(roleConfig.token)
      });
    } catch {
      // Audit hooks are observability only and must never break /config.
    }
  }
}

function extractEndpointHostForAudit(endpoint = "") {
  if (!endpoint) return "";
  try {
    // URL.host excludes userinfo, path, and query, so it cannot leak secrets.
    return new URL(String(endpoint)).host;
  } catch {
    return "";
  }
}

export function createProviderRouteChangeAuditLogger(logger) {
  return (change = {}) => {
    logGatewayServer(logger, "info", "config_provider_route_changed", {
      role: change.role ?? null,
      endpointHost: change.endpointHost ?? "",
      tokenPresent: Boolean(change.tokenPresent)
    });
  };
}

function readHeaderValue(headers = {}, name) {
  const target = String(name).toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === target) return value;
  }
  return undefined;
}

async function readBody(request) {
  if (!request.body) return {};
  if (typeof request.body === "string") {
    try {
      return JSON.parse(request.body);
    } catch {
      return {};
    }
  }
  if (typeof request.json === "function") return request.json();
  return {};
}

function jsonResponse(body, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    json: async () => body
  };
}

function logGatewayServer(logger, level, event, details = {}) {
  if (!logger) return;
  const log = logger[level] ?? logger.log;
  if (typeof log !== "function") return;
  const enrichedDetails = enrichGatewayLogDetails(event, details);
  log.call(logger, `[BCO][local-gateway-server] ${event}`, formatLogDetailsForLogger(logger, event, enrichedDetails));
}

function jsonLineStreamResponse(events, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store"
    },
    body: mapAsyncIterable(events, (event) => `${JSON.stringify(event)}\n`)
  };
}

async function* mapAsyncIterable(iterable, mapper) {
  for await (const item of iterable) {
    yield mapper(item);
  }
}

function isAsyncIterable(value) {
  return value && typeof value[Symbol.asyncIterator] === "function";
}

function enrichGatewayLogDetails(event, details = {}) {
  const summary = details.summary ?? summarizeGatewayLogEvent(event, details);
  return summary ? { summary, ...details } : details;
}

function summarizeGatewayLogEvent(event, details = {}) {
  if (event === "request_start") return `${details.method ?? "HTTP"} ${details.path ?? ""} started`;
  if (event === "request_finish") {
    const timestamp = details.startedAt ? `${details.startedAt} ` : "";
    return `${timestamp}${details.method ?? "HTTP"} ${details.path ?? ""} -> ${details.status ?? "unknown"} in ${details.durationMs ?? "?"}ms`;
  }
  if (event === "request_error") {
    const timestamp = details.startedAt ? `${details.startedAt} ` : "";
    return `${timestamp}${details.method ?? "HTTP"} ${details.path ?? ""} failed: ${details.message ?? details.reason ?? "handler_error"}`;
  }
  if (event === "explain_result" || event === "rewrite_result") {
    const kind = event === "rewrite_result" ? "rewrite" : "explain";
    return summarizeExplanationLog(kind, details);
  }
  if (event === "stream_session_start") {
    return `stream ${details.sessionId ?? ""} started target=${details.target ?? "unknown"}`.trim();
  }
  if (event === "stream_lane_final") {
    const reason = details.reason ? ` reason=${details.reason}` : "";
    return `stream ${details.sessionId ?? ""} ${details.lane ?? "lane"} ${details.status ?? "unknown"}${reason}`.trim();
  }
  if (event === "stream_cancelled") {
    return `stream ${details.sessionId ?? ""} cancelled`;
  }
  return "";
}

function formatLogDetailsForLogger(logger, event, details = {}) {
  if (logger !== console) return details;
  if (event === "request_start" || event === "request_finish" || event === "request_error") {
    return details.summary ?? summarizeGatewayLogEvent(event, details);
  }
  return inspect(details, {
    depth: null,
    colors: true,
    compact: false,
    breakLength: 120
  });
}

function logExplainResult(logger, requestUrl, response) {
  if (!logger || !response?.ok) return;
  const path = getPathname(requestUrl);
  if (path !== "/explain" && path !== "/rewrite") return;
  const body = parseJsonForLog(response.body);
  const text = body?.explanation ?? body?.microExplanation ?? body?.text ?? "";
  if (!text) return;
  const kind = path === "/rewrite" ? "rewrite" : "explain";
  const details = {
    status: body.status ?? null,
    target: body.target?.canonicalName ?? body.target?.observedText ?? null,
    modelName: body.modelName ?? body.versionMetadata?.model ?? null,
    providerMode: body.providerMode ?? null,
    text: clampLogText(text, 500)
  };
  const memoryRecall = sanitizeMemoryRecallForLog(body?.runtimeDecision?.memoryRecall);
  const memoryRecallSummary = summarizeMemoryRecallForProductLog(memoryRecall);
  details.outcome = {
    kind,
    status: details.status,
    target: details.target,
    modelName: details.modelName,
    providerMode: details.providerMode,
    memoryDecision: memoryRecallSummary.decision,
    bridgeCount: memoryRecallSummary.bridgeCount
  };
  details.memoryRecallSummary = memoryRecallSummary;
  if (memoryRecall) details.memoryRecall = memoryRecall;
  details.summary = summarizeExplanationLog(kind, details);
  logGatewayServer(logger, "info", kind === "rewrite" ? "rewrite_result" : "explain_result", details);
}

function logStreamChunk(logger, requestUrl, chunk) {
  if (!logger || getPathname(requestUrl) !== "/explain/stream-session") return;
  try {
    const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk ?? "");
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (event.type === StreamEventType.SESSION_START) {
        logGatewayServer(logger, "info", "stream_session_start", {
          sessionId: event.sessionId ?? null,
          target: event.target?.canonicalName ?? event.target?.observedText ?? null,
          sequence: event.sequence ?? null
        });
      } else if (event.type === StreamEventType.LANE_FINAL || event.type === StreamEventType.LANE_ERROR) {
        const memoryRecall = sanitizeMemoryRecallForLog(event.result?.runtimeDecision?.memoryRecall);
        const memorySummary = summarizeMemoryRecallForProductLog(memoryRecall);
        logGatewayServer(logger, event.result?.status === AgentResultStatus.AVAILABLE ? "info" : "warn", "stream_lane_final", {
          sessionId: event.sessionId ?? null,
          lane: event.lane ?? null,
          status: event.result?.status ?? null,
          reason: event.result?.reason ?? event.result?.unavailableReason ?? null,
          target: event.result?.target?.canonicalName ?? event.result?.target?.observedText ?? null,
          sequence: event.sequence ?? null,
          memoryRecallSummary: memorySummary,
          summary: summarizeGatewayLogEvent("stream_lane_final", {
            sessionId: event.sessionId ?? null,
            lane: event.lane ?? null,
            status: event.result?.status ?? null,
            reason: event.result?.reason ?? event.result?.unavailableReason ?? null
          })
        });
      } else if (event.type === StreamEventType.SESSION_CANCELLED) {
        logGatewayServer(logger, "warn", "stream_cancelled", {
          sessionId: event.sessionId ?? null,
          sequence: event.sequence ?? null
        });
      }
    }
  } catch {
    // Streaming logs are diagnostic only and must never break the response.
  }
}

function summarizeExplanationLog(kind, details = {}) {
  const memory = details.memoryRecallSummary ?? summarizeMemoryRecallForProductLog(details.memoryRecall);
  const target = details.target ? ` ${details.target}` : "";
  const bridge = memory.bridgeNames?.length ? ` bridge=${memory.bridgeNames.join("|")}` : "";
  const rejected = memory.rejectedCandidateCount ? ` rejected=${memory.rejectedCandidateCount}` : "";
  const model = details.modelName ? ` model=${details.modelName}` : "";
  return `${kind}${target} ${details.status ?? "unknown"} | memory=${memory.decision}${bridge} candidates=${memory.relationCandidateCount} active=${memory.activeCandidateCount}${rejected}${model}`.trim();
}

function summarizeMemoryRecallForProductLog(memoryRecall = null) {
  const bridges = Array.isArray(memoryRecall?.bridges) ? memoryRecall.bridges : [];
  const preRecall = memoryRecall?.preRecall ?? {};
  const bridgeNames = bridges.map((bridge) => bridge.relatedConcept).filter(Boolean);
  const relationCandidateCount = Number(preRecall.relationCandidateCount ?? 0);
  const activeCandidateCount = Number(preRecall.activeCandidateCount ?? 0);
  const rejectedCandidateCount = Number(preRecall.rejectedCandidateCount ?? 0);
  const bridgeCount = Number(memoryRecall?.bridgeCount ?? bridges.length);
  const rejectReasons = Array.isArray(preRecall.gateRejectReasons) ? preRecall.gateRejectReasons.slice(0, 8) : [];
  let decision = "memory_not_used";
  if (bridgeCount > 0) decision = "bridge_used";
  else if (preRecall.reason) decision = preRecall.reason;
  else if (relationCandidateCount > 0 && activeCandidateCount === 0) decision = "all_candidates_rejected";
  else if (relationCandidateCount > 0) decision = "no_bridge_selected";
  else if (Number(preRecall.candidateBlockCount ?? 0) > 0) decision = "no_relation_candidates";
  return {
    decision,
    bridgeCount,
    bridgeNames,
    candidateBlockCount: Number(preRecall.candidateBlockCount ?? 0),
    relationCandidateCount,
    activeCandidateCount,
    rejectedCandidateCount,
    rejectReasons,
    rejectReasonText: preRecall.gateRejectReasonText ?? rejectReasons.join(",")
  };
}

function sanitizeMemoryRecallForLog(memoryRecall = null) {
  if (!memoryRecall || typeof memoryRecall !== "object") return null;
  const bridges = Array.isArray(memoryRecall.bridges) ? memoryRecall.bridges : [];
  if (bridges.length === 0 && !memoryRecall.preRecall) return null;
  return {
    status: memoryRecall.status ?? null,
    bridgeCount: Number(memoryRecall.bridgeCount ?? bridges.length),
    bridges: bridges.slice(0, 5).map((bridge) => ({
      relatedConcept: clampLogText(bridge.relatedConcept ?? "", 120),
      relationType: bridge.relationType ?? null,
      direction: bridge.direction ?? null,
      confidence: bridge.confidence ?? null,
      sourceRole: bridge.sourceRole ?? null,
      caution: bridge.caution ?? null
    })),
    preRecall: memoryRecall.preRecall ? {
      status: memoryRecall.preRecall.status ?? null,
      reason: memoryRecall.preRecall.reason ?? null,
      candidateBlockCount: Number(memoryRecall.preRecall.candidateBlockCount ?? 0),
      relationCandidateCount: Number(memoryRecall.preRecall.relationCandidateCount ?? 0),
      activeCandidateCount: Number(memoryRecall.preRecall.activeCandidateCount ?? 0),
      overlayEligibleCandidateCount: Number(memoryRecall.preRecall.overlayEligibleCandidateCount ?? 0),
      rejectedCandidateCount: Number(memoryRecall.preRecall.rejectedCandidateCount ?? 0),
      gateRejectReasons: Array.isArray(memoryRecall.preRecall.gateRejectReasons)
        ? memoryRecall.preRecall.gateRejectReasons.slice(0, 8).map((reason) => clampLogText(reason, 80))
        : [],
      gateRejectReasonText: clampLogText(memoryRecall.preRecall.gateRejectReasonText ?? "", 240),
      bridgeCount: Number(memoryRecall.preRecall.bridgeCount ?? 0)
    } : null,
    policy: memoryRecall.policy ? {
      relationDepth: memoryRecall.policy.relationDepth ?? null,
      maxBridgeCount: memoryRecall.policy.maxBridgeCount ?? null,
      memorySourceRole: memoryRecall.policy.memorySourceRole ?? null,
      caution: memoryRecall.policy.caution ?? null
    } : null
  };
}

function parseJsonForLog(value = "") {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getPathname(value = "") {
  try {
    return new URL(String(value)).pathname.replace(/\/+$/, "") || "/";
  } catch {
    return "";
  }
}

function clampLogText(value = "", limit = 500) {
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}...` : text;
}
