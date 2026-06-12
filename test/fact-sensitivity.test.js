import test from "node:test";
import assert from "node:assert/strict";
import { extractConceptCandidates } from "../src/shared/concepts.js";
import { FactSensitivity } from "../src/shared/contracts.js";
import { classifyFactSensitivity } from "../src/extension/fact-sensitivity.js";

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

test("stable conceptual terms do not require a source", () => {
  const candidate = extractConceptCandidates({
    text: "KL divergence measures how much one distribution differs from another.",
    selectedText: "KL divergence"
  })[0];
  const sensitivity = classifyFactSensitivity({
    candidate,
    fragment: { text: "KL divergence measures how much one distribution differs from another." }
  });

  assert.equal(sensitivity.requiresSource, false);
  assert.equal(sensitivity.level, FactSensitivity.STABLE);
});
