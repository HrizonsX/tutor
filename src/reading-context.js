// @ts-nocheck
import { FragmentType } from "./contracts.js";
import { hashString } from "./privacy.js";

const OVERLAY_ROOT_ID = "browser-cognitive-overlay";
const EDITABLE_TAGS = new Set(["input", "textarea", "select", "option"]);

const READABLE_SELECTOR = [
  "article p",
  "main p",
  "p",
  "li",
  "blockquote",
  "pre",
  "code",
  "article h1",
  "article h2",
  "article h3",
  "article h4",
  "main h1",
  "main h2",
  "main h3",
  "main h4",
  "td"
].join(",");

const SELECTION_CONTEXT_SELECTOR = [
  "p",
  "li",
  "blockquote",
  "pre",
  "code",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "td",
  "th",
  "article",
  "main",
  "section",
  "[role='article']",
  "[role='main']",
  "div"
].join(",");

export function classifyElement(element) {
  const tag = element?.tagName?.toLowerCase?.() ?? "";
  if (tag === "pre" || tag === "code") return FragmentType.CODE;
  if (/^h[1-6]$/.test(tag)) return FragmentType.HEADING;
  if (tag === "li") return FragmentType.LIST_ITEM;
  if (tag === "td" || tag === "th") return FragmentType.TABLE_CELL;
  if (tag === "blockquote") return FragmentType.QUOTE;
  if (tag === "p") return FragmentType.PARAGRAPH;
  return FragmentType.OTHER;
}

export function normalizeReadableText(text = "") {
  return String(text).replace(/\s+/g, " ").trim();
}

export function scoreRect(rect, viewport) {
  const width = Math.max(0, Math.min(rect.right, viewport.width) - Math.max(rect.left, 0));
  const height = Math.max(0, Math.min(rect.bottom, viewport.height) - Math.max(rect.top, 0));
  const visibleArea = width * height;
  if (visibleArea <= 0) return 0;

  const area = Math.max(1, rect.width * rect.height);
  const visibleRatio = Math.min(1, visibleArea / area);
  const centerY = rect.top + rect.height / 2;
  const preferredY = viewport.height * 0.42;
  const centerDistance = Math.abs(centerY - preferredY) / Math.max(1, viewport.height);
  return visibleRatio * 0.72 + Math.max(0, 1 - centerDistance) * 0.28;
}

export function createFragmentFromElement(element, viewport, now = Date.now(), options = {}) {
  if (isIgnoredReadingSurface(element)) return null;
  const text = normalizeReadableText(element?.innerText ?? element?.textContent ?? "");
  const minTextLength = options.minTextLength ?? 24;
  if (text.length < minTextLength && !/^h[1-6]$/i.test(element?.tagName ?? "")) {
    return null;
  }

  const rect = normalizeRect(options.rectOverride ?? element.getBoundingClientRect());
  const score = scoreRect(rect, viewport);
  if (score <= 0) {
    return null;
  }

  const type = classifyElement(element);
  const idSeed = [
    element.id,
    element.getAttribute?.("data-bco-id"),
    element.tagName,
    stableElementPath(element),
    text.slice(0, 120)
  ].filter(Boolean).join("|");

  return {
    id: `frag_${hashString(idSeed)}`,
    text,
    type,
    score,
    rect,
    element,
    firstObservedAt: now
  };
}

export function createFragmentFromSelection(win, doc, viewport = defaultViewport(doc), now = Date.now()) {
  const selection = win?.getSelection?.();
  const selectedText = normalizeReadableText(selection?.toString?.() ?? "");
  if (!selectedText || !selection?.rangeCount) return null;

  const range = selection.getRangeAt?.(0);
  const commonNode = range?.commonAncestorContainer;
  const parentElement = commonNode?.nodeType === 1 ? commonNode : commonNode?.parentElement;
  if (isIgnoredReadingSurface(parentElement)) return null;
  const element = parentElement?.closest?.(SELECTION_CONTEXT_SELECTOR) ?? parentElement;
  if (isIgnoredReadingSurface(element)) return null;
  if (!element) return null;

  const rangeRect = normalizeRect(range?.getBoundingClientRect?.());
  const elementRect = normalizeRect(element.getBoundingClientRect?.());
  const rectOverride = rangeRect.width > 0 && rangeRect.height > 0 ? rangeRect : elementRect;
  const fragment = createFragmentFromElement(element, viewport, now, {
    minTextLength: Math.min(24, selectedText.length),
    rectOverride
  });
  if (!fragment) return null;
  return {
    ...fragment,
    selectionAnchored: true,
    selectedText
  };
}

