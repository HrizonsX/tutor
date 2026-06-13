import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AgentResultStatus, MemoryEventType, StreamEventType, StreamLane } from "../src/shared/contracts.js";
import { CognitiveOverlay } from "../src/extension/overlay.js";
import { fakeDocument } from "./helpers/fake-dom.js";

test("overlay renders focused actions and replaces regenerated explanation", async () => {
  const doc = fakeDocument();
  const feedback = [];
  const overlay = new CognitiveOverlay({
    doc,
    onFeedback: (event) => feedback.push(event),
    onRegenerate: async () => ({
      status: AgentResultStatus.AVAILABLE,
      id: "ver2",
      text: "A different explanation.",
      style: "contextual_role",
      source: "external_agent"
    })
  });

  overlay.show({
    concept: "Lagrange point",
    knowledgeType: "astronomy",
    micro: "Original explanation.",
    expanded: "Expanded explanation.",
    context: { fragmentId: "p1" },
    explanationVersion: { id: "ver1", style: "concise", status: AgentResultStatus.AVAILABLE, source: "external_agent" }
  });

  assert.equal(doc.body.querySelector(".bco-title").textContent, "Lagrange point");
  assert.equal(doc.body.querySelector(".bco-concept-icon").attributes.get("data-icon"), "concept");

  const actions = doc.body.querySelector(".bco-actions").querySelectorAll("button");
  assert.deepEqual(actions.map((button) => button.textContent), [
    "重新解释",
    "困惑",
    "不提示此类"
  ]);
  assert.deepEqual(actions.map((button) => button.querySelector(".bco-button-icon")?.attributes.get("data-icon")), [
    "refresh",
    "help",
    "bell-off"
  ]);
  assert.equal(actions[0].className.split(/\s+/).includes("bco-button-primary"), true);
  const close = doc.body.querySelector(".bco-close");
  assert.equal(close?.textContent, "x");
  assert.equal(doc.body.querySelector(".bco-card").children.includes(close), true);

  actions.find((button) => button.textContent === "困惑").click();
  assert.equal(feedback[0].type, MemoryEventType.MARKED_CONFUSING);
  assert.equal(feedback[0].explanationVersionId, "ver1");

  await overlay.regenerate();
  assert.equal(doc.body.querySelector(".bco-micro").textContent, "A different explanation.");
  assert.equal(feedback.some((event) => event.type === MemoryEventType.REQUESTED_REGENERATION), true);
});

test("overlay links feedback on regenerated explanations to the regeneration request", async () => {
  const doc = fakeDocument();
  const feedback = [];
  const overlay = new CognitiveOverlay({
    doc,
    onFeedback: (event) => feedback.push(event),
    onRegenerate: async () => ({
      status: AgentResultStatus.AVAILABLE,
      id: "ver2",
      text: "A different explanation.",
      style: "contextual_role",
      source: "external_agent",
      feedbackEventId: "evt_regen"
    })
  });

  overlay.show({
    concept: "KL divergence",
    knowledgeType: "technology",
    micro: "Original explanation.",
    expanded: "Expanded explanation.",
    context: { fragmentId: "p1", explanationVersionId: "ver1", explanationStyle: "concise" },
    explanationVersion: { id: "ver1", style: "concise", status: AgentResultStatus.AVAILABLE, source: "external_agent" }
  });

  await overlay.regenerate();
  doc.body.querySelectorAll("button").find((button) => button.textContent === "困惑").click();

  const confusing = feedback.find((event) => event.type === MemoryEventType.MARKED_CONFUSING);
  assert.equal(confusing.explanationVersionId, "ver2");
  assert.equal(confusing.explanationStyle, "contextual_role");
  assert.equal(confusing.feedbackEventId, "evt_regen");
  assert.equal(confusing.context.explanationVersionId, "ver2");
  assert.equal(confusing.context.explanationStyle, "contextual_role");
});

test("overlay records each feedback type once per explanation version", () => {
  const doc = fakeDocument();
  const feedback = [];
  const overlay = new CognitiveOverlay({
    doc,
    onFeedback: (event) => feedback.push(event)
  });

  overlay.show({
    concept: "KL divergence",
    knowledgeType: "technology",
    micro: "Original explanation.",
    expanded: "Expanded explanation.",
    context: { fragmentId: "p1" },
    explanationVersion: { id: "ver1", style: "concise", status: AgentResultStatus.AVAILABLE, source: "external_agent" }
  });

  const confusing = doc.body.querySelectorAll("button").find((button) => button.textContent === "困惑");
  confusing.click();
  confusing.click();

  assert.equal(feedback.filter((event) => event.type === MemoryEventType.MARKED_CONFUSING).length, 1);
});

