import test from "node:test";
import assert from "node:assert/strict";
import { createRuntimeExplainPipeline } from "../src/gateway/runtime-explain-pipeline.js";
import { createLocalMemoryStore } from "../src/gateway/local-memory-store.js";
import { AgentCapability, AgentResultStatus, MemoryEventType, StreamEventType, StreamLane } from "../src/shared/contracts.js";
import { ConceptRelationType, RelationBasis } from "../src/gateway/cognitive-memory.js";
import {
  directStreamRequest,
  forgedMemoryStreamRequest,
  multiBridgeMemoryPacket,
  noBridgeMemoryPacket,
  oneBridgeMemoryPacket,
  weakCandidateMemoryPacket
} from "./fixtures/streaming-explanations.js";

async function collectEvents(stream) {
  const events = [];
  for await (const event of stream) events.push(event);
  return events;
}

test("runtime filters invalid input before memory lookup or provider call", async () => {
  let memoryQueries = 0;
  let providerCalls = 0;
  const pipeline = createRuntimeExplainPipeline({
    store: {
      queryMemory: () => {
        memoryQueries += 1;
        return {};
      },
      writeEvent: () => {}
    },
    now: () => 1000
  });

  const result = await pipeline.handle({
    request: { target: { canonicalName: "" } },
    providerCall: async () => {
      providerCalls += 1;
      return { status: AgentResultStatus.AVAILABLE };
    }
  });

  assert.equal(result.status, AgentResultStatus.INVALID);
  assert.equal(result.reason, "reject_invalid_input");
  assert.equal(result.runtimeDecision.kind, "reject_invalid_input");
  assert.equal(memoryQueries, 0);
  assert.equal(providerCalls, 0);
});

