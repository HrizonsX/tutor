import test from "node:test";
import assert from "node:assert/strict";
import { createBackgroundService } from "../src/agent-service.js";
import { DEFAULT_CONFIG, mergeConfig } from "../src/config.js";
import {
  AgentCapability,
  AgentResultStatus,
  BackgroundMessageType,
  ProviderAdapter,
  ProviderErrorReason,
  ProviderKind,
  ProviderRole,
  StreamLane,
  StructuredOutputMode
} from "../src/contracts.js";
import {
  createGatewayProviderRuntime,
  createGatewayRuntimeConfig,
  createLocalGatewayHandler
} from "../src/local-gateway.js";
import {
  buildChatCompletionBody,
  buildStreamingChatCompletionBody,
  buildRelatedConceptHintsBody,
  buildRelationProposalBody,
  createOpenAICompatibleAdapter,
  joinProviderUrl
} from "../src/provider-adapters.js";
import {
  directStreamRequest,
  multiBridgeMemoryPacket,
  streamingTarget
} from "./fixtures/streaming-explanations.js";

const input = {
  target: {
    canonicalName: "Lagrange point",
    observedText: "Lagrange point",
    knowledgeType: "astronomy",
    factSensitivity: "stable"
  },
  minimalContext: {
    fragmentId: "p1",
    fragmentType: "paragraph",
    text: "A telescope can sit near a Lagrange point."
  },
  memorySummary: {
    priorExplanationCount: 1,
    relatedObjects: [{ canonicalName: "orbit" }]
  },
  profileHints: { preferredStyle: "concise" },
  requestedStyle: "concise"
};

function gatewayProviderConfig(overrides = {}) {
  return createGatewayRuntimeConfig({
    providerConfig: {
      explain: {
        enabled: true,
        provider: ProviderKind.CUSTOM,
        adapter: ProviderAdapter.OPENAI_COMPATIBLE,
        endpoint: "https://api.example/v1?token=secret",
        chatPath: "/chat/completions",
        token: "explain-token",
        modelName: "explain-model",
        structuredOutput: {
          enabled: true,
          mode: StructuredOutputMode.JSON_SCHEMA,
          schemaName: "bco_explanation_result"
        },
        ...overrides.explain
      },
      embedding: {
        enabled: true,
        provider: ProviderKind.CLOUD,
        adapter: ProviderAdapter.OPENAI_COMPATIBLE,
        endpoint: "https://api.example/v1",
        embeddingPath: "/embeddings",
        token: "embedding-token",
        modelName: "embedding-model",
        ...overrides.embedding
      }
    }
  });
}

function createGatewayBackedService({ providerFetch, providerConfig = gatewayProviderConfig(), now = () => 4000, gatewayRequests = [] } = {}) {
  const runtime = createGatewayProviderRuntime({
    providerConfig,
    fetchImpl: providerFetch,
    config: DEFAULT_CONFIG,
    now
  });
  const handler = createLocalGatewayHandler({
    token: "local-secret",
    providerRuntime: runtime,
    now
  });
  const service = createBackgroundService({
    config: mergeConfig(DEFAULT_CONFIG, {
      localGateway: {
        endpoint: "http://127.0.0.1:17321",
        pairingToken: "local-secret"
      }
    }),
    fetchImpl: async (url, options = {}) => {
      gatewayRequests.push({ url, options });
      return handler({ url, method: options.method, headers: options.headers, body: options.body });
    },
    now
  });
  return { service, gatewayRequests };
}

function createSseResponse(chunks = [], { status = 200 } = {}) {
  const encoder = new TextEncoder();
  return {
    ok: status >= 200 && status < 300,
    status,
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      }
    }),
    json: async () => ({})
  };
}

