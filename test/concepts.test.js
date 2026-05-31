import test from "node:test";
import assert from "node:assert/strict";
import {
  extractConceptCandidates,
  extractKnowledgeObjectCandidates,
  generateExpandedExplanation,
  generateMicroExplanation,
  GENERAL_KNOWLEDGE_DEFINITIONS,
  normalizeConceptName,
  validateSelectedConcept
} from "../src/concepts.js";

test("extracts phrase-level concepts instead of generic words", () => {
  const cases = [
    ["The policy gradient objective improves actions that receive higher reward.", "policy gradient", "policy"],
    ["A reward model converts preference data into training signal.", "reward model", "reward"],
    ["The KV cache lets the model reuse keys and values during decoding.", "KV cache", "cache"]
  ];

  for (const [text, expected, generic] of cases) {
    const candidates = extractConceptCandidates({ text });
    assert.equal(candidates[0].canonicalName, expected);
    assert.notEqual(candidates[0].canonicalName.toLowerCase(), generic);
  }
});

test("normalizes aliases to stable canonical concepts", () => {
  assert.equal(normalizeConceptName("KL div"), "KL divergence");
  assert.equal(normalizeConceptName("Kullback-Leibler divergence"), "KL divergence");
  assert.equal(normalizeConceptName("clipped objective"), "PPO clipping");
});

test("selected precise terms receive ranking priority", () => {
  const candidates = extractConceptCandidates({
    text: "PPO clipping often works with KL divergence to keep policy updates controlled.",
    selectedText: "KL divergence"
  });

  assert.equal(candidates[0].canonicalName, "KL divergence");
  assert.equal(candidates[0].selected, true);
});

test("micro and expanded explanations can bridge recent learning context", () => {
  const learningContext = {
    relatedConcepts: [],
    recentTopics: [{ canonicalName: "policy gradient" }],
    derivedSignals: {}
  };
  const micro = generateMicroExplanation("KL divergence", learningContext);
  const expanded = generateExpandedExplanation("KL divergence", learningContext, {
    text: "KL divergence is used to limit policy updates."
  });

  assert.match(micro, /connects to policy gradient/i);
  assert.match(expanded, /constraint|guardrail/i);
});

test("extracts general knowledge objects beyond technical terms", () => {
  const candidates = extractKnowledgeObjectCandidates({
    text: "The essay uses the Thucydides Trap as an analogy for rivalry between a rising power and an established one."
  });

  assert.equal(candidates[0].canonicalName, "Thucydides Trap");
  assert.equal(candidates[0].knowledgeType, "historical_allusion");
  assert.equal(candidates[0].semanticKey, true);
});

test("normalizes general aliases and preserves Chinese surface forms", () => {
  assert.equal(normalizeConceptName("布雷顿森林体系"), "Bretton Woods system");
  assert.equal(normalizeConceptName("拉格朗日点"), "Lagrange point");

  const candidates = extractKnowledgeObjectCandidates({
    text: "望远镜部署在拉格朗日点附近，因为那里的轨道环境比较稳定。"
  });
  assert.equal(candidates[0].canonicalName, "Lagrange point");
  assert.equal(candidates[0].observedText, "拉格朗日点");
});

test("semantic ranking lowers incidental named objects", () => {
  const candidates = extractKnowledgeObjectCandidates({
    text: "NASA appears in a caption, but the paragraph explains why the Lagrange point matters for orbit stability."
  });

  assert.equal(candidates[0].canonicalName, "Lagrange point");
  assert.equal(candidates.find((candidate) => candidate.canonicalName === "NASA").semanticKey, false);
});

test("ordinary selected term can become contextual ad hoc object", () => {
  const candidates = extractKnowledgeObjectCandidates({
    text: "The article uses the word alignment as a special governance idea.",
    selectedText: "alignment"
  });

  assert.equal(candidates[0].canonicalName, "alignment");
  assert.equal(candidates[0].selected, true);
  assert.ok(GENERAL_KNOWLEDGE_DEFINITIONS.length > 0);
});

test("selected concept validation rejects noisy selections and partial words", () => {
  assert.deepEqual(
    pickValidation(validateSelectedConcept({ text: "," })),
    { status: "rejected", reason: "punctuation_only" }
  );
  assert.deepEqual(
    pickValidation(validateSelectedConcept({ text: "++" })),
    { status: "rejected", reason: "punctuation_only" }
  );
  assert.deepEqual(
    pickValidation(validateSelectedConcept({
      text: "ear",
      sourceText: "The linear algebra section explains vectors."
    })),
    { status: "rejected", reason: "partial_word" }
  );
});

test("selected concept validation rejects large, code-like, and unsupported short CJK selections", () => {
  const largeText = Array.from({ length: 80 }, (_, index) => `word${index}`).join(" ");
  assert.deepEqual(
    pickValidation(validateSelectedConcept({ text: largeText, config: { largeSelectionChars: 120 } })),
    { status: "rejected", reason: "large_selection" }
  );
  assert.deepEqual(
    pickValidation(validateSelectedConcept({ text: "const x = () => { return 1; }" })),
    { status: "rejected", reason: "code_like_selection" }
  );
  assert.deepEqual(
    pickValidation(validateSelectedConcept({ text: "中" })),
    { status: "rejected", reason: "too_short_cjk" }
  );
});

test("selected concept validation accepts valid known, unknown, and CJK concepts", () => {
  assert.deepEqual(
    pickAccepted(validateSelectedConcept({ text: "KL divergence" })),
    { status: "accepted", canonicalName: "KL divergence", normalizedText: "kl divergence" }
  );
  assert.deepEqual(
    pickAccepted(validateSelectedConcept({
      text: "alignment",
      sourceText: "The article uses alignment as a special governance idea."
    })),
    { status: "accepted", canonicalName: "alignment", normalizedText: "alignment" }
  );
  assert.deepEqual(
    pickAccepted(validateSelectedConcept({ text: "枇杷" })),
    { status: "accepted", canonicalName: "枇杷", normalizedText: "枇杷" }
  );
});

function pickValidation(result) {
  return { status: result.status, reason: result.reason };
}

function pickAccepted(result) {
  return {
    status: result.status,
    canonicalName: result.canonicalName,
    normalizedText: result.normalizedText
  };
}