test("runtime suppresses duplicate trigger before provider call", async () => {
  let providerCalls = 0;
  let current = 1000;
  const store = createLocalMemoryStore({ now: () => current, autoProcessBacklog: false });
  const pipeline = createRuntimeExplainPipeline({ store, now: () => current });
  const request = { target: { canonicalName: "KL divergence" }, minimalContext: { fragmentId: "p1", text: "KL divergence appears here." } };
  const providerCall = async (input) => {
    providerCalls += 1;
    return {
      status: AgentResultStatus.AVAILABLE,
      capabilityKind: input.capabilityKind,
      target: input.target,
      text: "Provider explanation.",
      microExplanation: "Provider explanation.",
      versionMetadata: { id: `ver_${providerCalls}` }
    };
  };

  const first = await pipeline.handle({ request, providerCall });
  current += 10;
  const second = await pipeline.handle({ request, providerCall });

  assert.equal(first.status, AgentResultStatus.AVAILABLE);
  assert.equal(second.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(second.reason, "duplicate_trigger_suppressed");
  assert.equal(second.runtimeDecision.providerCallStatus, "skipped");
  assert.equal(providerCalls, 1);
});

test("runtime treats Chinese names as valid concept input", async () => {
  let providerCalls = 0;
  const store = createLocalMemoryStore({ now: () => 1500, autoProcessBacklog: false });
  const pipeline = createRuntimeExplainPipeline({ store, now: () => 1500 });

  const result = await pipeline.handle({
    request: { target: { canonicalName: "赖清德", observedText: "赖清德" } },
    providerCall: async (input) => {
      providerCalls += 1;
      return {
        status: AgentResultStatus.AVAILABLE,
        capabilityKind: input.capabilityKind,
        target: input.target,
        text: "Provider explanation.",
        microExplanation: "Provider explanation.",
        versionMetadata: { id: "ver_unicode_name" }
      };
    }
  });

  assert.equal(result.status, AgentResultStatus.AVAILABLE);
  assert.equal(result.reason, undefined);
  assert.equal(result.target.canonicalName, "赖清德");
  assert.equal(result.runtimeDecision.kind, "call_provider");
  assert.equal(providerCalls, 1);
});

test("runtime reuses existing explanation without provider call", async () => {
  let providerCalls = 0;
  const store = createLocalMemoryStore({ now: () => 2000, autoProcessBacklog: false });
  store.writeExplanationVersion({
    id: "ver_existing",
    target: "Lagrange point",
    text: "A saved explanation.",
    style: "concise",
    timestamp: 1500
  });
  store.writeEvent({
    event: {
      id: "evt_shown",
      type: MemoryEventType.EXPLANATION_SHOWN,
      canonicalName: "Lagrange point",
      timestamp: 1500,
      explanationVersionId: "ver_existing"
    }
  });
  const pipeline = createRuntimeExplainPipeline({ store, now: () => 2000 });

  const result = await pipeline.handle({
    request: { target: { canonicalName: "Lagrange point" } },
    providerCall: async () => {
      providerCalls += 1;
      return { status: AgentResultStatus.AVAILABLE };
    }
  });

  assert.equal(result.status, AgentResultStatus.AVAILABLE);
  assert.equal(result.text, "A saved explanation.");
  assert.equal(result.runtimeDecision.kind, "return_existing_explanation");
  assert.equal(result.runtimeDecision.providerCallStatus, "skipped");
  assert.equal(providerCalls, 0);
});

test("runtime provider success persists explanation version and memory candidates", async () => {
  const store = createLocalMemoryStore({ now: () => 3000, autoProcessBacklog: false });
  const pipeline = createRuntimeExplainPipeline({ store, now: () => 3000 });

  const result = await pipeline.handle({
    request: {
      target: { canonicalName: "Attention head", observedText: "attention head" },
      minimalContext: { fragmentId: "p2", text: "The attention head focuses on tokens." }
    },
    providerCall: async (input) => {
      assert.equal(Object.hasOwn(input, "profileHints"), true);
      assert.equal(input.memoryPacket.localMemoryRole, "learning_state");
      return {
        status: AgentResultStatus.AVAILABLE,
        capabilityKind: AgentCapability.EXPLAIN,
        target: input.target,
        text: "A small part of a transformer attention layer.",
        microExplanation: "A small part of a transformer attention layer.",
        summary: "Transformer attention subunit.",
        confidence: 0.8,
        terms: [{ term: "transformer" }],
        actions: [],
        versionMetadata: { id: "ver_attention", provider: "openai-compatible", model: "unit" }
      };
    }
  });
  const evidence = store.readTargetEvidence("Attention head");

  assert.equal(result.status, AgentResultStatus.AVAILABLE);
  assert.equal(result.runtimeDecision.persistenceStatus, "persisted");
  assert.equal(evidence.explanationVersions.length, 1);
  assert.equal(evidence.explanationVersions[0].id, "ver_attention");
  assert.equal(evidence.memoryCandidates.some((candidate) => candidate.signal === "possible_unfamiliar"), true);
  assert.equal(store.readDerivedSummary("Attention head"), null);
});

test("runtime awaits asynchronous layered memory query and persistence", async () => {
  const calls = [];
  const store = {
    async queryMemory(query) {
      calls.push(["query", query.canonicalName]);
      return {
        status: AgentResultStatus.AVAILABLE,
        repositoryStatus: "layered_memory",
        localMemoryRole: "learning_state",
        memoryFreshness: { status: "fresh" },
        agentSummary: {},
        profileHints: {},
        memoryBridges: [{ relatedConcept: "莆田常太", caution: "not_fact_source" }]
      };
    },
    async writeEvent(payload) {
      calls.push(["event", payload.event.type]);
      return payload.event;
    },
    async writeExplanationVersion(version) {
      calls.push(["version", version.id]);
      return version;
    },
    async writeMemoryCandidate(candidate) {
      calls.push(["candidate", candidate.signal]);
      return candidate;
    },
    async scheduleRelationDiscovery() {
      calls.push(["relation", "scheduled"]);
      return { status: "scheduled" };
    }
  };
  const pipeline = createRuntimeExplainPipeline({ store, now: () => 3250 });

  const result = await pipeline.handle({
    request: { target: { canonicalName: "枇杷", observedText: "枇杷" } },
    providerCall: async (input) => {
      assert.equal(input.memoryPacket.repositoryStatus, "layered_memory");
      assert.deepEqual(input.memoryBridges.map((bridge) => bridge.relatedConcept), ["莆田常太"]);
      return {
        status: AgentResultStatus.AVAILABLE,
        capabilityKind: input.capabilityKind,
        target: input.target,
        text: "Provider explanation.",
        microExplanation: "Provider explanation.",
        confidence: 0.7,
        terms: [{ term: "fruit" }],
        versionMetadata: { id: "ver_async_memory" }
      };
    }
  });

  assert.equal(result.status, AgentResultStatus.AVAILABLE);
  assert.equal(result.runtimeDecision.persistenceStatus, "persisted");
  assert.equal(calls.some(([kind]) => kind === "query"), true);
  assert.equal(calls.some(([kind]) => kind === "version"), true);
  assert.equal(calls.some(([kind]) => kind === "candidate"), true);
});

test("runtime schedules relation discovery with configured proposer after provider success", async () => {
  const scheduled = [];
  const relationProposer = async () => ({ relationCandidates: [], rejectedCandidates: [] });
  const store = {
    queryMemory: () => ({
      status: AgentResultStatus.AVAILABLE,
      repositoryStatus: "local_gateway",
      localMemoryRole: "learning_state",
      memoryFreshness: { status: "raw_fallback" },
      agentSummary: {},
      profileHints: {},
      memoryBridges: []
    }),
    writeEvent: (payload) => payload.event,
    writeExplanationVersion: (version) => ({ ...version, id: version.id ?? "ver_scheduled" }),
    writeMemoryCandidate: () => null,
    scheduleRelationDiscovery: (payload) => {
      scheduled.push(payload);
      return { status: "scheduled" };
    }
  };
  const pipeline = createRuntimeExplainPipeline({
    store,
    relationProposer,
    now: () => 3500
  });

  const result = await pipeline.handle({
    request: {
      target: { canonicalName: "Minnan", observedText: "Minnan" },
      minimalContext: { fragmentId: "p1", text: "Minnan appears near Fujian." }
    },
    providerCall: async (input) => ({
      status: AgentResultStatus.AVAILABLE,
      capabilityKind: input.capabilityKind,
      target: input.target,
      text: "Minnan is a cultural region.",
      microExplanation: "Minnan is a cultural region.",
      versionMetadata: { id: "ver_scheduled" }
    })
  });

  assert.equal(result.status, AgentResultStatus.AVAILABLE);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].target.canonicalName, "Minnan");
  assert.equal(scheduled[0].relationProposer, relationProposer);
  assert.equal(scheduled[0].explanationVersion.id, "ver_scheduled");
  assert.equal(scheduled[0].currentContext.contextHash.length > 0, true);
});