test("openai-compatible helper constructs provider URL and structured chat body", () => {
  const body = buildChatCompletionBody({
    target: input.target,
    minimalContext: input.minimalContext,
    memorySummary: input.memorySummary,
    constraints: { maxChars: 90 }
  }, {
    modelName: "explain-model",
    structuredOutput: {
      mode: StructuredOutputMode.JSON_SCHEMA,
      schemaName: "bco_explanation_result"
    }
  }, DEFAULT_CONFIG);

  assert.equal(joinProviderUrl("https://api.example/v1/", "/chat/completions"), "https://api.example/v1/chat/completions");
  assert.equal(body.model, "explain-model");
  assert.equal(body.response_format.type, "json_schema");
  assert.equal(body.response_format.json_schema.name, "bco_explanation_result");
  assert.match(body.messages[0].content, /浏览器阅读辅助解释 Agent/);
  assert.match(body.messages[0].content, /不得返回占位文本/);
  assert.match(body.messages[1].content, /Lagrange point/);
  assert.match(body.messages[1].content, /fieldGuide/);
  assert.match(body.messages[1].content, /knowledgeType 可为空/);
  assert.match(body.messages[1].content, /outputContract/);
  assert.doesNotMatch(body.messages[1].content, /short user-facing explanation string/);

  const jsonObjectBody = buildChatCompletionBody({}, {
    modelName: "explain-model",
    structuredOutput: { mode: StructuredOutputMode.JSON_OBJECT }
  }, DEFAULT_CONFIG);
  assert.deepEqual(jsonObjectBody.response_format, { type: "json_object" });

  const promptOnlyBody = buildChatCompletionBody({}, {
    modelName: "explain-model",
    structuredOutput: { mode: StructuredOutputMode.PROMPT_JSON }
  }, DEFAULT_CONFIG);
  assert.equal(promptOnlyBody.response_format, undefined);
});

test("openai-compatible helper constructs lane-specific plain-text streaming bodies", () => {
  const directBody = buildStreamingChatCompletionBody({
    ...directStreamRequest,
    memoryBridges: [{ relatedConcept: "Forged Browser Memory" }]
  }, {
    modelName: "stream-model",
    structuredOutput: { mode: StructuredOutputMode.JSON_SCHEMA }
  }, DEFAULT_CONFIG);
  const associationBody = buildStreamingChatCompletionBody({
    ...directStreamRequest,
    streamLane: StreamLane.ASSOCIATION,
    memoryBridges: multiBridgeMemoryPacket.memoryBridges
  }, {
    modelName: "stream-model",
    structuredOutput: { mode: StructuredOutputMode.JSON_SCHEMA }
  }, DEFAULT_CONFIG);
  const associationPayload = JSON.parse(associationBody.messages[1].content);

  assert.equal(directBody.model, "stream-model");
  assert.equal(directBody.stream, true);
  assert.equal(directBody.response_format, undefined);
  assert.match(directBody.messages[0].content, /direct explanation/i);
  assert.doesNotMatch(directBody.messages[1].content, /Forged Browser Memory/);
  assert.match(associationBody.messages[0].content, /relationship/i);
  assert.match(associationBody.messages[0].content, /local learning context/i);
  assert.match(associationBody.messages[0].content, /中文/);
  assert.equal(associationPayload.target.canonicalName, streamingTarget.canonicalName);
  assert.deepEqual(associationPayload.recalledConcepts.map((bridge) => bridge.relatedConcept), [
    "Changtai",
    "Putian",
    "Fujian"
  ]);
  assert.equal(associationPayload.overflowBridgeCount, 1);
  assert.equal(associationPayload.outputContract.language, "zh-CN");
  assert.equal(associationPayload.outputContract.mustEndWithConciseSummary, true);
});

