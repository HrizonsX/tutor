import test from "node:test";
import assert from "node:assert/strict";
import { composeShortExplanation, createComposerInput, regenerateExplanation } from "../src/composer.js";
import { AgentResultStatus, ExplanationStyle, FactSensitivity } from "../src/contracts.js";

const packet = {
  target: {
    canonicalName: "Lagrange point",
    observedText: "Lagrange point",
    knowledgeType: "astronomy",
    factSensitivity: FactSensitivity.STABLE
  },
  priorExplanations: [],
  relatedObjects: [],
  derivedSignals: {},
  profileHints: { preferredStyle: ExplanationStyle.SIMPLER },
  uncertainty: { confidence: "low" }
};

test("composer receives stateless structured input and does not own policy decisions", () => {
  const input = createComposerInput({
    retrievalPacket: packet,
    fragment: { id: "p1", type: "paragraph", text: "A telescope can sit near a Lagrange point." }
  });

  assert.equal(input.target.canonicalName, "Lagrange point");
  assert.equal(input.constraints.composerOwnsInterventionDecision, false);
  assert.ok(input.minimalContext.text.includes("Lagrange point"));
  assert.equal(Object.hasOwn(input, "memoryPacket"), false);
  assert.equal(Object.hasOwn(input, "memorySummary"), false);
  assert.equal(Object.hasOwn(input, "profileHints"), false);
  assert.equal(input.requestedStyle, "concise");
});

test("short composer validates structured Agent output and returns bounded text", async () => {
  const result = await composeShortExplanation({
    retrievalPacket: packet,
    fragment: { id: "p1", text: "A telescope can sit near a Lagrange point." },
    agentClient: {
      composeShortExplanation: async (input) => {
        assert.equal(Object.hasOwn(input, "memoryPacket"), false);
        assert.equal(Object.hasOwn(input, "profileHints"), false);
        return {
        status: AgentResultStatus.AVAILABLE,
        microExplanation: "Lagrange point is a stable orbital spot for spacecraft. Extra sentence should be ignored if needed.",
        target: packet.target,
        versionMetadata: { id: "ver_agent", provider: "test" }
        };
      }
    },
    config: { composer: { maxMicroChars: 90, defaultStyle: "concise" }, privacy: { maxContextChars: 200 }, knowledge: { maxRelatedObjects: 5 } }
  });

  assert.equal(result.status, AgentResultStatus.AVAILABLE);
  assert.equal(result.ownsInterventionDecision, false);
  assert.ok(result.text.length <= 90);
  assert.equal(result.explanationVersion.source, "external_agent");
});

test("regeneration links previous version and feedback event", async () => {
  const result = await regenerateExplanation({
    retrievalPacket: packet,
    fragment: { id: "p1", text: "A telescope can sit near a Lagrange point." },
    previousVersion: { id: "ver1", text: "Old text" },
    feedbackEvent: { id: "evt1" },
    requestedStyle: ExplanationStyle.SIMPLER,
    agentClient: {
      regenerateExplanation: async (input) => {
        assert.equal(Object.hasOwn(input, "memoryPacket"), false);
        assert.equal(Object.hasOwn(input, "feedbackHistory"), false);
        return {
        status: AgentResultStatus.AVAILABLE,
        microExplanation: "A Lagrange point is a simpler stable place for a spacecraft.",
        target: packet.target,
        versionMetadata: { id: "ver2", previousVersionId: "ver1", feedbackEventId: "evt1" }
        };
      }
    }
  });

  assert.equal(result.previousVersionId, "ver1");
  assert.equal(result.feedbackEventId, "evt1");
  assert.equal(result.style, ExplanationStyle.SIMPLER);
  assert.match(result.text, /simple|background|Lagrange/i);
});

test("composer returns unavailable instead of local fallback when provider is missing", async () => {
  const result = await composeShortExplanation({
    retrievalPacket: packet,
    fragment: { id: "p1", text: "A telescope can sit near a Lagrange point." }
  });

  assert.equal(result.status, AgentResultStatus.UNAVAILABLE);
  assert.equal(result.text, "");
  assert.equal(result.reason, "agent_provider_unconfigured");
});

test("composer preserves ambiguous Agent responses without choosing from local knowledge", async () => {
  const result = await composeShortExplanation({
    retrievalPacket: packet,
    fragment: { id: "p1", text: "The article mentions alignment." },
    agentClient: {
      composeShortExplanation: async () => ({
        status: AgentResultStatus.AMBIGUOUS,
        ambiguity: { candidates: ["AI alignment", "text alignment"] }
      })
    }
  });

  assert.equal(result.status, AgentResultStatus.AMBIGUOUS);
  assert.deepEqual(result.ambiguity.candidates, ["AI alignment", "text alignment"]);
  assert.equal(result.text, "");
});
