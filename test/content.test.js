import test from "node:test";
import assert from "node:assert/strict";
import { startBrowserCognitiveOverlay } from "../src/extension/content.js";
import { BROWSER_CONFIG_STORAGE_KEY, DEFAULT_CONFIG, mergeConfig } from "../src/shared/config.js";
import { AgentResultStatus, MemoryEventType, StreamEventType, StreamLane, SuppressionReason } from "../src/shared/contracts.js";

test("content startup keeps memory out of browser storage and forwards feedback events", () => {
  const doc = fakeDocument();
  const storageAccesses = [];
  const writes = [];
  const runtime = startBrowserCognitiveOverlay({
    doc,
    win: fakeWindow(storageAccesses),
    config: mergeConfig(DEFAULT_CONFIG, { featureEnabled: true }),
    agentClient: { writeMemoryEvent: async (payload) => writes.push(payload) },
    memoryClient: { writeMemoryEvent: async (payload) => writes.push(payload) },
    now: () => 1000
  });

  assert.equal(runtime.started, true);
  assert.equal(Object.hasOwn(runtime, "memory"), false);
  assert.equal(Object.hasOwn(runtime, "profile"), false);
  assert.deepEqual(storageAccesses, []);

  runtime.overlay.show({
    concept: "KL divergence",
    knowledgeType: "technology",
    micro: "A runtime explanation.",
    context: { fragmentId: "p1", url: "https://example.test/article" },
    explanationVersion: {
      id: "ver1",
      style: "concise",
      status: AgentResultStatus.AVAILABLE,
      source: "external_agent"
    }
  });
  doc.body.querySelectorAll("button").find((button) => button.textContent === "困惑").click();

  assert.equal(writes.length, 1);
  assert.equal(writes[0].repository, "learning");
  assert.equal(writes[0].event.type, MemoryEventType.MARKED_CONFUSING);
  assert.equal(writes[0].event.canonicalName, "KL divergence");
  assert.equal(writes[0].event.explanationVersionId, "ver1");
  assert.deepEqual(storageAccesses, []);

  runtime.stop();
});

test("content starts enabled by default without a page dataset flag", () => {
  const doc = fakeDocument();
  const runtime = startBrowserCognitiveOverlay({
    doc,
    win: fakeWindow([]),
    now: () => 1000
  });

  assert.equal(runtime.started, true);
  assert.equal(doc.documentElement.dataset.bcoState, "started");
  assert.equal(doc.documentElement.dataset.bcoEnabled, undefined);

  runtime.stop();
});

test("content respects explicit page dataset feature disable at startup", () => {
  const doc = fakeDocument();
  doc.documentElement.dataset.bcoEnabled = "false";
  const runtime = startBrowserCognitiveOverlay({
    doc,
    win: fakeWindow([]),
    now: () => 1000
  });

  assert.equal(runtime.started, false);
  assert.equal(doc.documentElement.dataset.bcoState, "disabled");
  assert.equal(doc.documentElement.dataset.bcoReason, "feature_disabled");
});

test("debug overlay can render in dev mode while feature gate is disabled", () => {
  const doc = fakeDocument();
  const runtime = startBrowserCognitiveOverlay({
    doc,
    win: fakeWindow([]),
    config: mergeConfig(DEFAULT_CONFIG, { featureEnabled: false, devMode: true }),
    now: () => 1000
  });

  assert.equal(runtime.started, false);
  assert.equal(doc.documentElement.dataset.bcoState, "disabled");

  doc.dispatchEvent({ type: "bco:debug-show" });

  const root = doc.body.querySelector("#browser-cognitive-overlay");
  assert.ok(root);
  assert.equal(root.hidden, false);
  assert.match(root.querySelector(".bco-micro").textContent, /overlay UI is rendering correctly/);
});

test("content can be enabled by page events in dev mode after initial feature gate disable", () => {
  const doc = fakeDocument();
  const runtime = startBrowserCognitiveOverlay({
    doc,
    win: fakeWindow([]),
    config: mergeConfig(DEFAULT_CONFIG, { featureEnabled: false, devMode: true }),
    now: () => 1000
  });

  assert.equal(runtime.started, false);
  assert.equal(doc.documentElement.dataset.bcoState, "disabled");

  doc.documentElement.dataset.bcoEnabled = "true";
  doc.dispatchEvent({ type: "bco:enable" });

  assert.equal(doc.documentElement.dataset.bcoState, "started");
  assert.equal(doc.documentElement.dataset.bcoReason, undefined);
});

test("content starts from persisted browser config after initial feature gate disable", async () => {
  const doc = fakeDocument();
  const storageAccesses = [];
  const runtime = startBrowserCognitiveOverlay({
    doc,
    win: fakeWindow(storageAccesses, {
      storedBrowserConfig: { featureEnabled: true }
    }),
    config: mergeConfig(DEFAULT_CONFIG, { featureEnabled: false }),
    now: () => 1000
  });

  assert.equal(runtime.started, false);
  assert.equal(doc.documentElement.dataset.bcoState, "disabled");

  await Promise.resolve();

  assert.equal(doc.documentElement.dataset.bcoState, "started");
  assert.equal(doc.documentElement.dataset.bcoReason, undefined);
  assert.deepEqual(storageAccesses, [["storage.local.get", BROWSER_CONFIG_STORAGE_KEY]]);
});

test("content disabled bootstrap listener does not start duplicate runtime after hot re-enable", async () => {
  const doc = fakeDocument();
  const storageAccesses = [];
  const storageChangeListeners = [];
  startBrowserCognitiveOverlay({
    doc,
    win: fakeWindow(storageAccesses, {
      storedBrowserConfig: { featureEnabled: true },
      storageChangeListeners
    }),
    config: mergeConfig(DEFAULT_CONFIG, { featureEnabled: false }),
    now: () => 1000
  });

  await Promise.resolve();
  assert.equal(doc.documentElement.dataset.bcoState, "started");
  // A single dispatcher listener is registered; the bootstrap and started
  // runtime swap the active handler instead of stacking listeners.
  assert.equal(storageChangeListeners.length, 1);

  for (const listener of [...storageChangeListeners]) {
    listener({ [BROWSER_CONFIG_STORAGE_KEY]: { newValue: { featureEnabled: false } } }, "local");
  }
  assert.equal(doc.documentElement.dataset.bcoState, "disabled");

  for (const listener of [...storageChangeListeners]) {
    listener({ [BROWSER_CONFIG_STORAGE_KEY]: { newValue: { featureEnabled: true } } }, "local");
  }

  assert.equal(doc.documentElement.dataset.bcoState, "started");
  assert.equal(storageChangeListeners.length, 1);
});