test("openai-compatible helper constructs personalized related concept hint body", () => {
  const body = buildRelatedConceptHintsBody({
    ...directStreamRequest,
    directExplanation: "福建是中国东南沿海省份，莆田位于福建中部沿海。",
    profileSummary: {
      id: "profile_summary",
      debugMarker: "should_not_leak_daily_concept",
      interests: {
        recentConcepts: ["常太枇杷", "莆田"],
        knowledgeTypes: [{ name: "地理", count: 3 }]
      },
      hints: { preferredStyle: "concise" },
      userProfile: {
        kind: "user_preference_profile",
        version: "user-profile.v1",
        modelContext: {
          language: "zh-CN",
          summaryText: "用户偏好背景解释和低打扰提示。",
          metrics: {
            preferredStyle: "background",
            interventionLevel: "low",
            coarseInterestTypes: [{ name: "geography", eventCount: 3 }]
          }
        }
      }
    },
    constraints: { relatedConceptHintLimit: 20 }
  }, {
    modelName: "hint-model",
    structuredOutput: {
      mode: StructuredOutputMode.JSON_SCHEMA,
      schemaName: "bco_related_concept_hints"
    }
  }, DEFAULT_CONFIG);
  const payload = JSON.parse(body.messages[1].content);

  assert.equal(body.model, "hint-model");
  assert.equal(body.response_format.type, "json_schema");
  assert.equal(body.response_format.json_schema.name, "bco_related_concept_hints");
  assert.match(body.messages[0].content, /personalized related concept/i);
  assert.equal(payload.target.canonicalName, streamingTarget.canonicalName);
  assert.equal(payload.profileSummary.id, "profile_summary");
  assert.equal(payload.profileSummary.interests, undefined);
  assert.equal(payload.userProfileContext.summaryText, "用户偏好背景解释和低打扰提示。");
  assert.equal(payload.userProfileContext.metrics.interventionLevel, "low");
  assert.doesNotMatch(body.messages[1].content, /should_not_leak_daily_concept/);
  assert.equal(payload.outputContract.maxItems, 20);
  assert.equal(payload.outputContract.doNotCreateRelations, true);
});

test("openai-compatible adapter streams direct deltas and returns accumulated metadata", async () => {
  const providerRequests = [];
  const deltas = [];
  const adapter = createOpenAICompatibleAdapter({
    provider: {
      role: ProviderRole.EXPLAIN,
      mode: ProviderKind.CUSTOM,
      adapter: ProviderAdapter.OPENAI_COMPATIBLE,
      endpoint: "https://api.example/v1",
      chatPath: "/chat/completions",
      modelName: "stream-model"
    },
    token: "stream-token",
    config: DEFAULT_CONFIG,
    now: () => 5100,
    fetchImpl: async (url, options) => {
      providerRequests.push({ url, options });
      return createSseResponse([
        'data: {"choices":[{"delta":{"content":"Lo"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"quat"}}]}\n\n',
        "data: [DONE]\n\n"
      ]);
    }
  });

  const result = await adapter.streamExplanation(directStreamRequest, {
    lane: StreamLane.DIRECT,
    onDelta: (event) => deltas.push(event.text)
  });
  const body = JSON.parse(providerRequests[0].options.body);

  assert.deepEqual(deltas, ["Lo", "quat"]);
  assert.equal(body.stream, true);
  assert.equal(body.response_format, undefined);
  assert.equal(result.status, AgentResultStatus.AVAILABLE);
  assert.equal(result.text, "Loquat");
  assert.equal(result.microExplanation, "Loquat");
  assert.equal(result.versionMetadata.streamLane, StreamLane.DIRECT);
  assert.equal(result.versionMetadata.schema, "bco.explanation.stream.v1");
  assert.equal(result.modelName, "stream-model");
});