test("runtime pre-recall discovers prior Top-K memory before first provider explanation", async () => {
  let current = Date.parse("2026-05-27T10:00:00.000Z");
  const store = createLocalMemoryStore({ now: () => current, autoProcessBacklog: false });
  store.writeEvent({
    event: {
      id: "evt_loquat_memory",
      type: MemoryEventType.KNOWLEDGE_ENCOUNTERED,
      canonicalName: "枇杷",
      observedAlias: "枇杷",
      timestamp: current - 60_000
    }
  });
  store.processBacklog();
  let proposerInput = null;
  let providerInput = null;
  const pipeline = createRuntimeExplainPipeline({
    store,
    relationProposer: async (input) => {
      proposerInput = input;
      return {
        status: AgentResultStatus.AVAILABLE,
        relationCandidates: [{
          sourceCanonicalName: "常太",
          relationType: ConceptRelationType.RELATED_TO,
          targetCanonicalName: "枇杷",
          sourceDate: "2026-05-27",
          confidence: "high",
          basis: RelationBasis.PROVIDER_STRUCTURED_RELATION,
          usableForOverlay: true,
          sourceEventIds: ["evt_loquat_memory"]
        }],
        rejectedCandidates: []
      };
    },
    now: () => current
  });

  const result = await pipeline.handle({
    request: {
      target: { canonicalName: "常太", observedText: "常太" },
      minimalContext: { fragmentId: "p-changtai", text: "常太" }
    },
    providerCall: async (input) => {
      providerInput = input;
      return {
        status: AgentResultStatus.AVAILABLE,
        capabilityKind: input.capabilityKind,
        target: input.target,
        text: "常太可结合你之前查过的枇杷来理解。",
        microExplanation: "常太可结合你之前查过的枇杷来理解。",
        versionMetadata: { id: "ver_changtai" }
      };
    }
  });
  current += 1000;
  const packet = store.queryMemory({ canonicalName: "常太", timestamp: current, maxBridgeCount: 3 });

  assert.equal(result.status, AgentResultStatus.AVAILABLE);
  assert.equal(proposerInput.targetConcept.canonicalName, "常太");
  assert.equal(proposerInput.dailyMemoryBlocks.some((block) =>
    block.concepts.some((concept) => concept.canonicalName === "枇杷")
  ), true);
  assert.deepEqual(providerInput.memoryBridges.map((bridge) => bridge.relatedConcept), ["枇杷"]);
  assert.equal(providerInput.memoryBridges[0].sourceRole, "local_learning_context");
  assert.equal(packet.memoryBridges[0].relatedConcept, "枇杷");
});