test("selected term memory event waits for stable final selection", () => {
  const doc = fakeDocument();
  const timers = createFakeTimers();
  const writes = [];
  let selectedText = "";
  const runtime = startBrowserCognitiveOverlay({
    doc,
    win: fakeWindow([], {
      timers,
      getSelectionText: () => selectedText
    }),
    config: mergeConfig(DEFAULT_CONFIG, { featureEnabled: true }),
    memoryClient: { writeMemoryEvent: async (payload) => writes.push(payload) },
    now: () => 1000
  });
  runtime.contextTracker.update = () => {
    runtime.contextTracker.current = {
      id: "p1",
      type: "paragraph",
      text: "KL divergence measures how one probability distribution differs from another."
    };
    return runtime.contextTracker.current;
  };

  selectedText = "K";
  doc.dispatchEvent({ type: "selectionchange" });
  selectedText = "KL";
  doc.dispatchEvent({ type: "selectionchange" });
  selectedText = "KL divergence";
  doc.dispatchEvent({ type: "selectionchange" });

  assert.equal(writes.length, 0);
  timers.runAll();

  const selectedEvents = writes.filter((write) => write.event.type === MemoryEventType.USER_SELECTED_TERM);
  assert.equal(selectedEvents.length, 1);
  assert.equal(selectedEvents[0].event.canonicalName, "KL divergence");
  assert.equal(selectedEvents[0].event.observedAlias, "KL divergence");

  doc.dispatchEvent({ type: "selectionchange" });
  timers.runAll();

  assert.equal(writes.filter((write) => write.event.type === MemoryEventType.USER_SELECTED_TERM).length, 1);
  runtime.stop();
});

test("drag selection records only after primary button release", () => {
  const doc = fakeDocument();
  const timers = createFakeTimers();
  const writes = [];
  let selectedText = "";
  const runtime = startBrowserCognitiveOverlay({
    doc,
    win: fakeWindow([], {
      timers,
      getSelectionText: () => selectedText
    }),
    config: mergeConfig(DEFAULT_CONFIG, { featureEnabled: true }),
    memoryClient: { writeMemoryEvent: async (payload) => writes.push(payload) },
    now: () => 1000
  });
  runtime.contextTracker.update = () => {
    runtime.contextTracker.current = {
      id: "p1",
      type: "paragraph",
      text: "KL divergence measures how one probability distribution differs from another."
    };
    return runtime.contextTracker.current;
  };

  doc.dispatchEvent({ type: "mousedown", button: 0 });
  selectedText = "K";
  doc.dispatchEvent({ type: "selectionchange" });
  selectedText = "KL divergence";
  doc.dispatchEvent({ type: "selectionchange" });
  timers.runAll();

  assert.equal(writes.filter((write) => write.event.type === MemoryEventType.USER_SELECTED_TERM).length, 0);

  doc.dispatchEvent({ type: "mouseup", button: 0 });
  timers.runAll();

  const selectedEvents = writes.filter((write) => write.event.type === MemoryEventType.USER_SELECTED_TERM);
  assert.equal(selectedEvents.length, 1);
  assert.equal(selectedEvents[0].event.canonicalName, "KL divergence");
  runtime.stop();
});

test("invalid finalized selection stays silent and exposes diagnostic reason", () => {
  const doc = fakeDocument();
  const timers = createFakeTimers();
  const writes = [];
  let selectedText = ",";
  const runtime = startBrowserCognitiveOverlay({
    doc,
    win: fakeWindow([], {
      timers,
      getSelectionText: () => selectedText
    }),
    config: mergeConfig(DEFAULT_CONFIG, { featureEnabled: true, devMode: true }),
    memoryClient: { writeMemoryEvent: async (payload) => writes.push(payload) },
    now: () => 1000
  });
  runtime.contextTracker.update = () => {
    runtime.contextTracker.current = {
      id: "p1",
      type: "paragraph",
      text: "KL divergence, policy gradient, and PPO clipping appear together."
    };
    return runtime.contextTracker.current;
  };

  doc.dispatchEvent({ type: "selectionchange" });
  timers.runAll();

  assert.equal(writes.filter((write) => write.event.type === MemoryEventType.USER_SELECTED_TERM).length, 0);
  const decision = JSON.parse(doc.documentElement.dataset.bcoLastDecision);
  assert.equal(decision.shouldShow, false);
  assert.deepEqual(decision.suppressions, ["punctuation_only"]);
  assert.deepEqual(decision.selectionValidation, {
    status: "rejected",
    reason: "punctuation_only",
    completedBy: "keyboard"
  });
  runtime.stop();
});

test("selection inside editable fields stays silent", () => {
  const doc = fakeDocument();
  const timers = createFakeTimers();
  const writes = [];
  const explanations = [];
  let selectedText = "";
  const runtime = startBrowserCognitiveOverlay({
    doc,
    win: fakeWindow([], {
      timers,
      getSelectionText: () => selectedText
    }),
    config: mergeConfig(DEFAULT_CONFIG, { featureEnabled: true }),
    agentClient: {
      composeShortExplanation: async (input) => {
        explanations.push(input);
        return {
          status: AgentResultStatus.AVAILABLE,
          target: input.target,
          microExplanation: "A runtime explanation.",
          versionMetadata: { id: "ver_input" }
        };
      }
    },
    memoryClient: { writeMemoryEvent: async (payload) => writes.push(payload) },
    now: () => 1000
  });
  timers.runAll();
  writes.length = 0;
  runtime.contextTracker.update = () => {
    runtime.contextTracker.current = {
      id: "p1",
      type: "paragraph",
      text: "KL divergence measures how one probability distribution differs from another."
    };
    return runtime.contextTracker.current;
  };

  const input = doc.createElement("input");
  doc.body.append(input);
  doc.activeElement = input;
  selectedText = "KL divergence";
  doc.dispatchEvent({ type: "selectionchange" });
  timers.runAll();

  assert.equal(writes.filter((write) => write.event.type === MemoryEventType.USER_SELECTED_TERM).length, 0);
  assert.equal(explanations.length, 0);
  runtime.stop();
});