test("openai-compatible adapter returns normalized related concept hints", async () => {
  const providerRequests = [];
  const adapter = createOpenAICompatibleAdapter({
    provider: {
      role: ProviderRole.EXPLAIN,
      mode: ProviderKind.CUSTOM,
      adapter: ProviderAdapter.OPENAI_COMPATIBLE,
      endpoint: "https://api.example/v1",
      chatPath: "/chat/completions",
      modelName: "hint-model",
      structuredOutput: {
        mode: StructuredOutputMode.JSON_SCHEMA,
        schemaName: "bco_related_concept_hints"
      }
    },
    token: "hint-token",
    config: DEFAULT_CONFIG,
    fetchImpl: async (url, options) => {
      providerRequests.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          model: "hint-model",
          choices: [{
            message: {
              content: JSON.stringify({
                relatedConceptHints: [
                  { canonicalName: "莆田", score: 0.96, reason: "福建地理强相关" },
                  { canonicalName: "福建", score: 0.5 },
                  { canonicalName: "常太", score: 0.91 }
                ],
                versionMetadata: { id: "hints_1" }
              })
            }
          }]
        })
      };
    }
  });

  const result = await adapter.suggestRelatedConceptHints({
    ...directStreamRequest,
    target: { ...directStreamRequest.target, canonicalName: "福建" },
    directExplanation: "福建解释文本。",
    constraints: { relatedConceptHintLimit: 20 }
  });

  assert.equal(providerRequests.length, 1);
  assert.equal(result.status, AgentResultStatus.AVAILABLE);
  assert.deepEqual(result.relatedConceptHints.map((hint) => hint.canonicalName), ["莆田", "常太"]);
  assert.equal(result.relatedConceptHints[0].score, 0.96);
  assert.equal(result.versionMetadata.id, "hints_1");
});

test("openai-compatible adapter normalizes malformed streaming chunks", async () => {
  const adapter = createOpenAICompatibleAdapter({
    provider: {
      role: ProviderRole.EXPLAIN,
      mode: ProviderKind.CUSTOM,
      adapter: ProviderAdapter.OPENAI_COMPATIBLE,
      endpoint: "https://api.example/v1",
      chatPath: "/chat/completions",
      modelName: "stream-model"
    },
    config: DEFAULT_CONFIG,
    fetchImpl: async () => createSseResponse([
      "data: {not-json}\n\n"
    ])
  });

  const result = await adapter.streamExplanation(directStreamRequest, { lane: StreamLane.DIRECT });

  assert.equal(result.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(result.reason, ProviderErrorReason.STREAM_INVALID);
  assert.equal(result.capabilityKind, AgentCapability.EXPLAIN);
});

test("gateway routes openai-compatible explain requests and normalizes structured JSON", async () => {
  const providerRequests = [];
  const gatewayRequests = [];
  const { service } = createGatewayBackedService({
    gatewayRequests,
    providerFetch: async (url, options) => {
      providerRequests.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          model: "explain-model",
          choices: [{
            message: {
              content: JSON.stringify({
                explanation: "A Lagrange point is a stable orbital spot.",
                summary: "Stable orbital spot.",
                confidence: 0.82,
                terms: [{ term: "orbit" }],
                actions: [{ type: "show" }],
                versionMetadata: { id: "ver_structured", schema: "bco.explanation.v1" }
              })
            }
          }]
        })
      };
    }
  });

  const result = await service.handleMessage({
    type: BackgroundMessageType.EXPLAIN_KNOWLEDGE,
    payload: { input }
  });

  const body = JSON.parse(providerRequests[0].options.body);
  assert.equal(gatewayRequests[0].url, "http://127.0.0.1:17321/health");
  assert.equal(gatewayRequests[1].url, "http://127.0.0.1:17321/explain");
  assert.equal(providerRequests[0].url, "https://api.example/v1/chat/completions?token=secret");
  assert.equal(providerRequests[0].options.headers.authorization, "Bearer explain-token");
  assert.equal(body.model, "explain-model");
  assert.equal(body.response_format.type, "json_schema");
  assert.equal(result.status, AgentResultStatus.AVAILABLE);
  assert.equal(result.text, "A Lagrange point is a stable orbital spot.");
  assert.equal(result.explanation, "A Lagrange point is a stable orbital spot.");
  assert.equal(result.summary, "Stable orbital spot.");
  assert.equal(result.confidence, 0.82);
  assert.equal(result.terms[0].term, "orbit");
  assert.equal(result.actions[0].type, "show");
  assert.equal(result.versionMetadata.id, "ver_structured");
  assert.equal(result.versionMetadata.model, "explain-model");
});