test("runtime stream session starts direct lane before association recall finishes", async () => {
  let resolveMemory;
  let associationProviderInput = null;
  const store = {
    queryMemory() {
      return new Promise((resolve) => {
        resolveMemory = () => resolve(oneBridgeMemoryPacket);
      });
    },
    writeEvent: () => null
  };
  const pipeline = createRuntimeExplainPipeline({ store, now: () => 8000 });
  const iterator = pipeline.streamSession({
    request: directStreamRequest,
    directProviderStream: async (request, { onDelta }) => {
      onDelta({ text: "Lo" });
      return {
        status: AgentResultStatus.AVAILABLE,
        capabilityKind: AgentCapability.EXPLAIN,
        target: request.target,
        text: "Loquat",
        microExplanation: "Loquat",
        versionMetadata: { id: "ver_direct" }
      };
    },
    associationProviderStream: async (request, { onDelta }) => {
      associationProviderInput = request;
      onDelta({ text: "Related to Changtai." });
      return {
        status: AgentResultStatus.AVAILABLE,
        capabilityKind: AgentCapability.EXPLAIN,
        target: request.target,
        text: "Related to Changtai.",
        microExplanation: "Related to Changtai.",
        versionMetadata: { id: "ver_association" }
      };
    }
  })[Symbol.asyncIterator]();

  assert.equal((await iterator.next()).value.type, StreamEventType.SESSION_START);
  const directStart = (await iterator.next()).value;
  const directDelta = (await iterator.next()).value;
  assert.equal(directStart.type, StreamEventType.LANE_START);
  assert.equal(directStart.lane, StreamLane.DIRECT);
  assert.equal(directDelta.type, StreamEventType.LANE_DELTA);
  assert.equal(directDelta.lane, StreamLane.DIRECT);
  resolveMemory();
  const tail = [];
  while (true) {
    const next = await iterator.next();
    if (next.done) break;
    tail.push(next.value);
  }

  assert.equal(tail.some((event) => event.type === StreamEventType.RECALL_STATUS), true);
  assert.equal(tail.some((event) => event.type === StreamEventType.LANE_DELTA && event.lane === StreamLane.ASSOCIATION), true);
  assert.equal(tail.at(-1).type, StreamEventType.SESSION_DONE);
  assert.deepEqual(associationProviderInput.memoryBridges.map((bridge) => bridge.relatedConcept), ["Changtai"]);
});