test("selection inside the overlay stays silent", () => {
  const doc = fakeDocument();
  const timers = createFakeTimers();
  const writes = [];
  const explanations = [];
  const selectionState = {
    anchorNode: null,
    focusNode: null,
    rangeCount: 0,
    toString: () => "A runtime explanation."
  };
  const runtime = startBrowserCognitiveOverlay({
    doc,
    win: fakeWindow([], {
      timers,
      getSelection: () => selectionState
    }),
    config: mergeConfig(DEFAULT_CONFIG, { featureEnabled: true }),
    agentClient: {
      composeShortExplanation: async (input) => {
        explanations.push(input);
        return {
          status: AgentResultStatus.AVAILABLE,
          target: input.target,
          microExplanation: "Another explanation.",
          versionMetadata: { id: "ver_overlay_selection" }
        };
      }
    },
    memoryClient: { writeMemoryEvent: async (payload) => writes.push(payload) },
    now: () => 1000
  });
  timers.runAll();
  writes.length = 0;
  runtime.contextTracker.update = () => {
    runtime.contextTracker.current = {
      id: "p1",
      type: "paragraph",
      text: "A runtime explanation appears inside the overlay."
    };
    return runtime.contextTracker.current;
  };
  runtime.overlay.show({
    concept: "KL divergence",
    knowledgeType: "technology",
    micro: "A runtime explanation.",
    context: { fragmentId: "p1", url: "https://example.test/article" },
    explanationVersion: {
      id: "ver1",
      style: "concise",
      status: AgentResultStatus.AVAILABLE,
      source: "external_agent"
    }
  });

  const micro = doc.body.querySelector(".bco-micro");
  selectionState.anchorNode = micro;
  selectionState.focusNode = micro;
  doc.dispatchEvent({ type: "mousedown", button: 0, target: micro });
  doc.dispatchEvent({ type: "selectionchange", target: doc });
  doc.dispatchEvent({ type: "mouseup", button: 0, target: micro });
  timers.runAll();

  assert.equal(writes.filter((write) => write.event.type === MemoryEventType.USER_SELECTED_TERM).length, 0);
  assert.equal(explanations.length, 0);
  runtime.stop();
});

test("selection anchored fragment can explain even when prior selection fragment is stale", async () => {
  const doc = fakeDocument();
  const explanations = [];
  const runtime = startBrowserCognitiveOverlay({
    doc,
    win: fakeWindow([], { getSelectionText: () => "习近平" }),
    config: mergeConfig(DEFAULT_CONFIG, { featureEnabled: true }),
    agentClient: {
      composeShortExplanation: async (input) => {
        explanations.push(input);
        return {
          status: AgentResultStatus.AVAILABLE,
          target: input.target,
          microExplanation: "习近平是中国政治人物。",
          versionMetadata: { id: "ver_xi" }
        };
      }
    },
    memoryClient: { writeMemoryEvent: async () => {} },
    now: () => 1000
  });
  runtime.behaviorTracker.recordSelection({
    text: "习近平",
    fragment: { id: "old-fragment", type: "paragraph" },
    timestamp: 999
  });
  runtime.contextTracker.update = () => ({
    id: "selected-fragment",
    type: "paragraph",
    text: "应国家主席习近平邀请，俄罗斯总统普京进行国事访问。",
    selectionAnchored: true,
    selectedText: "习近平"
  });

  await runtime.evaluate();

  assert.equal(explanations.length, 1);
  assert.equal(explanations[0].target.canonicalName, "习近平");
  assert.equal(doc.body.querySelector("#browser-cognitive-overlay").hidden, false);
  runtime.stop();
});

test("overlay already visible records suppression without marking agent unavailable", async () => {
  const doc = fakeDocument();
  const runtime = startBrowserCognitiveOverlay({
    doc,
    win: fakeWindow([], { getSelectionText: () => "KL divergence" }),
    config: mergeConfig(DEFAULT_CONFIG, { featureEnabled: true, devMode: true }),
    agentClient: {
      composeShortExplanation: async (input) => ({
        status: AgentResultStatus.AVAILABLE,
        target: {},
        microExplanation: "KL divergence keeps policy updates from moving too far.",
        versionMetadata: { id: "ver_kl", source: "external_agent" }
      })
    },
    memoryClient: { writeMemoryEvent: async () => {} },
    now: () => 1000
  });
  runtime.contextTracker.update = () => ({
    id: "p-kl",
    type: "paragraph",
    text: "PPO clipping and KL divergence limit how far a policy update can move."
  });
  runtime.behaviorTracker.observeFragment = () => ({});
  runtime.behaviorTracker.getSummary = () => ({
    selectedPreciseTerm: true,
    selectionText: "KL divergence"
  });

  await runtime.evaluate();
  assert.equal(doc.body.querySelector("#browser-cognitive-overlay").hidden, false);
  const agentResult = JSON.parse(doc.documentElement.dataset.bcoLastAgentResult);
  assert.equal(agentResult.status, AgentResultStatus.AVAILABLE);
  assert.equal(agentResult.target, "KL divergence");

  await runtime.evaluate();

  const decision = JSON.parse(doc.documentElement.dataset.bcoLastDecision);
  assert.equal(decision.shouldShow, false);
  assert.deepEqual(decision.suppressions, ["overlay_already_visible"]);
  const agentResultAfterSuppression = JSON.parse(doc.documentElement.dataset.bcoLastAgentResult);
  assert.equal(agentResultAfterSuppression.status, AgentResultStatus.AVAILABLE);
  runtime.stop();
});

