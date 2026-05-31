import test from "node:test";
import assert from "node:assert/strict";
import { composeShortExplanation } from "../src/composer.js";
import { extractConceptCandidates } from "../src/concepts.js";
import { AgentResultStatus, ExplanationStyle, FactSensitivity, MemoryEventType } from "../src/contracts.js";
import { classifyFactSensitivity } from "../src/fact-sensitivity.js";
import { scoreIntervention } from "../src/inference.js";
import { LearningMemory } from "../src/memory.js";
import { UserReadingProfile } from "../src/profile.js";
import { buildAnalysisPayload } from "../src/privacy.js";

test("technical article scenario packages local learning context for external explanation", async () => {
  const memory = new LearningMemory({ now: () => 1000 });
  memory.recordEvent({
    type: MemoryEventType.RECENTLY_SEEN,
    concept: "policy gradient",
    context: { fragmentId: "prev" },
    timestamp: 500
  });
  const fragment = {
    id: "p-kl",
    type: "paragraph",
    text: "PPO often uses KL divergence to limit how far the new policy moves from the old policy."
  };
  const candidates = extractConceptCandidates({ text: fragment.text, selectedText: "KL divergence" });
  const learningContext = memory.getLearningContext("KL divergence", { fragmentId: fragment.id, timestamp: 1000 });
  const decision = scoreIntervention({
    fragment,
    behavior: { selectedPreciseTerm: true, selectionText: "KL divergence" },
    candidates,
    learningContext
  });
  const explanation = await composeShortExplanation({
    retrievalPacket: learningContext.retrievalPacket,
    fragment,
    agentClient: {
      composeShortExplanation: async (input) => ({
        status: AgentResultStatus.AVAILABLE,
        target: input.target,
        microExplanation: "This connects to policy gradient: KL divergence keeps policy updates from moving too far.",
        versionMetadata: { id: "ver_kl" }
      })
    }
  });

  assert.equal(decision.shouldShow, true);
  assert.match(explanation.text, /policy gradient/i);
});

test("false-positive scenarios remain silent", () => {
  const candidates = extractConceptCandidates({ text: "The KL divergence term appears in this sentence." });
  const cases = [
    { dwellSignal: true, dwellMs: 30000 },
    { inactive: true, selectedPreciseTerm: true },
    { largeSelection: true },
    { codeSelection: true }
  ];

  for (const behavior of cases) {
    const decision = scoreIntervention({
      behavior,
      candidates,
      learningContext: { derivedSignals: {}, cooldowns: {} }
    });
    assert.equal(decision.shouldShow, false);
  }
});

test("recent memory avoids duplicate basic explanations", () => {
  const memory = new LearningMemory({ now: () => 1000 });
  memory.recordExplanationShown({
    concept: "KV cache",
    context: { fragmentId: "p1" },
    timestamp: 900
  });
  const candidates = extractConceptCandidates({ text: "The KV cache reuses attention keys and values." });
  const learningContext = memory.getLearningContext("KV cache", { fragmentId: "p2", timestamp: 1000 });
  const decision = scoreIntervention({
    behavior: { dwellSignal: true, dwellMs: 20000 },
    candidates,
    learningContext
  });

  assert.equal(decision.shouldShow, false);
});

test("analysis payload is bounded and does not become full-page storage", () => {
  const fragment = {
    id: "long",
    type: "paragraph",
    text: `KL divergence ${"long private article text ".repeat(200)}`
  };
  const candidates = extractConceptCandidates({ text: fragment.text });
  const payload = buildAnalysisPayload(fragment, candidates, {
    privacy: { maxContextChars: 300, maxStoredAliasChars: 120, maxStoredUrlChars: 180 }
  });

  assert.ok(payload.text.length <= 300);
  assert.equal(payload.fragmentId, "long");
  assert.equal(payload.concepts[0].canonicalName, "KL divergence");
});