test("runtime stream session stores direct related concept hints with profile context", async () => {
  let hintProviderInput = null;
  let storedHints = null;
  const store = {
    queryMemory: () => noBridgeMemoryPacket,
    readProfileSummary: () => ({
      id: "profile_summary",
      interests: { recentConcepts: ["常太枇杷", "莆田"] },
      hints: { preferredStyle: "concise" }
    }),
    writeRelatedConceptHints: (payload) => {
      storedHints = payload;
      return {
        status: AgentResultStatus.AVAILABLE,
        relatedConceptHints: payload.relatedConceptHints.map((hint, index) => ({
          id: `hint_${index}`,
          sourceCanonicalName: payload.sourceConcept,
          hintCanonicalName: hint.canonicalName,
          score: hint.score
        }))
      };
    },
    writeEvent: () => null
  };
  const pipeline = createRuntimeExplainPipeline({
    store,
    now: () => 8090,
    relatedConceptHintProvider: async (request) => {
      hintProviderInput = request;
      return {
        status: AgentResultStatus.AVAILABLE,
        relatedConceptHints: [
          { canonicalName: "莆田", score: 0.96, reason: "profiled geography interest" },
          { canonicalName: "常太", score: 0.91 }
        ],
        versionMetadata: { id: "hint_ver_1" }
      };
    }
  });

  const events = await collectEvents(pipeline.streamSession({
    request: {
      ...directStreamRequest,
      target: { ...directStreamRequest.target, canonicalName: "福建" }
    },
    directProviderStream: async (request, { onDelta }) => {
      onDelta({ text: "福建解释" });
      return {
        status: AgentResultStatus.AVAILABLE,
        capabilityKind: AgentCapability.EXPLAIN,
        target: request.target,
        text: "福建解释",
        microExplanation: "福建解释",
        versionMetadata: { id: "ver_fujian_direct", provider: "unit", model: "direct-model" }
      };
    },
    associationProviderStream: async () => {
      throw new Error("association provider should not run without a bridge");
    }
  }));
  const directFinal = events.find((event) =>
    event.type === StreamEventType.LANE_FINAL && event.lane === StreamLane.DIRECT
  );

  assert.equal(hintProviderInput.target.canonicalName, "福建");
  assert.equal(hintProviderInput.directExplanation, "福建解释");
  assert.equal(hintProviderInput.profileSummary.id, "profile_summary");
  assert.deepEqual(directFinal.result.relatedConceptHints.map((hint) => hint.canonicalName), ["莆田", "常太"]);
  assert.equal(storedHints.sourceConcept, "福建");
  assert.equal(storedHints.explanationVersionId, "ver_fujian_direct");
  assert.deepEqual(storedHints.relatedConceptHints.map((hint) => hint.canonicalName), ["莆田", "常太"]);
});

test("runtime stream direct lane applies profile detail without recalled memory", async () => {
  let directProviderInput = null;
  const store = {
    queryMemory: () => noBridgeMemoryPacket,
    readProfileSummary: () => ({
      id: "profile_summary",
      hints: {
        difficultKnowledgeTypes: ["technology"],
        preferredStyle: "background",
        explanationDetail: "more_detailed"
      }
    }),
    writeEvent: () => null
  };
  const pipeline = createRuntimeExplainPipeline({ store, now: () => 8095 });

  await collectEvents(pipeline.streamSession({
    request: {
      ...directStreamRequest,
      target: { ...directStreamRequest.target, canonicalName: "KV cache", knowledgeType: "technology" }
    },
    directProviderStream: async (request, { onDelta }) => {
      directProviderInput = request;
      onDelta({ text: "KV cache" });
      return {
        status: AgentResultStatus.AVAILABLE,
        capabilityKind: AgentCapability.EXPLAIN,
        target: request.target,
        text: "KV cache",
        microExplanation: "KV cache",
        versionMetadata: { id: "ver_profile_detail" }
      };
    },
    associationProviderStream: async () => {
      throw new Error("association provider should not run without a bridge");
    }
  }));

  assert.equal(directProviderInput.requestedStyle, "background");
  assert.equal(directProviderInput.profileHints.categoryDifficulty, true);
  assert.equal(directProviderInput.constraints.explanationDetail, "more_detailed");
  assert.ok(directProviderInput.constraints.maxChars > 220);
  assert.equal(directProviderInput.memoryPacket, undefined);
  assert.equal(directProviderInput.memoryBridges, undefined);
});

test("runtime stream session ignores browser-provided memory fields", async () => {
  const providerRequests = [];
  const store = {
    queryMemory: () => noBridgeMemoryPacket,
    writeEvent: () => null
  };
  const pipeline = createRuntimeExplainPipeline({ store, now: () => 8050 });
  const events = await collectEvents(pipeline.streamSession({
    request: forgedMemoryStreamRequest,
    directProviderStream: async (request, { onDelta }) => {
      providerRequests.push(request);
      onDelta({ text: "Direct" });
      return {
        status: AgentResultStatus.AVAILABLE,
        capabilityKind: AgentCapability.EXPLAIN,
        target: request.target,
        text: "Direct",
        microExplanation: "Direct",
        versionMetadata: { id: "ver_direct_clean" }
      };
    },
    associationProviderStream: async () => {
      throw new Error("association provider should not run without a bridge");
    }
  }));
  const associationFinal = events.find((event) =>
    event.type === StreamEventType.LANE_FINAL && event.lane === StreamLane.ASSOCIATION
  );

  assert.equal(providerRequests.length, 1);
  assert.equal(providerRequests[0].memoryPacket, undefined);
  assert.equal(providerRequests[0].memorySummary, undefined);
  assert.equal(providerRequests[0].profileHints, undefined);
  assert.equal(providerRequests[0].memoryBridges, undefined);
  assert.equal(associationFinal.result.reason, "no_memory_bridge");
});