export function isIgnoredReadingSurface(node) {
  let current = elementFromNode(node);
  while (current) {
    const tagName = current.tagName?.toLowerCase?.() ?? "";
    if (current.id === OVERLAY_ROOT_ID) return true;
    if (EDITABLE_TAGS.has(tagName)) return true;
    if (current.isContentEditable) return true;
    const editable = current.getAttribute?.("contenteditable");
    if (editable != null && String(editable).toLowerCase() !== "false") return true;
    const role = current.getAttribute?.("role")?.toLowerCase?.();
    if (role === "textbox" || role === "searchbox") return true;
    current = current.parentElement ?? null;
  }
  return false;
}

function elementFromNode(node) {
  if (!node) return null;
  if (node.nodeType === 1 || node.tagName) return node;
  return node.parentElement ?? null;
}

export function discoverReadableFragments(doc, viewport = defaultViewport(doc), now = Date.now()) {
  const elements = Array.from(doc.querySelectorAll(READABLE_SELECTOR));
  return elements
    .map((element) => createFragmentFromElement(element, viewport, now))
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);
}

export function selectCurrentFragment(fragments, selectedText = "") {
  const selection = normalizeReadableText(selectedText).toLowerCase();
  const scored = fragments.map((fragment) => {
    const selectionBoost = selection && fragment.text.toLowerCase().includes(selection) ? 0.35 : 0;
    return {
      ...fragment,
      score: fragment.score + selectionBoost
    };
  });
  return scored.sort((left, right) => right.score - left.score)[0] ?? null;
}

export class ReadingContextTracker {
  constructor({ win = globalThis.window, doc = globalThis.document, now = () => Date.now() } = {}) {
    this.win = win;
    this.doc = doc;
    this.now = now;
    this.current = null;
    this.fragments = [];
  }

  update() {
    const viewport = {
      width: this.win?.innerWidth ?? 1024,
      height: this.win?.innerHeight ?? 768
    };
    const selection = this.win?.getSelection?.()?.toString?.() ?? "";
    this.fragments = discoverReadableFragments(this.doc, viewport, this.now());
    const selectionFragment = createFragmentFromSelection(this.win, this.doc, viewport, this.now());
    if (selectionFragment) {
      this.fragments = [
        selectionFragment,
        ...this.fragments.filter((fragment) => fragment.id !== selectionFragment.id)
      ];
      this.current = selectionFragment;
      return this.current;
    }
    this.current = selectCurrentFragment(this.fragments, selection);
    return this.current;
  }
}

function defaultViewport(doc) {
  const view = doc?.defaultView;
  return {
    width: view?.innerWidth ?? 1024,
    height: view?.innerHeight ?? 768
  };
}

function normalizeRect(rect) {
  const top = Number(rect?.top ?? 0);
  const left = Number(rect?.left ?? 0);
  const width = Number(rect?.width ?? Math.max(0, Number(rect?.right ?? 0) - left));
  const height = Number(rect?.height ?? Math.max(0, Number(rect?.bottom ?? 0) - top));
  return {
    top,
    left,
    width,
    height,
    right: Number(rect?.right ?? left + width),
    bottom: Number(rect?.bottom ?? top + height)
  };
}

function stableElementPath(element) {
  const parts = [];
  let current = element;
  let depth = 0;
  while (current && depth < 6) {
    const tagName = current.tagName?.toLowerCase?.();
    if (!tagName) break;
    const stableId = current.id || current.getAttribute?.("data-bco-id");
    if (stableId) {
      parts.unshift(`${tagName}#${stableId}`);
      break;
    }
    parts.unshift(`${tagName}:${elementSiblingIndex(current)}`);
    current = current.parentElement;
    depth += 1;
  }
  return parts.join(">");
}

function elementSiblingIndex(element) {
  const parent = element?.parentElement;
  if (!parent?.children) return 0;
  return Math.max(0, Array.from(parent.children).indexOf(element));
}