test("overlay builds action icons and clears nodes without unsafe innerHTML", () => {
  const doc = fakeDocument({ throwOnInnerHTML: true });
  const overlay = new CognitiveOverlay({ doc });

  overlay.show({
    concept: "KL divergence",
    knowledgeType: "technology",
    micro: "Original explanation.",
    expanded: "Expanded explanation.",
    context: { fragmentId: "p1" },
    explanationVersion: { id: "ver1", style: "concise", status: AgentResultStatus.AVAILABLE, source: "external_agent" }
  });

  assert.equal(doc.body.querySelector(".bco-concept-icon").querySelector("svg").tagName, "svg");
  assert.equal(doc.body.querySelector(".bco-button-icon").querySelector("svg").tagName, "svg");

  overlay.dismiss();
  overlay.show({
    concept: "Policy gradient",
    knowledgeType: "technology",
    micro: "Another explanation.",
    expanded: "",
    context: { fragmentId: "p2" },
    explanationVersion: { id: "ver2", style: "concise", status: AgentResultStatus.AVAILABLE, source: "external_agent" }
  });

  assert.equal(doc.body.querySelector(".bco-title").textContent, "Policy gradient");
});

test("overlay ignores duplicate in-flight regeneration requests", async () => {
  const doc = fakeDocument();
  const feedback = [];
  const regenerations = [];
  let resolveRegeneration;
  const pendingRegeneration = new Promise((resolve) => {
    resolveRegeneration = resolve;
  });
  const overlay = new CognitiveOverlay({
    doc,
    onFeedback: (event) => feedback.push(event),
    onRegenerate: async (...args) => {
      regenerations.push(args);
      return pendingRegeneration;
    }
  });

  overlay.show({
    concept: "KL divergence",
    knowledgeType: "technology",
    micro: "Original explanation.",
    expanded: "Expanded explanation.",
    context: { fragmentId: "p1" },
    explanationVersion: { id: "ver1", style: "concise", status: AgentResultStatus.AVAILABLE, source: "external_agent" }
  });

  const first = overlay.regenerate();
  const second = overlay.regenerate();

  assert.equal(regenerations.length, 1);
  assert.equal(feedback.filter((event) => event.type === MemoryEventType.REQUESTED_REGENERATION).length, 1);
  assert.equal(await second, null);

  resolveRegeneration({
    status: AgentResultStatus.AVAILABLE,
    id: "ver2",
    text: "A different explanation.",
    style: "contextual_role",
    source: "external_agent"
  });

  await first;
  assert.equal(doc.body.querySelector(".bco-micro").textContent, "A different explanation.");
});

test("overlay suppresses feedback actions while regeneration is in flight", async () => {
  const doc = fakeDocument();
  const feedback = [];
  let resolveRegeneration;
  const pendingRegeneration = new Promise((resolve) => {
    resolveRegeneration = resolve;
  });
  const overlay = new CognitiveOverlay({
    doc,
    onFeedback: (event) => feedback.push(event),
    onRegenerate: async () => pendingRegeneration
  });

  overlay.show({
    concept: "KL divergence",
    knowledgeType: "technology",
    micro: "Original explanation.",
    expanded: "Expanded explanation.",
    context: { fragmentId: "p1" },
    explanationVersion: { id: "ver1", style: "concise", status: AgentResultStatus.AVAILABLE, source: "external_agent" }
  });

  const muteType = doc.body.querySelectorAll("button").find((button) => button.textContent === "不提示此类");
  const first = overlay.regenerate();

  assert.equal(muteType.disabled, true);
  muteType.click();
  assert.equal(feedback.filter((event) => event.type === MemoryEventType.MUTED_CATEGORY).length, 0);

  resolveRegeneration({
    status: AgentResultStatus.AVAILABLE,
    id: "ver2",
    text: "A different explanation.",
    style: "contextual_role",
    source: "external_agent"
  });

  await first;
  assert.equal(muteType.disabled, false);
});

