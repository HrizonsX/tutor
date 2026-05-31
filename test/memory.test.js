import test from "node:test";
import assert from "node:assert/strict";
import { MemoryEventType } from "../src/contracts.js";
import { LearningMemory } from "../src/memory.js";

test("dismissal records an event without marking mastery", () => {
  const memory = new LearningMemory({ now: () => 1000 });
  memory.recordDismissed({
    concept: "KL div",
    context: { fragmentId: "p1", fragmentType: "paragraph", url: "https://example.com/a?secret=1" }
  });

  const context = memory.getLearningContext("KL divergence", { timestamp: 1000 });
  assert.equal(context.events[0].type, MemoryEventType.DISMISSED);
  assert.equal(context.events[0].canonicalName, "KL divergence");
  assert.equal(Object.hasOwn(context.derivedSignals, "mastered"), false);
});

test("expansion is a weak signal only after repeated evidence", () => {
  let now = 1000;
  const memory = new LearningMemory({ now: () => now });
  memory.recordExpanded({ concept: "PPO clipping", context: { fragmentId: "p1" }, timestamp: now });
  assert.equal(memory.getLearningContext("PPO clipping", { timestamp: now }).derivedSignals.possibly_weak, false);

  now += 10;
  memory.recordExpanded({ concept: "PPO clip", context: { fragmentId: "p2" }, timestamp: now });
  assert.equal(memory.getLearningContext("clipped objective", { timestamp: now }).derivedSignals.possibly_weak, true);
  assert.equal(Object.hasOwn(memory.getLearningContext("PPO clipping", { timestamp: now }).derivedSignals, "does_not_understand"), false);
});

test("repeated confusion derives uncertain weakness", () => {
  const memory = new LearningMemory({ now: () => 1000 });
  memory.recordEvent({ type: MemoryEventType.REPEATED_CONFUSION, concept: "KV cache", context: { fragmentId: "p1" }, timestamp: 1000 });
  memory.recordEvent({ type: MemoryEventType.REPEATED_CONFUSION, concept: "key-value cache", context: { fragmentId: "p2" }, timestamp: 1200 });

  const context = memory.getLearningContext("K/V cache", { timestamp: 1200 });
  assert.equal(context.derivedSignals.possibly_weak, true);
});

test("stored events keep minimal context metadata", () => {
  const memory = new LearningMemory({ now: () => 1000 });
  const longTitle = "A".repeat(2000);
  memory.recordEvent({
    type: MemoryEventType.EXPLANATION_SHOWN,
    concept: "reward model",
    context: {
      fragmentId: "p1",
      fragmentType: "paragraph",
      url: "https://example.com/private/full/path?token=secret",
      title: longTitle,
      fullText: "This should never be stored"
    }
  });

  const [event] = memory.getEvents("reward model");
  assert.equal(event.context.fullText, undefined);
  assert.equal(event.context.pageOrigin, "https://example.com");
  assert.ok(event.context.pagePathHash);
  assert.ok(event.context.titleHash);
});