test("openai-compatible adapter logs external provider calls without exposing secrets", async () => {
  const entries = [];
  const logger = {
    info: (message, details) => entries.push({ level: "info", message, details }),
    warn: (message, details) => entries.push({ level: "warn", message, details })
  };
  const adapter = createOpenAICompatibleAdapter({
    provider: {
      role: "explain",
      mode: ProviderKind.CUSTOM,
      adapter: ProviderAdapter.OPENAI_COMPATIBLE,
      endpoint: "https://api.example/v1?api_key=hidden",
      chatPath: "/chat/completions",
      modelName: "deepseek-chat",
      structuredOutput: { mode: StructuredOutputMode.JSON_SCHEMA }
    },
    token: "secret-token",
    config: DEFAULT_CONFIG,
    logger,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        model: "deepseek-chat",
        choices: [{ message: { content: JSON.stringify({ explanation: "A short explanation." }) } }]
      })
    })
  });

  const result = await adapter.explain({
    target: input.target,
    minimalContext: input.minimalContext
  });

  assert.equal(result.status, AgentResultStatus.AVAILABLE);
  assert.equal(entries[0].message, "[BCO][provider-adapter] request_start");
  assert.equal(entries[0].details.modelName, "deepseek-chat");
  assert.equal(entries[0].details.structuredOutputMode, StructuredOutputMode.JSON_SCHEMA);
  assert.match(entries[0].details.url, /api_key=<redacted>/);
  assert.doesNotMatch(JSON.stringify(entries), /secret-token|hidden|A short explanation/);
  assert.equal(entries.at(-1).message, "[BCO][provider-adapter] request_success");
});

test("gateway openai-compatible explain maps invalid JSON and schema failures", async () => {
  const invalidJson = await createGatewayBackedService({
    providerFetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "{not-json" } }] })
    })
  }).service.handleMessage({
    type: BackgroundMessageType.EXPLAIN_KNOWLEDGE,
    payload: { input }
  });
  assert.equal(invalidJson.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(invalidJson.reason, ProviderErrorReason.JSON_PARSE_FAILED);
  assert.equal(invalidJson.explanationVersion, null);

  const schemaInvalid = await createGatewayBackedService({
    providerFetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ summary: "missing explanation" }) } }] })
    })
  }).service.handleMessage({
    type: BackgroundMessageType.EXPLAIN_KNOWLEDGE,
    payload: { input: { ...input, requestedStyle: "background" } }
  });
  assert.equal(schemaInvalid.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(schemaInvalid.reason, ProviderErrorReason.SCHEMA_INVALID);
  assert.equal(schemaInvalid.explanationVersion, null);
});

test("gateway openai-compatible adapter normalizes provider HTTP failures", async () => {
  const cases = [
    [401, {}, ProviderErrorReason.AUTH_FAILED],
    [403, {}, ProviderErrorReason.AUTH_FAILED],
    [429, {}, ProviderErrorReason.RATE_LIMITED],
    [400, { error: { message: "response_format json_schema is unsupported" } }, ProviderErrorReason.MODEL_UNSUPPORTED],
    [503, {}, ProviderErrorReason.UNAVAILABLE]
  ];

  for (const [status, body, reason] of cases) {
    const { service } = createGatewayBackedService({
      providerConfig: gatewayProviderConfig({ explain: { modelName: `model-${status}` } }),
      providerFetch: async () => ({
        ok: false,
        status,
        json: async () => body
      })
    });
    const result = await service.handleMessage({
      type: BackgroundMessageType.EXPLAIN_KNOWLEDGE,
      payload: { input: { ...input, requestedStyle: `style-${status}` } }
    });
    assert.equal(result.status, AgentResultStatus.UNAVAILABLE);
    assert.equal(result.reason, reason);
  }
});

