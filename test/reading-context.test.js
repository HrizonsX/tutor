import test from "node:test";
import assert from "node:assert/strict";
import { BehaviorTracker } from "../src/extension/behavior.js";
import { FragmentType } from "../src/shared/contracts.js";
import { classifyElement, discoverReadableFragments, ReadingContextTracker, selectCurrentFragment } from "../src/extension/reading-context.js";

test("classifies readable element types", () => {
  assert.equal(classifyElement({ tagName: "P" }), FragmentType.PARAGRAPH);
  assert.equal(classifyElement({ tagName: "PRE" }), FragmentType.CODE);
  assert.equal(classifyElement({ tagName: "H2" }), FragmentType.HEADING);
});

test("discovers visible fragments and boosts selected context", () => {
  const elements = [
    fakeElement("P", "Short text that is visible but less central.", { top: 500, left: 0, width: 600, height: 80 }),
    fakeElement("P", "The paragraph with KL divergence is central in the viewport.", { top: 250, left: 0, width: 600, height: 120 })
  ];
  const doc = { querySelectorAll: () => elements };
  const fragments = discoverReadableFragments(doc, { width: 800, height: 700 }, 1000);
  const current = selectCurrentFragment(fragments, "KL divergence");

  assert.equal(current.text.includes("KL divergence"), true);
});

test("fragment identity stays stable when scroll changes element rect", () => {
  const text = "KL divergence measures how one probability distribution differs from another.";
  const element = fakeElement("P", text, { top: 260, left: 20, width: 600, height: 120 });
  const first = discoverReadableFragments({ querySelectorAll: () => [element] }, { width: 800, height: 700 }, 1000)[0];

  element.setRect({ top: 120, left: 20, width: 600, height: 120 });
  const second = discoverReadableFragments({ querySelectorAll: () => [element] }, { width: 800, height: 700 }, 1100)[0];

  assert.equal(second.id, first.id);
});

test("selection anchored fragment wins on complex pages", () => {
  const selectedElement = fakeElement(
    "DIV",
    "应国家主席习近平邀请，俄罗斯总统普京于5月19日至20日对中国进行国事访问。",
    { top: 180, left: 120, width: 640, height: 80 }
  );
  selectedElement.closest = () => selectedElement;
  const range = {
    commonAncestorContainer: { nodeType: 3, parentElement: selectedElement },
    getBoundingClientRect: () => ({ top: 190, left: 210, width: 36, height: 18, right: 246, bottom: 208 })
  };
  const tracker = new ReadingContextTracker({
    win: {
      innerWidth: 1024,
      innerHeight: 768,
      getSelection: () => ({
        toString: () => "习近平",
        rangeCount: 1,
        getRangeAt: () => range
      })
    },
    doc: {
      querySelectorAll: () => [
        fakeElement("P", "学习新语丨确保中俄关系继续沿着正确轨道不断发展", { top: 250, left: 120, width: 500, height: 24 })
      ]
    },
    now: () => 1000
  });

  const current = tracker.update();

  assert.equal(current.selectionAnchored, true);
  assert.equal(current.selectedText, "习近平");
  assert.match(current.text, /习近平/);
});

test("readable discovery skips overlay and editable surfaces", () => {
  const overlay = fakeElement("DIV", "", { top: 100, left: 0, width: 360, height: 120 }, { id: "browser-cognitive-overlay" });
  const overlayParagraph = fakeElement(
    "P",
    "KL divergence appears inside the overlay explanation card.",
    { top: 110, left: 10, width: 320, height: 60 },
    { parentElement: overlay }
  );
  const editable = fakeElement(
    "DIV",
    "Policy gradient appears in a contenteditable note.",
    { top: 180, left: 10, width: 320, height: 60 },
    { contentEditable: "true" }
  );
  const articleParagraph = fakeElement(
    "P",
    "The article explains why KL divergence matters for optimization.",
    { top: 250, left: 0, width: 600, height: 120 }
  );

  const fragments = discoverReadableFragments(
    { querySelectorAll: () => [overlayParagraph, editable, articleParagraph] },
    { width: 800, height: 700 },
    1000
  );

  assert.deepEqual(fragments.map((fragment) => fragment.text), [articleParagraph.textContent]);
});

test("selection anchored inside overlay falls back to page content", () => {
  const overlay = fakeElement("DIV", "", { top: 100, left: 0, width: 360, height: 120 }, { id: "browser-cognitive-overlay" });
  const selectedElement = fakeElement(
    "P",
    "KL divergence appears inside the overlay explanation card.",
    { top: 110, left: 10, width: 320, height: 60 },
    { parentElement: overlay }
  );
  selectedElement.closest = () => selectedElement;
  const range = {
    commonAncestorContainer: { nodeType: 3, parentElement: selectedElement },
    getBoundingClientRect: () => ({ top: 120, left: 20, width: 90, height: 18, right: 110, bottom: 138 })
  };
  const tracker = new ReadingContextTracker({
    win: {
      innerWidth: 1024,
      innerHeight: 768,
      getSelection: () => ({
        toString: () => "KL divergence",
        rangeCount: 1,
        getRangeAt: () => range
      })
    },
    doc: {
      querySelectorAll: () => [
        fakeElement("P", "The article explains why policy gradient matters.", { top: 250, left: 120, width: 500, height: 80 })
      ]
    },
    now: () => 1000
  });

  const current = tracker.update();

  assert.equal(current.selectionAnchored, undefined);
  assert.match(current.text, /policy gradient/);
});

test("behavior tracker records dwell, revisits, precise selection, and code selection", () => {
  let now = 1000;
  const tracker = new BehaviorTracker({ now: () => now });
  const paragraph = { id: "p1", type: FragmentType.PARAGRAPH };
  const code = { id: "c1", type: FragmentType.CODE };

  tracker.observeFragment(paragraph, now);
  now += 9000;
  let summary = tracker.getSummary("p1", now);
  assert.equal(summary.dwellSignal, true);

  tracker.observeFragment(code, now);
  tracker.observeFragment(paragraph, now + 1000);
  tracker.recordSelection({ text: "KV cache", fragment: paragraph, timestamp: now + 1100 });
  summary = tracker.getSummary("p1", now + 1200);
  assert.equal(summary.selectedPreciseTerm, true);
  assert.equal(summary.revisitCount, 1);

  tracker.recordSelection({ text: "const x = () => { return 1; }", fragment: code, timestamp: now + 1300 });
  assert.equal(tracker.getSummary("c1", now + 1300).codeSelection, true);
});

function fakeElement(tagName, text, rect, options = {}) {
  let currentRect = rect;
  const attributes = new Map(Object.entries(options.attributes ?? {}));
  if (options.contentEditable !== undefined) attributes.set("contenteditable", options.contentEditable);
  return {
    tagName,
    innerText: text,
    textContent: text,
    id: options.id ?? "",
    parentElement: options.parentElement ?? null,
    isContentEditable: options.contentEditable === "true",
    getAttribute: (name) => attributes.get(name) ?? null,
    setRect(nextRect) {
      currentRect = nextRect;
    },
    getBoundingClientRect: () => ({
      ...currentRect,
      right: currentRect.left + currentRect.width,
      bottom: currentRect.top + currentRect.height
    })
  };
}