test("runtime stream session finalizes weak association candidates without provider dispatch", async () => {
  let associationCalls = 0;
  const pipeline = createRuntimeExplainPipeline({
    store: {
      queryMemory: () => weakCandidateMemoryPacket,
      writeEvent: () => null
    },
    now: () => 8100
  });
  const events = await collectEvents(pipeline.streamSession({
    request: directStreamRequest,
    directProviderStream: async (request) => ({
      status: AgentResultStatus.AVAILABLE,
      capabilityKind: AgentCapability.EXPLAIN,
      target: request.target,
      text: "Direct.",
      microExplanation: "Direct.",
      versionMetadata: { id: "ver_direct_weak" }
    }),
    associationProviderStream: async () => {
      associationCalls += 1;
      return { status: AgentResultStatus.AVAILABLE };
    }
  }));
  const associationFinal = events.find((event) =>
    event.type === StreamEventType.LANE_FINAL && event.lane === StreamLane.ASSOCIATION
  );

  assert.equal(associationCalls, 0);
  assert.equal(associationFinal.result.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(associationFinal.result.reason, "weak_candidates_only");
  assert.equal(associationFinal.result.runtimeDecision.memoryRecall.preRecall.rejectedCandidateCount, 4);
});

test("runtime stream session sends bounded multi-bridge context to association provider", async () => {
  let associationProviderInput = null;
  const pipeline = createRuntimeExplainPipeline({
    store: {
      queryMemory: () => multiBridgeMemoryPacket,
      writeEvent: () => null
    },
    now: () => 8150
  });

  await collectEvents(pipeline.streamSession({
    request: directStreamRequest,
    directProviderStream: async (request) => ({
      status: AgentResultStatus.AVAILABLE,
      capabilityKind: AgentCapability.EXPLAIN,
      target: request.target,
      text: "Direct.",
      microExplanation: "Direct.",
      versionMetadata: { id: "ver_direct_multi" }
    }),
    associationProviderStream: async (request) => {
      associationProviderInput = request;
      return {
        status: AgentResultStatus.AVAILABLE,
        capabilityKind: AgentCapability.EXPLAIN,
        target: request.target,
        text: "Association.",
        microExplanation: "Association.",
        versionMetadata: { id: "ver_association_multi" }
      };
    }
  }));

  assert.deepEqual(associationProviderInput.memoryBridges.map((bridge) => bridge.relatedConcept), [
    "Changtai",
    "Putian",
    "Fujian"
  ]);
  assert.equal(associationProviderInput.association.overflowBridgeCount, 1);
  assert.equal(associationProviderInput.constraints.memorySourceRole, "local_learning_context");
});

test("runtime pre-recall ignores proposer overlay disable when relation gate activates bridge", async () => {
  let current = Date.parse("2026-05-27T10:00:00.000Z");
  const store = createLocalMemoryStore({ now: () => current, autoProcessBacklog: false });
  store.writeEvent({
    event: {
      id: "evt_prior_place",
      type: MemoryEventType.KNOWLEDGE_ENCOUNTERED,
      canonicalName: "Prior Place",
      observedAlias: "Prior Place",
      timestamp: current - 60_000
    }
  });
  store.processBacklog();
  const pipeline = createRuntimeExplainPipeline({
    store,
    relationProposer: async () => ({
      status: AgentResultStatus.AVAILABLE,
      relationCandidates: [{
        sourceCanonicalName: "Current Place",
        relationType: ConceptRelationType.LOCATED_IN,
        targetCanonicalName: "Prior Place",
        sourceDate: "2026-05-27",
        confidence: "high",
        basis: RelationBasis.CURRENT_CONTEXT_EXPLICIT,
        usableForOverlay: false
      }],
      rejectedCandidates: []
    }),
    now: () => current
  });

  const result = await pipeline.handle({
    request: {
      target: { canonicalName: "Current Place", observedText: "Current Place" },
      minimalContext: { fragmentId: "p-current", text: "Current Place" }
    },
    providerCall: async (input) => ({
      status: AgentResultStatus.AVAILABLE,
      capabilityKind: input.capabilityKind,
      target: input.target,
      text: "Provider explanation.",
      microExplanation: "Provider explanation.",
      versionMetadata: { id: "ver_current_place" }
    })
  });

  const preRecall = result.runtimeDecision.memoryRecall.preRecall;
  assert.equal(result.status, AgentResultStatus.AVAILABLE);
  assert.equal(preRecall.relationCandidateCount, 1);
  assert.equal(preRecall.activeCandidateCount, 1);
  assert.equal(preRecall.overlayEligibleCandidateCount, 1);
  assert.equal(preRecall.rejectedCandidateCount, 0);
  assert.deepEqual(preRecall.gateRejectReasons, []);
  assert.equal(preRecall.bridgeCount, 1);
  assert.deepEqual(result.runtimeDecision.memoryRecall.bridges.map((bridge) => bridge.relatedConcept), ["Prior Place"]);
});

test("runtime pre-recall accepts incoming relation when prior concept owns source date", async () => {
  let current = Date.parse("2026-05-27T10:00:00.000Z");
  const store = createLocalMemoryStore({ now: () => current, autoProcessBacklog: false });
  store.writeEvent({
    event: {
      id: "evt_prior_region",
      type: MemoryEventType.KNOWLEDGE_ENCOUNTERED,
      canonicalName: "Prior Region",
      observedAlias: "Prior Region",
      timestamp: current - 60_000
    }
  });
  store.processBacklog();
  const pipeline = createRuntimeExplainPipeline({
    store,
    relationProposer: async () => ({
      status: AgentResultStatus.AVAILABLE,
      relationCandidates: [{
        sourceCanonicalName: "Prior Region",
        relationType: ConceptRelationType.CONTAINS,
        targetCanonicalName: "Current City",
        sourceDate: "2026-05-27",
        confidence: "high",
        basis: RelationBasis.CURRENT_CONTEXT_EXPLICIT
      }],
      rejectedCandidates: []
    }),
    now: () => current
  });

  const result = await pipeline.handle({
    request: {
      target: { canonicalName: "Current City", observedText: "Current City" },
      minimalContext: { fragmentId: "p-current-city", text: "Current City" }
    },
    providerCall: async (input) => ({
      status: AgentResultStatus.AVAILABLE,
      capabilityKind: input.capabilityKind,
      target: input.target,
      text: "Provider explanation.",
      microExplanation: "Provider explanation.",
      versionMetadata: { id: "ver_current_city" }
    })
  });

  const preRecall = result.runtimeDecision.memoryRecall.preRecall;
  assert.equal(result.status, AgentResultStatus.AVAILABLE);
  assert.equal(preRecall.relationCandidateCount, 1);
  assert.equal(preRecall.activeCandidateCount, 1);
  assert.equal(preRecall.rejectedCandidateCount, 0);
  assert.equal(preRecall.bridgeCount, 1);
  assert.deepEqual(result.runtimeDecision.memoryRecall.bridges.map((bridge) => bridge.relatedConcept), ["Prior Region"]);
  assert.equal(result.runtimeDecision.memoryRecall.bridges[0].direction, "incoming");
});

test("runtime invalid provider output does not create explanation version", async () => {
  const store = createLocalMemoryStore({ now: () => 4000, autoProcessBacklog: false });
  const pipeline = createRuntimeExplainPipeline({ store, now: () => 4000 });

  const result = await pipeline.handle({
    request: { target: { canonicalName: "KV cache" } },
    providerCall: async () => ({
      status: AgentResultStatus.INVALID,
      reason: "provider_schema_invalid"
    })
  });
  const evidence = store.readTargetEvidence("KV cache");

  assert.equal(result.status, AgentResultStatus.INVALID);
  assert.equal(result.runtimeDecision.persistenceStatus, "failure_event_persisted");
  assert.equal(evidence.explanationVersions.length, 0);
});
