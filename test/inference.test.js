import test from "node:test";
import assert from "node:assert/strict";
import { extractConceptCandidates } from "../src/shared/concepts.js";
import { ExplanationStyle, SuppressionReason } from "../src/shared/contracts.js";
import { scoreIntervention } from "../src/extension/inference.js";

const fragment = {
  id: "p1",
  type: "paragraph",
  text: "KL divergence measures how much the new policy differs from the old policy."
};

test("long dwell alone cannot trigger an explanation", () => {
  const decision = scoreIntervention({
    fragment,
    behavior: { dwellSignal: true, dwellMs: 30000, revisitCount: 0 },
    candidates: extractConceptCandidates({ text: fragment.text }),
    learningContext: { derivedSignals: {}, cooldowns: {} }
  });

  assert.equal(decision.shouldShow, false);
  assert.ok(decision.suppressions.includes(SuppressionReason.DWELL_ONLY));
});

test("large selections and code selections suppress intervention", () => {
  const candidates = extractConceptCandidates({ text: "The KV cache stores keys and values." });
  for (const behavior of [
    { largeSelection: true, selectedPreciseTerm: false },
    { codeSelection: true, selectedPreciseTerm: false }
  ]) {
    const decision = scoreIntervention({
      behavior,
      candidates,
      learningContext: { derivedSignals: {}, cooldowns: {} }
    });
    assert.equal(decision.shouldShow, false);
  }
});

test("idle pages suppress intervention", () => {
  const decision = scoreIntervention({
    behavior: { inactive: true, selectedPreciseTerm: true },
    candidates: extractConceptCandidates({ text: "The reward model scores preferences.", selectedText: "reward model" }),
    learningContext: { derivedSignals: {}, cooldowns: {} }
  });
  assert.equal(decision.shouldShow, false);
  assert.ok(decision.suppressions.includes(SuppressionReason.INACTIVE));
});

test("recent dismissal suppresses similar prompt", () => {
  const decision = scoreIntervention({
    behavior: { selectedPreciseTerm: true },
    candidates: extractConceptCandidates({ text: fragment.text, selectedText: "KL divergence" }),
    learningContext: { derivedSignals: {}, cooldowns: { recentDismissal: true } }
  });
  assert.equal(decision.shouldShow, false);
  assert.ok(decision.suppressions.includes(SuppressionReason.RECENT_DISMISSAL));
});

test("content plus revisit can trigger a precise concept explanation", () => {
  const decision = scoreIntervention({
    behavior: { revisitCount: 2 },
    candidates: extractConceptCandidates({ text: "PPO clipping and KL divergence both constrain policy updates." }),
    learningContext: { derivedSignals: {}, cooldowns: {} }
  });

  assert.equal(decision.shouldShow, true);
  assert.equal(decision.hasValidContentSignal, true);
  assert.equal(decision.hasBehaviorOrMemorySignal, true);
});

test("explicit selected ad hoc term can trigger an explanation", () => {
  const decision = scoreIntervention({
    behavior: { selectedPreciseTerm: true, selectionText: "Bayesian prior" },
    candidates: extractConceptCandidates({
      text: "The paragraph mentions Bayesian prior while discussing uncertainty.",
      selectedText: "Bayesian prior"
    }),
    learningContext: { derivedSignals: {}, cooldowns: {} }
  });

  assert.equal(decision.shouldShow, true);
  assert.ok(decision.reasons.includes("selected_precise_term"));
});

test("possibly weak memory plus dwell can raise priority", () => {
  const decision = scoreIntervention({
    behavior: { dwellSignal: true, dwellMs: 20000 },
    candidates: extractConceptCandidates({ text: "The KV cache stores keys and values." }),
    learningContext: { derivedSignals: { possibly_weak: true }, cooldowns: {} }
  });

  assert.equal(decision.shouldShow, true);
});

test("recently explained concepts do not repeat without stronger confusion", () => {
  const decision = scoreIntervention({
    behavior: { dwellSignal: true, dwellMs: 20000 },
    candidates: extractConceptCandidates({ text: "The reward model scores preferences." }),
    learningContext: {
      derivedSignals: {},
      cooldowns: { recentlyExplained: true }
    }
  });

  assert.equal(decision.shouldShow, false);
  assert.ok(decision.suppressions.includes(SuppressionReason.RECENTLY_EXPLAINED));
});

test("reading profile interest raises priority only with semantic content", () => {
  const decision = scoreIntervention({
    behavior: { selectedPreciseTerm: true },
    candidates: extractConceptCandidates({
      text: "The Thucydides Trap is used as an analogy for power rivalry.",
      selectedText: "Thucydides Trap"
    }),
    learningContext: {
      derivedSignals: {},
      cooldowns: {},
      profileHints: { categoryInterest: 2, preferredStyle: ExplanationStyle.ANALOGY }
    }
  });

  assert.equal(decision.shouldShow, true);
  assert.ok(decision.reasons.includes("profile_interest"));
  assert.equal(decision.explanationStyle, ExplanationStyle.ANALOGY);

  const noContent = scoreIntervention({
    behavior: {},
    candidates: [],
    learningContext: {
      derivedSignals: {},
      cooldowns: {},
      profileHints: { categoryInterest: 5 }
    }
  });
  assert.equal(noContent.shouldShow, false);
  assert.ok(noContent.suppressions.includes(SuppressionReason.NO_CONTENT_SIGNAL));
});

test("marked known feedback suppresses a dwell-driven repeat prompt", () => {
  const decision = scoreIntervention({
    behavior: { dwellSignal: true, dwellMs: 20000 },
    candidates: extractConceptCandidates({
      text: "The Bretton Woods system explains why the dollar became central to postwar finance.",
      selectedText: "Bretton Woods"
    }),
    learningContext: {
      derivedSignals: { recently_marked_known: true },
      cooldowns: {},
      profileHints: { familiarObject: true }
    }
  });

  assert.equal(decision.shouldShow, false);
  assert.ok(decision.suppressions.includes(SuppressionReason.RECENTLY_MARKED_KNOWN));
});

test("profile muting, known feedback, and wrong feedback affect priority", () => {
  const candidates = extractConceptCandidates({
    text: "NASA announced a latest mission update.",
    selectedText: "NASA"
  });
  const muted = scoreIntervention({
    behavior: { selectedPreciseTerm: true },
    candidates,
    learningContext: { derivedSignals: {}, cooldowns: {}, profileHints: { categoryMuted: true } }
  });
  assert.equal(muted.shouldShow, false);
  assert.ok(muted.suppressions.includes(SuppressionReason.MUTED_CATEGORY));

  const known = scoreIntervention({
    behavior: { selectedPreciseTerm: true },
    candidates,
    learningContext: { derivedSignals: { recently_marked_known: true }, cooldowns: {}, profileHints: { familiarObject: true } }
  });
  assert.ok(known.priority < muted.priority + 0.6);

  const cautious = scoreIntervention({
    behavior: { selectedPreciseTerm: true },
    candidates,
    learningContext: { derivedSignals: { caution_required: true }, cooldowns: {}, profileHints: { cautionRequired: true } }
  });
  assert.ok(cautious.reasons.includes("prior_inaccuracy_feedback"));
});