test("overlay keeps close available while regeneration is in flight", async () => {
  const doc = fakeDocument();
  let resolveRegeneration;
  const pendingRegeneration = new Promise((resolve) => {
    resolveRegeneration = resolve;
  });
  const overlay = new CognitiveOverlay({
    doc,
    onRegenerate: async () => pendingRegeneration
  });

  overlay.show({
    concept: "KL divergence",
    knowledgeType: "technology",
    micro: "Original explanation.",
    expanded: "Expanded explanation.",
    context: { fragmentId: "p1" },
    explanationVersion: { id: "ver1", style: "concise", status: AgentResultStatus.AVAILABLE, source: "external_agent" }
  });

  const close = doc.body.querySelector(".bco-icon-button");
  const first = overlay.regenerate();

  assert.equal(close.disabled, false);
  close.click();
  assert.equal(overlay.root.hidden, true);

  resolveRegeneration({
    status: AgentResultStatus.AVAILABLE,
    id: "ver2",
    text: "A different explanation.",
    style: "contextual_role",
    source: "external_agent"
  });

  await first;
  assert.equal(overlay.root.hidden, true);
});

test("overlay ignores late regeneration after dismissal", async () => {
  const doc = fakeDocument();
  const statusWrites = [];
  let resolveRegeneration;
  const pendingRegeneration = new Promise((resolve) => {
    resolveRegeneration = resolve;
  });
  const overlay = new CognitiveOverlay({
    doc,
    onRegenerate: async () => pendingRegeneration
  });
  const setStatus = overlay.setStatus.bind(overlay);
  overlay.setStatus = (text) => {
    statusWrites.push(text);
    setStatus(text);
  };

  overlay.show({
    concept: "KL divergence",
    knowledgeType: "technology",
    micro: "Original explanation.",
    expanded: "Expanded explanation.",
    context: { fragmentId: "p1" },
    explanationVersion: { id: "ver1", style: "concise", status: AgentResultStatus.AVAILABLE, source: "external_agent" }
  });

  const first = overlay.regenerate();
  overlay.dismiss();
  statusWrites.length = 0;

  resolveRegeneration({
    status: AgentResultStatus.AVAILABLE,
    id: "ver2",
    text: "A different explanation.",
    style: "contextual_role",
    source: "external_agent"
  });

  assert.equal(await first, null);
  assert.deepEqual(statusWrites, []);
  assert.equal(overlay.root.hidden, true);
});

test("overlay preserves original explanation when regeneration fails", async () => {
  const doc = fakeDocument();
  const overlay = new CognitiveOverlay({
    doc,
    onRegenerate: async () => {
      throw new Error("no model");
    }
  });

  overlay.show({
    concept: "NASA",
    micro: "Original explanation.",
    expanded: "Expanded explanation.",
    context: { fragmentId: "p1" },
    explanationVersion: { id: "ver1", status: AgentResultStatus.AVAILABLE, source: "external_agent" }
  });

  await overlay.regenerate();
  assert.equal(doc.body.querySelector(".bco-micro").textContent, "Original explanation.");
  assert.match(doc.body.querySelector(".bco-status").textContent, /Could not/);
});

test("overlay ignores proactive prompts without valid Agent explanation version", () => {
  const doc = fakeDocument();
  const overlay = new CognitiveOverlay({ doc });

  overlay.show({
    concept: "Lagrange point",
    micro: "Local fallback should not render.",
    expanded: "Expanded.",
    context: { fragmentId: "p1" },
    explanationVersion: { id: "local" }
  });

  assert.equal(doc.body.querySelector(".bco-card"), null);
});

test("overlay preserves text and shows compact unavailable state on regeneration unavailable", async () => {
  const doc = fakeDocument();
  const overlay = new CognitiveOverlay({
    doc,
    onRegenerate: async () => ({ status: AgentResultStatus.UNAVAILABLE, reason: "agent_provider_unconfigured" })
  });

  overlay.show({
    concept: "NASA",
    micro: "Original explanation.",
    expanded: "Expanded explanation.",
    context: { fragmentId: "p1" },
    explanationVersion: { id: "ver1", status: AgentResultStatus.AVAILABLE, source: "external_agent" }
  });

  await overlay.regenerate();
  assert.equal(doc.body.querySelector(".bco-micro").textContent, "Original explanation.");
  assert.match(doc.body.querySelector(".bco-status").textContent, /not available/i);
});

