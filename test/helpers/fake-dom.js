// Shared fake DOM for browser-extension tests (content.js, overlay.js).
//
// node:test discovers only `test/**/*.test.js` (see package.json), so this
// module is imported by tests rather than executed as a test file itself.
//
// `FakeElement` is the superset of the two previously-duplicated copies: the
// `disabled` guard in click() and the `throwOnInnerHTML` /
// `throwOnNonEmptyInnerHTML` guards in the innerHTML setter are inert unless a
// caller opts in via options, so callers that pass no options behave exactly
// as the older minimal element did.

export class FakeElement {
  constructor(tagName, options = {}) {
    this.tagName = tagName;
    this.options = options;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this._textContent = "";
    this.className = "";
    this.hidden = false;
    this.type = "";
    this.disabled = false;
  }

  append(...children) {
    for (const child of children) {
      if (child && typeof child === "object") child.parentElement = this;
    }
    this.children.push(...children);
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  click() {
    if (this.disabled) return;
    this.listeners.get("click")?.();
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      if (matchesSelector(node, selector)) matches.push(node);
      for (const child of node.children) visit(child);
    };
    visit(this);
    return matches;
  }

  set innerHTML(value) {
    if (this.options.throwOnInnerHTML || (this.options.throwOnNonEmptyInnerHTML && String(value))) {
      throw new Error("unsafe innerHTML");
    }
    this.children = [];
    this._innerHTML = value;
  }

  get textContent() {
    return `${this._textContent}${this.children.map((child) => child.textContent ?? "").join("")}`;
  }

  set textContent(value) {
    this.children = [];
    this._textContent = String(value ?? "");
  }
}

export function matchesSelector(node, selector) {
  if (selector === "button") return node.tagName === "button";
  if (selector.startsWith(".")) return String(node.className).split(/\s+/).includes(selector.slice(1));
  if (selector.startsWith("#")) return node.id === selector.slice(1);
  return node.tagName === selector;
}

export function fakeDocument(options = {}) {
  const body = new FakeElement("body", options);
  const listeners = new Map();
  return {
    body,
    title: "Article",
    activeElement: body,
    documentElement: { dataset: {} },
    createElement: (tagName) => new FakeElement(tagName, options),
    createElementNS: (_namespace, tagName) => new FakeElement(tagName, options),
    addEventListener: (type, handler) => listeners.set(type, handler),
    dispatchEvent: (event) => listeners.get(event.type)?.(event),
    querySelectorAll: () => []
  };
}