test("content renders streamed direct and association explanation lanes", async () => {
  const doc = fakeDocument();
  const writes = [];
  const streamInputs = [];
  const runtime = startBrowserCognitiveOverlay({
    doc,
    win: fakeWindow([], { getSelectionText: () => "Loquat" }),
    config: mergeConfig(DEFAULT_CONFIG, { featureEnabled: true }),
    agentClient: {
      streamExplanation: async (input, { onEvent }) => {
        streamInputs.push(input);
        onEvent({ type: StreamEventType.SESSION_START, sessionId: "stream_1", sequence: 0, target: input.target });
        onEvent({ type: StreamEventType.LANE_DELTA, sessionId: "stream_1", sequence: 1, lane: StreamLane.DIRECT, text: "Loquat is a fruit." });
        onEvent({
          type: StreamEventType.RECALL_STATUS,
          sessionId: "stream_1",
          sequence: 2,
          lane: StreamLane.ASSOCIATION,
          bridges: [{ relatedConcept: "Changtai" }]
        });
        onEvent({ type: StreamEventType.LANE_DELTA, sessionId: "stream_1", sequence: 3, lane: StreamLane.ASSOCIATION, text: "Changtai is locally associated with loquats." });
        onEvent({
          type: StreamEventType.LANE_FINAL,
          sessionId: "stream_1",
          sequence: 4,
          lane: StreamLane.DIRECT,
          result: {
            status: AgentResultStatus.AVAILABLE,
            target: input.target,
            text: "Loquat is a fruit.",
            microExplanation: "Loquat is a fruit.",
            versionMetadata: { id: "ver_direct_stream", source: "external_agent" }
          }
        });
        onEvent({
          type: StreamEventType.LANE_FINAL,
          sessionId: "stream_1",
          sequence: 5,
          lane: StreamLane.ASSOCIATION,
          result: {
            status: AgentResultStatus.AVAILABLE,
            target: input.target,
            text: "Changtai is locally associated with loquats.",
            microExplanation: "Changtai is locally associated with loquats.",
            versionMetadata: { id: "ver_assoc_stream", source: "external_agent" }
          }
        });
        onEvent({ type: StreamEventType.SESSION_DONE, sessionId: "stream_1", sequence: 6 });
        return {
          status: AgentResultStatus.AVAILABLE,
          target: input.target,
          text: "Loquat is a fruit.",
          microExplanation: "Loquat is a fruit.",
          versionMetadata: { id: "ver_direct_stream", source: "external_agent" }
        };
      },
      composeShortExplanation: async () => {
        throw new Error("non-stream path should not be used");
      }
    },
    memoryClient: { writeMemoryEvent: async (payload) => writes.push(payload) },
    now: () => 1000
  });
  runtime.contextTracker.update = () => ({
    id: "p-loquat",
    type: "paragraph",
    text: "Changtai loquat is a well-known agricultural product."
  });
  runtime.behaviorTracker.observeFragment = () => ({});
  runtime.behaviorTracker.getSummary = () => ({
    selectedPreciseTerm: true,
    selectionText: "Loquat"
  });

  await runtime.evaluate();

  assert.equal(streamInputs.length, 1);
  assert.equal(doc.body.querySelector(".bco-stream-direct").textContent, "Loquat is a fruit.");
  assert.equal(doc.body.querySelector(".bco-stream-association").textContent, "Changtai is locally associated with loquats.");
  assert.deepEqual(doc.body.querySelectorAll(".bco-stream-bridge").map((node) => node.textContent), ["Changtai"]);
  assert.equal(writes.some((write) => write.event.type === MemoryEventType.EXPLANATION_SHOWN), true);
  runtime.stop();
});

test("content shows no-association copy for streamed weak association final", async () => {
  const doc = fakeDocument();
  const runtime = startBrowserCognitiveOverlay({
    doc,
    win: fakeWindow([], { getSelectionText: () => "Loquat" }),
    config: mergeConfig(DEFAULT_CONFIG, { featureEnabled: true }),
    agentClient: {
      streamExplanation: async (input, { onEvent }) => {
        onEvent({ type: StreamEventType.SESSION_START, sessionId: "stream_weak", sequence: 0, target: input.target });
        onEvent({ type: StreamEventType.LANE_DELTA, sessionId: "stream_weak", sequence: 1, lane: StreamLane.DIRECT, text: "Loquat is a fruit." });
        onEvent({
          type: StreamEventType.LANE_FINAL,
          sessionId: "stream_weak",
          sequence: 2,
          lane: StreamLane.ASSOCIATION,
          result: { status: AgentResultStatus.UNAVAILABLE, reason: "weak_candidates_only" }
        });
        onEvent({ type: StreamEventType.SESSION_DONE, sessionId: "stream_weak", sequence: 3 });
        return {
          status: AgentResultStatus.AVAILABLE,
          target: input.target,
          text: "Loquat is a fruit.",
          microExplanation: "Loquat is a fruit.",
          versionMetadata: { id: "ver_direct_weak", source: "external_agent" }
        };
      }
    },
    memoryClient: { writeMemoryEvent: async () => {} },
    now: () => 1000
  });
  runtime.contextTracker.update = () => ({
    id: "p-loquat",
    type: "paragraph",
    text: "Loquat appears in this paragraph."
  });
  runtime.behaviorTracker.observeFragment = () => ({});
  runtime.behaviorTracker.getSummary = () => ({
    selectedPreciseTerm: true,
    selectionText: "Loquat"
  });

  await runtime.evaluate();

  assert.equal(doc.body.querySelector(".bco-stream-direct").textContent, "Loquat is a fruit.");
  assert.equal(doc.body.querySelector(".bco-stream-association").textContent, "暂无关联");
  runtime.stop();
});

test("content suppresses immediate re-prompt after dismissal", async () => {
  const doc = fakeDocument();
  const writes = [];
  const explanations = [];
  let nowValue = 1000;
  const runtime = startBrowserCognitiveOverlay({
    doc,
    win: fakeWindow([], { getSelectionText: () => "KL divergence" }),
    config: mergeConfig(DEFAULT_CONFIG, { featureEnabled: true, devMode: true }),
    agentClient: {
      composeShortExplanation: async (input) => {
        explanations.push(input);
        return {
          status: AgentResultStatus.AVAILABLE,
          target: input.target,
          microExplanation: "KL divergence keeps policy updates from moving too far.",
          versionMetadata: { id: `ver_kl_${explanations.length}`, source: "external_agent" }
        };
      }
    },
    memoryClient: { writeMemoryEvent: async (payload) => writes.push(payload) },
    now: () => nowValue
  });
  runtime.contextTracker.update = () => ({
    id: "p-kl",
    type: "paragraph",
    text: "PPO clipping and KL divergence limit how far a policy update can move."
  });
  runtime.behaviorTracker.observeFragment = () => ({});
  runtime.behaviorTracker.getSummary = () => ({
    selectedPreciseTerm: true,
    selectionText: "KL divergence"
  });

  await runtime.evaluate();
  assert.equal(doc.body.querySelector("#browser-cognitive-overlay").hidden, false);

  doc.body.querySelector(".bco-icon-button").click();
  assert.equal(doc.body.querySelector("#browser-cognitive-overlay").hidden, true);

  nowValue += 1000;
  await runtime.evaluate();

  const decision = JSON.parse(doc.documentElement.dataset.bcoLastDecision);
  assert.equal(decision.shouldShow, false);
  assert.equal(decision.suppressions.includes(SuppressionReason.RECENT_DISMISSAL), true);
  assert.equal(doc.body.querySelector("#browser-cognitive-overlay").hidden, true);
  assert.equal(explanations.length, 1);
  assert.equal(writes.filter((write) => write.event.type === MemoryEventType.EXPLANATION_SHOWN).length, 1);
  assert.equal(writes.filter((write) => write.event.type === MemoryEventType.DISMISSED).length, 1);
  runtime.stop();
});