test("historical allusion with stuck signal triggers short explanation", async () => {
  const memory = new LearningMemory({ now: () => 1000 });
  const fragment = {
    id: "p-history",
    type: "paragraph",
    text: "The author frames the rivalry as a Thucydides Trap because a rising power challenges an established one."
  };
  const candidates = extractConceptCandidates({ text: fragment.text, selectedText: "Thucydides Trap" });
  const context = memory.getLearningContext("Thucydides Trap", {
    fragmentId: fragment.id,
    candidate: candidates[0],
    timestamp: 1000
  });
  const decision = scoreIntervention({
    fragment,
    behavior: { selectedPreciseTerm: true, selectionText: "Thucydides Trap" },
    candidates,
    learningContext: context
  });
  const explanation = await composeShortExplanation({
    retrievalPacket: context.retrievalPacket,
    fragment,
    agentClient: {
      composeShortExplanation: async (input) => ({
        status: AgentResultStatus.AVAILABLE,
        target: input.target,
        microExplanation: "Thucydides Trap is a historical analogy about rivalry between a rising power and an established one.",
        versionMetadata: { id: "ver_history" }
      })
    }
  });

  assert.equal(decision.shouldShow, true);
  assert.match(explanation.text, /rising power|historical analogy|rivalry/i);
});

test("marked known lowers repeat prompt priority", () => {
  const memory = new LearningMemory({ now: () => 1000 });
  memory.recordFeedback({
    type: MemoryEventType.MARKED_KNOWN,
    concept: "Bretton Woods system",
    knowledgeType: "economics",
    timestamp: 1000
  });
  const fragment = {
    id: "p-money",
    type: "paragraph",
    text: "The Bretton Woods system explains why the dollar became central to postwar finance."
  };
  const candidates = extractConceptCandidates({ text: fragment.text, selectedText: "Bretton Woods" });
  const context = memory.getLearningContext("Bretton Woods system", {
    fragmentId: fragment.id,
    candidate: candidates[0],
    timestamp: 1000,
    profileHints: { familiarObject: true }
  });
  const decision = scoreIntervention({
    fragment,
    behavior: { dwellSignal: true, dwellMs: 20000 },
    candidates,
    learningContext: context
  });

  assert.equal(decision.shouldShow, false);
});

test("accepted regenerated analogy influences future style", () => {
  let now = 1000;
  const profile = new UserReadingProfile({ now: () => now });
  profile.recordFeedback({
    type: MemoryEventType.REQUESTED_REGENERATION,
    concept: "Lagrange point",
    knowledgeType: "astronomy",
    requestedStyle: ExplanationStyle.ANALOGY,
    timestamp: now
  });
  now += 1;
  profile.recordFeedback({
    type: MemoryEventType.MARKED_KNOWN,
    concept: "Lagrange point",
    knowledgeType: "astronomy",
    explanationStyle: ExplanationStyle.ANALOGY,
    timestamp: now
  });

  const hints = profile.getProfileHints({ canonicalName: "Lagrange point", knowledgeType: "astronomy", timestamp: now });
  assert.equal(hints.preferredStyle, ExplanationStyle.ANALOGY);
});

test("muted movie work category suppresses later proactive prompts", () => {
  const profile = new UserReadingProfile({ now: () => 1000 });
  profile.recordFeedback({ type: MemoryEventType.MUTED_CATEGORY, concept: "Dune", knowledgeType: "work", timestamp: 1000 });
  const candidates = extractConceptCandidates({
    text: "The essay compares the desert politics to Dune as a film and novel reference.",
    selectedText: "Dune"
  });
  const decision = scoreIntervention({
    behavior: { selectedPreciseTerm: true },
    candidates,
    learningContext: {
      derivedSignals: {},
      cooldowns: {},
      profileHints: profile.getProfileHints({ canonicalName: "Dune", knowledgeType: "work", timestamp: 1000 })
    }
  });

  assert.equal(decision.shouldShow, false);
});

test("fact-sensitive technology organization falls back when source is missing", () => {
  const candidate = extractConceptCandidates({
    text: "NASA announced its latest mission leadership update today.",
    selectedText: "NASA"
  })[0];
  const sensitivity = classifyFactSensitivity({
    candidate,
    fragment: { text: "NASA announced its latest mission leadership update today." }
  });

  assert.equal(sensitivity.requiresSource, true);
  assert.ok([FactSensitivity.NEEDS_SOURCE, FactSensitivity.FACT_SENSITIVE].includes(sensitivity.level));
});