test("gateway openai-compatible embedding requests use configured path, token, and model", async () => {
  const providerRequests = [];
  const { service } = createGatewayBackedService({
    providerFetch: async (url, options) => {
      providerRequests.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          model: "embedding-model",
          data: [{ embedding: [0.1, 0.2, 0.3] }]
        })
      };
    }
  });

  const result = await service.handleMessage({
    type: BackgroundMessageType.CREATE_EMBEDDING,
    payload: { text: "summary", metadata: { canonicalName: "Lagrange point" } }
  });

  const body = JSON.parse(providerRequests[0].options.body);
  assert.equal(providerRequests[0].url, "https://api.example/v1/embeddings");
  assert.equal(providerRequests[0].options.headers.authorization, "Bearer embedding-token");
  assert.equal(body.model, "embedding-model");
  assert.equal(body.input, "summary");
  assert.equal(result.status, AgentResultStatus.AVAILABLE);
  assert.deepEqual(result.vector, [0.1, 0.2, 0.3]);
  assert.equal(result.model, "embedding-model");
});

test("gateway openai-compatible embedding rejects invalid vector envelopes", async () => {
  const { service } = createGatewayBackedService({
    providerFetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ embedding: ["bad"] }] })
    })
  });

  const result = await service.handleMessage({
    type: BackgroundMessageType.CREATE_EMBEDDING,
    payload: { text: "summary" }
  });

  assert.equal(result.status, AgentResultStatus.INVALID);
  assert.equal(result.reason, "invalid_embedding_response");
  assert.equal(result.vector, null);
});

test("openai-compatible adapter dispatches structured relation proposal requests", async () => {
  const providerRequests = [];
  const adapter = createOpenAICompatibleAdapter({
    provider: {
      role: ProviderRole.RELATION_PROPOSER,
      mode: ProviderKind.CUSTOM,
      adapter: ProviderAdapter.OPENAI_COMPATIBLE,
      endpoint: "https://relation.example/v1",
      chatPath: "/chat/completions",
      token: "relation-token",
      modelName: "relation-model",
      structuredOutput: {
        mode: StructuredOutputMode.JSON_SCHEMA,
        schemaName: "bco_relation_proposal_result"
      }
    },
    token: "relation-token",
    config: DEFAULT_CONFIG,
    fetchImpl: async (url, options) => {
      providerRequests.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          model: "relation-model",
          choices: [{
            message: {
              content: JSON.stringify({
                relationCandidates: [{
                  sourceCanonicalName: "Minnan",
                  relationType: "located_in",
                  targetCanonicalName: "Fujian Province",
                  sourceDate: "2026-05-18",
                  confidence: "medium",
                  basis: "provider_structured_relation",
                  usableForOverlay: true
                }],
                rejectedCandidates: [],
                versionMetadata: { proposerVersion: "unit" }
              })
            }
          }]
        })
      };
    }
  });

  const body = buildRelationProposalBody({
    targetConcept: { canonicalName: "Minnan" },
    dailyMemoryBlocks: [{ date: "2026-05-18", concepts: [{ canonicalName: "Fujian Province" }] }]
  }, {
    modelName: "relation-model",
    structuredOutput: { mode: StructuredOutputMode.JSON_SCHEMA }
  }, DEFAULT_CONFIG);
  const result = await adapter.proposeRelations({
    targetConcept: { canonicalName: "Minnan" },
    dailyMemoryBlocks: [{ date: "2026-05-18", concepts: [{ canonicalName: "Fujian Province" }] }]
  });
  const providerBody = JSON.parse(providerRequests[0].options.body);

  assert.equal(body.response_format.json_schema.name, "bco_relation_proposal_result");
  assert.equal(providerRequests[0].url, "https://relation.example/v1/chat/completions");
  assert.equal(providerRequests[0].options.headers.authorization, "Bearer relation-token");
  assert.equal(providerBody.response_format.json_schema.name, "bco_relation_proposal_result");
  assert.equal(result.status, AgentResultStatus.AVAILABLE);
  assert.equal(result.relationCandidates[0].targetCanonicalName, "Fujian Province");
  assert.equal(result.versionMetadata.proposerVersion, "unit");
});