test("content retries unavailable explanation after explicit reselection", async () => {
  const doc = fakeDocument();
  const explanations = [];
  let nowValue = 1000;
  let providerAvailable = false;
  const fragment = {
    id: "p-kl",
    type: "paragraph",
    text: "PPO clipping and KL divergence limit how far a policy update can move."
  };
  const runtime = startBrowserCognitiveOverlay({
    doc,
    win: fakeWindow([], { getSelectionText: () => "KL divergence" }),
    config: mergeConfig(DEFAULT_CONFIG, { featureEnabled: true, devMode: true }),
    agentClient: {
      composeShortExplanation: async (input) => {
        explanations.push(input);
        if (!providerAvailable) {
          return {
            status: AgentResultStatus.UNAVAILABLE,
            reason: "provider_temporarily_unavailable",
            target: input.target
          };
        }
        return {
          status: AgentResultStatus.AVAILABLE,
          target: input.target,
          microExplanation: "KL divergence keeps policy updates from moving too far.",
          versionMetadata: { id: "ver_recovered", source: "external_agent" }
        };
      }
    },
    memoryClient: { writeMemoryEvent: async () => {} },
    now: () => nowValue
  });
  runtime.contextTracker.update = () => fragment;

  runtime.behaviorTracker.recordSelection({ text: "KL divergence", fragment, timestamp: nowValue });
  await runtime.evaluate();
  assert.equal(doc.body.querySelector("#browser-cognitive-overlay"), null);

  providerAvailable = true;
  nowValue += 1000;
  runtime.behaviorTracker.recordSelection({ text: "KL divergence", fragment, timestamp: nowValue });
  await runtime.evaluate();

  assert.equal(explanations.length, 2);
  assert.equal(doc.body.querySelector("#browser-cognitive-overlay").hidden, false);
  assert.equal(doc.body.querySelector(".bco-micro").textContent, "KL divergence keeps policy updates from moving too far.");
  const agentResult = JSON.parse(doc.documentElement.dataset.bcoLastAgentResult);
  assert.equal(agentResult.status, AgentResultStatus.AVAILABLE);
  assert.equal(agentResult.target, "KL divergence");
  runtime.stop();
});

test("feature gate hot disable stops overlay and selection writes", async () => {
  const doc = fakeDocument();
  const timers = createFakeTimers();
  const storageChangeListeners = [];
  const writes = [];
  const runtime = startBrowserCognitiveOverlay({
    doc,
    win: fakeWindow([], {
      timers,
      storageChangeListeners,
      getSelectionText: () => "KL divergence"
    }),
    config: mergeConfig(DEFAULT_CONFIG, { featureEnabled: true }),
    agentClient: {
      composeShortExplanation: async (input) => ({
        status: AgentResultStatus.AVAILABLE,
        target: input.target,
        microExplanation: "KL divergence keeps policy updates from moving too far.",
        versionMetadata: { id: "ver_kl", source: "external_agent" }
      })
    },
    memoryClient: { writeMemoryEvent: async (payload) => writes.push(payload) },
    now: () => 1000
  });
  runtime.contextTracker.update = () => ({
    id: "p-kl",
    type: "paragraph",
    text: "PPO clipping and KL divergence limit how far a policy update can move."
  });
  runtime.behaviorTracker.observeFragment = () => ({});
  runtime.behaviorTracker.getSummary = () => ({
    selectedPreciseTerm: true,
    selectionText: "KL divergence"
  });

  await runtime.evaluate();
  assert.equal(doc.body.querySelector("#browser-cognitive-overlay").hidden, false);

  writes.length = 0;
  for (const listener of storageChangeListeners) {
    listener({ [BROWSER_CONFIG_STORAGE_KEY]: { newValue: { featureEnabled: false } } }, "local");
  }

  assert.equal(doc.documentElement.dataset.bcoState, "disabled");
  assert.equal(doc.documentElement.dataset.bcoReason, "feature_disabled");
  assert.equal(doc.body.querySelector("#browser-cognitive-overlay").hidden, true);
  assert.equal(writes.some((write) => write.event.type === MemoryEventType.DISMISSED), false);

  doc.dispatchEvent({ type: "selectionchange" });
  timers.runAll();
  await runtime.evaluate();

  const eventTypes = writes.map((write) => write.event.type);
  assert.equal(eventTypes.includes(MemoryEventType.USER_SELECTED_TERM), false);
  assert.equal(eventTypes.includes(MemoryEventType.EXPLANATION_SHOWN), false);
  assert.equal(eventTypes.includes(MemoryEventType.PARAGRAPH_PROMPTED), false);
  assert.equal(doc.body.querySelector("#browser-cognitive-overlay").hidden, true);
  runtime.stop();
});

test("feature gate hot disable suppresses late in-flight explanation results", async () => {
  const doc = fakeDocument();
  const storageChangeListeners = [];
  const writes = [];
  let resolveExplanation;
  let resolveComposeStarted;
  const composeStarted = new Promise((resolve) => {
    resolveComposeStarted = resolve;
  });
  const pendingExplanation = new Promise((resolve) => {
    resolveExplanation = resolve;
  });
  const runtime = startBrowserCognitiveOverlay({
    doc,
    win: fakeWindow([], {
      storageChangeListeners,
      getSelectionText: () => "KL divergence"
    }),
    config: mergeConfig(DEFAULT_CONFIG, { featureEnabled: true }),
    agentClient: {
      composeShortExplanation: async (input) => {
        resolveComposeStarted();
        return pendingExplanation.then(() => ({
          status: AgentResultStatus.AVAILABLE,
          target: input.target,
          microExplanation: "Late KL divergence explanation.",
          versionMetadata: { id: "ver_late", source: "external_agent" }
        }));
      }
    },
    memoryClient: { writeMemoryEvent: async (payload) => writes.push(payload) },
    now: () => 1000
  });
  runtime.contextTracker.update = () => ({
    id: "p-kl",
    type: "paragraph",
    text: "PPO clipping and KL divergence limit how far a policy update can move."
  });
  runtime.behaviorTracker.observeFragment = () => ({});
  runtime.behaviorTracker.getSummary = () => ({
    selectedPreciseTerm: true,
    selectionText: "KL divergence"
  });

  const evaluation = runtime.evaluate();
  await composeStarted;
  for (const listener of storageChangeListeners) {
    listener({ [BROWSER_CONFIG_STORAGE_KEY]: { newValue: { featureEnabled: false } } }, "local");
  }
  resolveExplanation();
  await evaluation;

  const eventTypes = writes.map((write) => write.event.type);
  assert.equal(eventTypes.includes(MemoryEventType.EXPLANATION_SHOWN), false);
  assert.equal(eventTypes.includes(MemoryEventType.PARAGRAPH_PROMPTED), false);
  const overlayRoot = doc.body.querySelector("#browser-cognitive-overlay");
  assert.equal(!overlayRoot || overlayRoot.hidden, true);
  assert.equal(doc.documentElement.dataset.bcoState, "disabled");
  runtime.stop();
});

