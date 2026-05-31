import test from "node:test";
import assert from "node:assert/strict";
import { ExplanationStyle, MemoryEventType } from "../src/contracts.js";
import { UserReadingProfile } from "../src/profile.js";

test("profile learns category interest, muting, and style evidence", () => {
  let now = 1000;
  const profile = new UserReadingProfile({ now: () => now });
  profile.recordFeedback({
    type: MemoryEventType.EXPANDED,
    concept: "Dune",
    knowledgeType: "work",
    explanationStyle: ExplanationStyle.ANALOGY,
    timestamp: now
  });
  now += 1;
  profile.recordFeedback({
    type: MemoryEventType.MARKED_KNOWN,
    concept: "Apollo program",
    knowledgeType: "historical_event",
    explanationStyle: ExplanationStyle.ANALOGY,
    timestamp: now
  });
  now += 1;
  profile.recordFeedback({
    type: MemoryEventType.REQUESTED_REGENERATION,
    concept: "Dune",
    knowledgeType: "work",
    requestedStyle: ExplanationStyle.ANALOGY,
    timestamp: now
  });
  now += 1;
  profile.recordFeedback({
    type: MemoryEventType.MUTED_CATEGORY,
    concept: "Dune",
    knowledgeType: "work",
    timestamp: now
  });

  const hints = profile.getProfileHints({ canonicalName: "Dune", knowledgeType: "work", timestamp: now });
  assert.equal(hints.categoryInterest, 1);
  assert.equal(hints.categoryMuted, true);
  assert.equal(hints.preferredStyle, ExplanationStyle.ANALOGY);
  assert.ok(hints.evidence.every((event) => event.type));
});

test("profile clears object and category preferences without certain mastery labels", () => {
  let now = 1000;
  const profile = new UserReadingProfile({ now: () => now });
  profile.recordFeedback({ type: MemoryEventType.MARKED_KNOWN, concept: "NASA", knowledgeType: "organization", timestamp: now });
  profile.recordFeedback({ type: MemoryEventType.MUTED_CATEGORY, concept: "NASA", knowledgeType: "organization", timestamp: now });
  now += 1;
  profile.clearObjectPreference("NASA", now);
  profile.clearCategoryPreference("organization", now);

  const hints = profile.getProfileHints({ canonicalName: "NASA", knowledgeType: "organization", timestamp: now });
  assert.equal(hints.familiarObject, false);
  assert.equal(hints.categoryMuted, false);
  assert.equal(Object.hasOwn(hints, "mastered"), false);
  assert.equal(Object.hasOwn(hints, "personality"), false);
});