test("relation proposal adapter returns structured parse and schema failures", async () => {
  const invalidJson = createOpenAICompatibleAdapter({
    provider: {
      role: ProviderRole.RELATION_PROPOSER,
      mode: ProviderKind.CUSTOM,
      adapter: ProviderAdapter.OPENAI_COMPATIBLE,
      endpoint: "https://relation.example/v1",
      chatPath: "/chat/completions",
      modelName: "relation-model",
      structuredOutput: { mode: StructuredOutputMode.JSON_SCHEMA }
    },
    config: DEFAULT_CONFIG,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "{not-json" } }] })
    })
  });
  const schemaInvalid = createOpenAICompatibleAdapter({
    provider: {
      role: ProviderRole.RELATION_PROPOSER,
      mode: ProviderKind.CUSTOM,
      adapter: ProviderAdapter.OPENAI_COMPATIBLE,
      endpoint: "https://relation.example/v1",
      chatPath: "/chat/completions",
      modelName: "relation-model",
      structuredOutput: { mode: StructuredOutputMode.JSON_SCHEMA }
    },
    config: DEFAULT_CONFIG,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ relationCandidates: [] }) } }] })
    })
  });

  const invalidJsonResult = await invalidJson.proposeRelations({ targetConcept: { canonicalName: "Minnan" } });
  const schemaInvalidResult = await schemaInvalid.proposeRelations({ targetConcept: { canonicalName: "Minnan" } });

  assert.equal(invalidJsonResult.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(invalidJsonResult.reason, ProviderErrorReason.JSON_PARSE_FAILED);
  assert.equal(schemaInvalidResult.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(schemaInvalidResult.reason, ProviderErrorReason.SCHEMA_INVALID);
});

test("gateway relation proposer can use independent provider routing", async () => {
  const providerRequests = [];
  const runtime = createGatewayProviderRuntime({
    providerConfig: createGatewayRuntimeConfig({
      providerConfig: {
        explain: {
          enabled: true,
          provider: ProviderKind.CUSTOM,
          adapter: ProviderAdapter.OPENAI_COMPATIBLE,
          endpoint: "https://explain.example/v1",
          chatPath: "/chat/completions",
          token: "explain-token",
          modelName: "explain-model"
        },
        relationProposer: {
          enabled: true,
          reuseExplainProvider: false,
          provider: ProviderKind.CUSTOM,
          adapter: ProviderAdapter.OPENAI_COMPATIBLE,
          endpoint: "https://relation.example/v1",
          chatPath: "/chat/completions",
          token: "relation-token",
          modelName: "relation-model",
          structuredOutput: {
            mode: StructuredOutputMode.JSON_SCHEMA,
            schemaName: "bco_relation_proposal_result"
          }
        }
      }
    }),
    fetchImpl: async (url, options) => {
      providerRequests.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          model: "relation-model",
          choices: [{ message: { content: JSON.stringify({ relationCandidates: [], rejectedCandidates: [] }) } }]
        })
      };
    }
  });

  const result = await runtime.proposeRelations({
    targetConcept: { canonicalName: "Minnan" },
    dailyMemoryBlocks: []
  });
  const body = JSON.parse(providerRequests[0].options.body);

  assert.equal(result.status, AgentResultStatus.AVAILABLE);
  assert.equal(providerRequests[0].url, "https://relation.example/v1/chat/completions");
  assert.equal(providerRequests[0].options.headers.authorization, "Bearer relation-token");
  assert.equal(body.model, "relation-model");
});