test("content suppresses stale in-flight explanation after config changes and re-enable", async () => {
  const doc = fakeDocument();
  const storageChangeListeners = [];
  const writes = [];
  let resolveExplanation;
  let resolveComposeStarted;
  const composeStarted = new Promise((resolve) => {
    resolveComposeStarted = resolve;
  });
  const pendingExplanation = new Promise((resolve) => {
    resolveExplanation = resolve;
  });
  const runtime = startBrowserCognitiveOverlay({
    doc,
    win: fakeWindow([], {
      storageChangeListeners,
      getSelectionText: () => "KL divergence"
    }),
    config: mergeConfig(DEFAULT_CONFIG, { featureEnabled: true, devMode: true }),
    agentClient: {
      composeShortExplanation: async (input) => {
        resolveComposeStarted();
        return pendingExplanation.then(() => ({
          status: AgentResultStatus.AVAILABLE,
          target: input.target,
          microExplanation: "Stale KL divergence explanation.",
          versionMetadata: { id: "ver_stale", source: "external_agent" }
        }));
      }
    },
    memoryClient: { writeMemoryEvent: async (payload) => writes.push(payload) },
    now: () => 1000
  });
  runtime.contextTracker.update = () => ({
    id: "p-kl",
    type: "paragraph",
    text: "PPO clipping and KL divergence limit how far a policy update can move."
  });
  runtime.behaviorTracker.observeFragment = () => ({});
  runtime.behaviorTracker.getSummary = () => ({
    selectedPreciseTerm: true,
    selectionText: "KL divergence"
  });

  const evaluation = runtime.evaluate();
  await composeStarted;
  for (const listener of storageChangeListeners) {
    listener({ [BROWSER_CONFIG_STORAGE_KEY]: { newValue: { featureEnabled: false } } }, "local");
    listener({
      [BROWSER_CONFIG_STORAGE_KEY]: {
        newValue: {
          featureEnabled: true,
          localGateway: { endpoint: "http://127.0.0.1:19999" }
        }
      }
    }, "local");
  }
  resolveExplanation();
  await evaluation;

  const eventTypes = writes.map((write) => write.event.type);
  assert.equal(eventTypes.includes(MemoryEventType.EXPLANATION_SHOWN), false);
  assert.equal(eventTypes.includes(MemoryEventType.PARAGRAPH_PROMPTED), false);
  const overlayRoot = doc.body.querySelector("#browser-cognitive-overlay");
  assert.equal(!overlayRoot || overlayRoot.hidden, true);
  assert.equal(doc.documentElement.dataset.bcoState, "started");
  const lastAgentResult = JSON.parse(doc.documentElement.dataset.bcoLastAgentResult);
  assert.equal(lastAgentResult.reason, "runtime_config_changed");
  runtime.stop();
});

test("regeneration writes one request event owned by content runtime", async () => {
  const doc = fakeDocument();
  const writes = [];
  const runtime = startBrowserCognitiveOverlay({
    doc,
    win: fakeWindow([]),
    config: mergeConfig(DEFAULT_CONFIG, { featureEnabled: true }),
    agentClient: {
      regenerateExplanation: async (input) => ({
        status: AgentResultStatus.AVAILABLE,
        target: input.target,
        microExplanation: "A contextual rephrase.",
        versionMetadata: {
          id: "ver2",
          previousVersionId: input.previousVersion?.id,
          feedbackEventId: input.feedbackEvent?.id,
          source: "external_agent"
        }
      })
    },
    memoryClient: { writeMemoryEvent: async (payload) => writes.push(payload) },
    now: () => 1000
  });

  runtime.overlay.show({
    concept: "KL divergence",
    knowledgeType: "technology",
    micro: "Original explanation.",
    expanded: "Expanded explanation.",
    context: { fragmentId: "p1", fragmentType: "paragraph" },
    fragment: { id: "p1", type: "paragraph", text: "KL divergence limits policy updates." },
    targetObject: { canonicalName: "KL divergence", observedText: "KL divergence", knowledgeType: "technology" },
    explanationVersion: {
      id: "ver1",
      style: "concise",
      status: AgentResultStatus.AVAILABLE,
      source: "external_agent",
      text: "Original explanation."
    }
  });

  await runtime.overlay.regenerate();

  const regenerationEvents = writes
    .map((write) => write.event)
    .filter((event) => event.type === MemoryEventType.REQUESTED_REGENERATION);
  assert.equal(regenerationEvents.length, 1);
  assert.equal(regenerationEvents[0].previousExplanationVersionId, "ver1");
  assert.equal(regenerationEvents[0].requestedStyle, "contextual_role");
  assert.equal(doc.body.querySelector(".bco-micro").textContent, "A contextual rephrase.");
  runtime.stop();
});