test("overlay replaces expanded detail after regeneration", async () => {
  const doc = fakeDocument();
  const overlay = new CognitiveOverlay({
    doc,
    onRegenerate: async () => ({
      status: AgentResultStatus.AVAILABLE,
      id: "ver2",
      text: "Regenerated explanation.",
      expandedExplanation: "Regenerated expanded detail.",
      style: "contextual_role",
      source: "external_agent"
    })
  });

  overlay.show({
    concept: "KL divergence",
    micro: "Original explanation.",
    expanded: "Original expanded detail.",
    context: { fragmentId: "p1" },
    explanationVersion: { id: "ver1", status: AgentResultStatus.AVAILABLE, source: "external_agent" }
  });

  overlay.expand();
  assert.equal(doc.body.querySelector(".bco-expanded").textContent, "Original expanded detail.");

  await overlay.regenerate();

  assert.equal(doc.body.querySelector(".bco-micro").textContent, "Regenerated explanation.");
  assert.equal(doc.body.querySelector(".bco-expanded").textContent, "Regenerated expanded detail.");
});

test("overlay reports unavailable detail after regeneration removes expanded text", async () => {
  const doc = fakeDocument();
  const overlay = new CognitiveOverlay({
    doc,
    onRegenerate: async () => ({
      status: AgentResultStatus.AVAILABLE,
      id: "ver2",
      text: "Regenerated explanation.",
      style: "contextual_role",
      source: "external_agent"
    })
  });

  overlay.show({
    concept: "KL divergence",
    micro: "Original explanation.",
    expanded: "Original expanded detail.",
    context: { fragmentId: "p1" },
    explanationVersion: { id: "ver1", status: AgentResultStatus.AVAILABLE, source: "external_agent" }
  });

  overlay.expand();
  assert.equal(doc.body.querySelector(".bco-expanded").textContent, "Original expanded detail.");

  await overlay.regenerate();
  overlay.expand();

  assert.equal(doc.body.querySelector(".bco-expanded").hidden, true);
  assert.equal(doc.body.querySelector(".bco-status").textContent, "More detail is not available right now.");
});

test("overlay renders independent streaming lanes and appends deltas", () => {
  const doc = fakeDocument();
  const overlay = new CognitiveOverlay({ doc });

  overlay.showStreaming({
    id: "prompt_stream",
    streamSessionId: "session_1",
    concept: "Loquat",
    knowledgeType: "other",
    context: { fragmentId: "p1" },
    targetObject: { canonicalName: "Loquat" },
    explanationVersion: { id: "pending", status: AgentResultStatus.AVAILABLE, source: "external_agent" }
  });
  assert.deepEqual(doc.body.querySelectorAll(".bco-lane-title").map((node) => node.textContent), [
    "概念解释",
    "关联记忆"
  ]);
  assert.equal(doc.body.querySelector(".bco-stream-association").textContent, "正在查找关联记忆...");
  overlay.applyStreamEvent({ type: StreamEventType.LANE_DELTA, sessionId: "session_1", sequence: 1, lane: StreamLane.DIRECT, text: "Direct " });
  overlay.applyStreamEvent({ type: StreamEventType.LANE_DELTA, sessionId: "session_1", sequence: 2, lane: StreamLane.ASSOCIATION, text: "Related to Changtai." });

  assert.equal(doc.body.querySelector(".bco-stream-direct").textContent, "Direct ");
  assert.equal(doc.body.querySelector(".bco-stream-association").textContent, "Related to Changtai.");
  assert.equal(doc.body.querySelectorAll(".bco-lane").length, 2);
});

test("overlay shows recall bridge names and no-association copy", () => {
  const doc = fakeDocument();
  const overlay = new CognitiveOverlay({ doc });

  overlay.showStreaming({
    id: "prompt_stream",
    streamSessionId: "session_2",
    concept: "Loquat",
    context: { fragmentId: "p1" },
    targetObject: { canonicalName: "Loquat" },
    explanationVersion: { id: "pending", status: AgentResultStatus.AVAILABLE, source: "external_agent" }
  });
  overlay.applyStreamEvent({
    type: StreamEventType.RECALL_STATUS,
    sessionId: "session_2",
    sequence: 1,
    lane: StreamLane.ASSOCIATION,
    bridges: [{ relatedConcept: "Changtai" }, { relatedConcept: "Putian" }]
  });
  overlay.applyStreamEvent({
    type: StreamEventType.LANE_FINAL,
    sessionId: "session_2",
    sequence: 2,
    lane: StreamLane.ASSOCIATION,
    result: { status: AgentResultStatus.UNAVAILABLE, reason: "no_memory_bridge" }
  });

  assert.deepEqual(doc.body.querySelectorAll(".bco-stream-bridge").map((node) => node.textContent), ["Changtai", "Putian"]);
  assert.equal(doc.body.querySelector(".bco-stream-association").textContent, "暂无关联");
});