test("content suppresses stale in-flight regeneration after config changes", async () => {
  const doc = fakeDocument();
  const storageChangeListeners = [];
  const writes = [];
  let resolveRegeneration;
  let resolveRegenerationStarted;
  const regenerationStarted = new Promise((resolve) => {
    resolveRegenerationStarted = resolve;
  });
  const pendingRegeneration = new Promise((resolve) => {
    resolveRegeneration = resolve;
  });
  const runtime = startBrowserCognitiveOverlay({
    doc,
    win: fakeWindow([], { storageChangeListeners }),
    config: mergeConfig(DEFAULT_CONFIG, { featureEnabled: true }),
    agentClient: {
      regenerateExplanation: async (input) => {
        resolveRegenerationStarted();
        return pendingRegeneration.then(() => ({
          status: AgentResultStatus.AVAILABLE,
          target: input.target,
          microExplanation: "Stale rewrite from previous endpoint.",
          versionMetadata: {
            id: "ver_stale_rewrite",
            previousVersionId: input.previousVersion?.id,
            source: "external_agent"
          }
        }));
      }
    },
    memoryClient: { writeMemoryEvent: async (payload) => writes.push(payload) },
    now: () => 1000
  });

  runtime.overlay.show({
    concept: "KL divergence",
    knowledgeType: "technology",
    micro: "Original explanation.",
    context: { fragmentId: "p1", fragmentType: "paragraph" },
    fragment: { id: "p1", type: "paragraph", text: "KL divergence limits policy updates." },
    targetObject: { canonicalName: "KL divergence", observedText: "KL divergence", knowledgeType: "technology" },
    explanationVersion: {
      id: "ver1",
      style: "concise",
      status: AgentResultStatus.AVAILABLE,
      source: "external_agent",
      text: "Original explanation."
    }
  });

  const regeneration = runtime.overlay.regenerate();
  await regenerationStarted;
  for (const listener of storageChangeListeners) {
    listener({
      [BROWSER_CONFIG_STORAGE_KEY]: {
        newValue: {
          featureEnabled: true,
          localGateway: { endpoint: "http://127.0.0.1:19999" }
        }
      }
    }, "local");
  }
  resolveRegeneration();
  const result = await regeneration;

  assert.equal(result.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(result.reason, "runtime_config_changed");
  assert.equal(doc.body.querySelector(".bco-micro").textContent, "Original explanation.");
  const status = doc.body.querySelector(".bco-status");
  assert.equal(!status || status.hidden, true);
  assert.equal(writes.filter((write) => write.event.type === MemoryEventType.REQUESTED_REGENERATION).length, 1);
  runtime.stop();
});

test("production mode keeps concept diagnostics out of the page dataset", async () => {
  const doc = fakeDocument();
  const runtime = startBrowserCognitiveOverlay({
    doc,
    win: fakeWindow([], { getSelectionText: () => "KL divergence" }),
    config: mergeConfig(DEFAULT_CONFIG, { featureEnabled: true }),
    agentClient: {
      composeShortExplanation: async (input) => ({
        status: AgentResultStatus.AVAILABLE,
        target: input.target,
        microExplanation: "KL divergence keeps policy updates from moving too far.",
        versionMetadata: { id: "ver_kl_prod", source: "external_agent" }
      })
    },
    memoryClient: { writeMemoryEvent: async () => {} },
    now: () => 1000
  });
  runtime.contextTracker.update = () => ({
    id: "p-kl",
    type: "paragraph",
    text: "PPO clipping and KL divergence limit how far a policy update can move."
  });
  runtime.behaviorTracker.observeFragment = () => ({});
  runtime.behaviorTracker.getSummary = () => ({
    selectedPreciseTerm: true,
    selectionText: "KL divergence"
  });

  await runtime.evaluate();

  assert.equal(doc.body.querySelector("#browser-cognitive-overlay").hidden, false);
  assert.equal(doc.documentElement.dataset.bcoLastDecision, undefined);
  assert.equal(doc.documentElement.dataset.bcoLastAgentResult, undefined);
  assert.equal(doc.documentElement.dataset.bcoState, "started");
  runtime.stop();
});

test("production mode ignores page-dispatched debug and enable events", () => {
  const doc = fakeDocument();
  const runtime = startBrowserCognitiveOverlay({
    doc,
    win: fakeWindow([]),
    config: mergeConfig(DEFAULT_CONFIG, { featureEnabled: false }),
    now: () => 1000
  });

  assert.equal(runtime.started, false);

  doc.dispatchEvent({ type: "bco:debug-show" });
  assert.equal(doc.body.querySelector("#browser-cognitive-overlay"), null);

  doc.documentElement.dataset.bcoEnabled = "true";
  doc.dispatchEvent({ type: "bco:enable" });
  assert.equal(doc.documentElement.dataset.bcoState, "disabled");
});

test("learning events carry hashed page metadata instead of raw URL and title", async () => {
  const doc = fakeDocument();
  const writes = [];
  const runtime = startBrowserCognitiveOverlay({
    doc,
    win: fakeWindow([], { getSelectionText: () => "KL divergence" }),
    config: mergeConfig(DEFAULT_CONFIG, { featureEnabled: true }),
    agentClient: {
      composeShortExplanation: async (input) => ({
        status: AgentResultStatus.AVAILABLE,
        target: input.target,
        microExplanation: "KL divergence keeps policy updates from moving too far.",
        versionMetadata: { id: "ver_kl_meta", source: "external_agent" }
      })
    },
    memoryClient: { writeMemoryEvent: async (payload) => writes.push(payload) },
    now: () => 1000
  });
  runtime.contextTracker.update = () => ({
    id: "p-kl",
    type: "paragraph",
    text: "PPO clipping and KL divergence limit how far a policy update can move."
  });
  runtime.behaviorTracker.observeFragment = () => ({});
  runtime.behaviorTracker.getSummary = () => ({
    selectedPreciseTerm: true,
    selectionText: "KL divergence"
  });

  await runtime.evaluate();

  const contexts = writes.map((write) => write.event.context).filter((context) => context?.fragmentId);
  assert.ok(contexts.length >= 1);
  for (const context of contexts) {
    assert.equal(context.url, undefined);
    assert.equal(context.title, undefined);
    assert.equal(context.pageOrigin, "https://example.test");
    assert.ok(context.pagePathHash);
    assert.ok(context.titleHash);
  }
  assert.doesNotMatch(JSON.stringify(writes), /\/article|"Article"/);
  runtime.stop();
});

test("dismissing the streaming card mid-stream blocks ledger writes for the late result", async () => {
  const doc = fakeDocument();
  const writes = [];
  let resolveFinal;
  const finalGate = new Promise((resolve) => {
    resolveFinal = resolve;
  });
  const runtime = startBrowserCognitiveOverlay({
    doc,
    win: fakeWindow([], { getSelectionText: () => "Loquat" }),
    config: mergeConfig(DEFAULT_CONFIG, { featureEnabled: true }),
    agentClient: {
      streamExplanation: async (input, { onEvent }) => {
        onEvent({ type: StreamEventType.SESSION_START, sessionId: "stream_race", sequence: 0, target: input.target });
        onEvent({ type: StreamEventType.LANE_DELTA, sessionId: "stream_race", sequence: 1, lane: StreamLane.DIRECT, text: "Loquat is a fruit." });
        await finalGate;
        return {
          status: AgentResultStatus.AVAILABLE,
          target: input.target,
          text: "Loquat is a fruit.",
          microExplanation: "Loquat is a fruit.",
          versionMetadata: { id: "ver_race", source: "external_agent" }
        };
      }
    },
    memoryClient: { writeMemoryEvent: async (payload) => writes.push(payload) },
    now: () => 1000
  });
  runtime.contextTracker.update = () => ({
    id: "p-loquat",
    type: "paragraph",
    text: "Changtai loquat is a well-known agricultural product."
  });
  runtime.behaviorTracker.observeFragment = () => ({});
  runtime.behaviorTracker.getSummary = () => ({
    selectedPreciseTerm: true,
    selectionText: "Loquat"
  });

  const evaluation = runtime.evaluate();
  // The stream events above fire synchronously, so the streaming card is
  // already visible; the user closes it while the final result is pending.
  assert.equal(doc.body.querySelector("#browser-cognitive-overlay").hidden, false);
  runtime.overlay.dismiss();
  resolveFinal();
  const decision = await evaluation;

  assert.equal(decision.suppressions.includes("prompt_dismissed_during_stream"), true);
  const eventTypes = writes.map((write) => write.event.type);
  assert.equal(eventTypes.includes(MemoryEventType.EXPLANATION_SHOWN), false);
  assert.equal(eventTypes.includes(MemoryEventType.PARAGRAPH_PROMPTED), false);
  assert.equal(eventTypes.filter((type) => type === MemoryEventType.DISMISSED).length, 1);
  assert.equal(runtime.overlay.currentPrompt, null);
  runtime.stop();
});

test("feature gate hot disable stops the evaluation interval and re-enable restarts it", () => {
  const doc = fakeDocument();
  const timers = createFakeTimers();
  const storageChangeListeners = [];
  const runtime = startBrowserCognitiveOverlay({
    doc,
    win: fakeWindow([], { timers, storageChangeListeners }),
    config: mergeConfig(DEFAULT_CONFIG, { featureEnabled: true }),
    memoryClient: { writeMemoryEvent: async () => {} },
    now: () => 1000
  });

  assert.equal(timers.activeIntervalCount(), 1);

  for (const listener of [...storageChangeListeners]) {
    listener({ [BROWSER_CONFIG_STORAGE_KEY]: { newValue: { featureEnabled: false } } }, "local");
  }
  assert.equal(doc.documentElement.dataset.bcoState, "disabled");
  assert.equal(timers.activeIntervalCount(), 0);

  for (const listener of [...storageChangeListeners]) {
    listener({ [BROWSER_CONFIG_STORAGE_KEY]: { newValue: { featureEnabled: true } } }, "local");
  }
  assert.equal(doc.documentElement.dataset.bcoState, "started");
  assert.equal(timers.activeIntervalCount(), 1);

  runtime.stop();
  assert.equal(timers.activeIntervalCount(), 0);
});

function fakeWindow(storageAccesses, options = {}) {
  const timers = options.timers;
  const storageChangeListeners = options.storageChangeListeners ?? [];
  const storedBrowserConfig = options.storedBrowserConfig;
  return {
    location: { href: "https://example.test/article" },
    innerWidth: 1024,
    innerHeight: 768,
    chrome: {
      storage: {
        local: {
          get(keys, callback) {
            storageAccesses.push(["storage.local.get", Array.isArray(keys) ? keys[0] : keys]);
            Promise.resolve().then(() => callback?.({ [BROWSER_CONFIG_STORAGE_KEY]: storedBrowserConfig }));
          }
        },
        onChanged: {
          addListener(handler) {
            storageChangeListeners.push(handler);
          }
        }
      }
    },
    localStorage: {
      getItem(key) {
        storageAccesses.push(["getItem", key]);
        throw new Error("browser memory storage should not be read");
      },
      setItem(key) {
        storageAccesses.push(["setItem", key]);
        throw new Error("browser memory storage should not be written");
      }
    },
    indexedDB: {
      open() {
        storageAccesses.push(["indexedDB.open"]);
        throw new Error("indexedDB should not be opened");
      }
    },
    getSelection: () => options.getSelection?.() ?? ({ toString: () => options.getSelectionText?.() ?? "" }),
    addEventListener: () => {},
    setTimeout: timers?.setTimeout ?? (() => 1),
    clearTimeout: timers?.clearTimeout ?? (() => {}),
    setInterval: timers?.setInterval ?? (() => 1),
    clearInterval: timers?.clearInterval ?? (() => {})
  };
}

function createFakeTimers() {
  let nextId = 1;
  const timeouts = new Map();
  const intervals = new Map();
  return {
    setTimeout(handler) {
      const id = nextId;
      nextId += 1;
      timeouts.set(id, handler);
      return id;
    },
    clearTimeout(id) {
      timeouts.delete(id);
    },
    setInterval(handler) {
      const id = nextId;
      nextId += 1;
      intervals.set(id, handler);
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    activeIntervalCount() {
      return intervals.size;
    },
    runAll() {
      const pending = Array.from(timeouts.entries());
      timeouts.clear();
      for (const [, handler] of pending) handler();
    }
  };
}

function fakeDocument() {
  const body = new FakeElement("body");
  const listeners = new Map();
  return {
    body,
    title: "Article",
    activeElement: body,
    documentElement: { dataset: {} },
    createElement: (tagName) => new FakeElement(tagName),
    addEventListener: (type, handler) => listeners.set(type, handler),
    dispatchEvent: (event) => listeners.get(event.type)?.(event),
    querySelectorAll: () => []
  };
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this._textContent = "";
    this.className = "";
    this.hidden = false;
    this.type = "";
  }

  append(...children) {
    for (const child of children) {
      if (child && typeof child === "object") child.parentElement = this;
    }
    this.children.push(...children);
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  click() {
    this.listeners.get("click")?.();
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      if (matchesSelector(node, selector)) matches.push(node);
      for (const child of node.children) visit(child);
    };
    visit(this);
    return matches;
  }

  set innerHTML(value) {
    this.children = [];
    this._innerHTML = value;
  }

  get textContent() {
    return `${this._textContent}${this.children.map((child) => child.textContent ?? "").join("")}`;
  }

  set textContent(value) {
    this.children = [];
    this._textContent = String(value ?? "");
  }
}

function matchesSelector(node, selector) {
  if (selector === "button") return node.tagName === "button";
  if (selector.startsWith(".")) return String(node.className).split(/\s+/).includes(selector.slice(1));
  if (selector.startsWith("#")) return node.id === selector.slice(1);
  return node.tagName === selector;
}