test("overlay stylesheet renders recall bridge names as compact tags", () => {
  const css = readFileSync(new URL("../src/extension/overlay.css", import.meta.url), "utf8");

  assert.match(css, /\.bco-stream-bridges\s*\{[\s\S]*display:\s*flex/);
  assert.match(css, /\.bco-stream-bridge\s*\{[\s\S]*border:\s*1px solid/);
  assert.match(css, /\.bco-stream-bridge\s*\{[\s\S]*border-radius:\s*(?:999px|6px)/);
  assert.match(css, /\.bco-stream-bridge\s*\{[\s\S]*white-space:\s*nowrap/);
});

test("overlay stylesheet positions close button inside the card corner", () => {
  const css = readFileSync(new URL("../src/extension/overlay.css", import.meta.url), "utf8");

  assert.match(css, /\.bco-card\s*\{[\s\S]*position:\s*relative/);
  assert.match(css, /\.bco-close\s*\{[\s\S]*position:\s*absolute/);
  assert.match(css, /\.bco-close\s*\{[\s\S]*right:\s*14px/);
  assert.match(css, /\.bco-close\s*\{[\s\S]*border:\s*0/);
  assert.match(css, /\.bco-close\s*\{[\s\S]*background:\s*transparent/);
});

test("overlay stylesheet matches the polished prototype shell", () => {
  const css = readFileSync(new URL("../src/extension/overlay.css", import.meta.url), "utf8");

  assert.match(css, /\.bco-root\s*\{[\s\S]*width:\s*min\(360px,\s*calc\(100vw - 24px\)\)/);
  assert.match(css, /\.bco-card\s*\{[\s\S]*overflow:\s*hidden/);
  assert.match(css, /\.bco-header\s*\{[\s\S]*border-bottom:\s*1px solid/);
  assert.match(css, /\.bco-concept-icon\s*\{[\s\S]*background:\s*#12384a/);
  assert.match(css, /\.bco-actions\s*\{[\s\S]*flex-wrap:\s*nowrap/);
  assert.match(css, /\.bco-actions\s*\{[\s\S]*justify-content:\s*flex-end/);
  assert.match(css, /\.bco-button\s*\{[\s\S]*display:\s*inline-flex/);
  assert.match(css, /\.bco-button\s*\{[\s\S]*flex:\s*0 0 auto/);
  assert.match(css, /\.bco-button-icon\s*\{[\s\S]*width:\s*14px/);
  assert.match(css, /\.bco-button-primary\s*\{[\s\S]*background:\s*#0d3142/);
});

test("overlay ignores stale streaming events and preserves close behavior", () => {
  const doc = fakeDocument();
  const dismissed = [];
  const overlay = new CognitiveOverlay({
    doc,
    onDismiss: (prompt) => dismissed.push(prompt)
  });

  overlay.showStreaming({
    id: "prompt_stream",
    streamSessionId: "session_3",
    concept: "Loquat",
    context: { fragmentId: "p1" },
    targetObject: { canonicalName: "Loquat" },
    explanationVersion: { id: "pending", status: AgentResultStatus.AVAILABLE, source: "external_agent" }
  });
  overlay.applyStreamEvent({ type: StreamEventType.LANE_DELTA, sessionId: "old", sequence: 1, lane: StreamLane.DIRECT, text: "Old" });
  overlay.applyStreamEvent({ type: StreamEventType.LANE_DELTA, sessionId: "session_3", sequence: 1, lane: StreamLane.DIRECT, text: "New" });
  overlay.applyStreamEvent({ type: StreamEventType.LANE_DELTA, sessionId: "session_3", sequence: 1, lane: StreamLane.DIRECT, text: " duplicate" });
  doc.body.querySelector(".bco-icon-button").click();

  assert.equal(doc.body.querySelector(".bco-stream-direct"), null);
  assert.equal(dismissed.length, 1);
});
