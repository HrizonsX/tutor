// @ts-nocheck
import { ExplanationStyle, MemoryEventType } from "./contracts.js";
import { AgentResultStatus, StreamEventType, StreamLane } from "./contracts.js";

export class CognitiveOverlay {
  constructor({
    doc = globalThis.document,
    onDismiss = () => {},
    onExpand = () => {},
    onFeedback = () => {},
    onRegenerate = null
  } = {}) {
    this.doc = doc;
    this.onDismiss = onDismiss;
    this.onExpand = onExpand;
    this.onFeedback = onFeedback;
    this.onRegenerate = onRegenerate;
    this.root = null;
    this.currentPrompt = null;
    this.feedbackKeys = new Set();
    this.regenerationKeys = new Set();
    this.regenerating = false;
    this.streamState = null;
    // Monotonic epoch: bumped on every show/showStreaming/dismiss so code
    // that awaited across user interaction can tell whether the prompt it
    // showed is still the live one (see isPromptLive).
    this.promptEpoch = 0;
  }

  isPromptLive(epoch) {
    return this.promptEpoch === epoch && Boolean(this.currentPrompt) && this.root?.hidden === false;
  }

  show(prompt) {
    if (!this.doc?.body || !prompt?.micro || !isDisplayablePrompt(prompt)) return;
    this.promptEpoch += 1;
    this.currentPrompt = prompt;
    this.feedbackKeys.clear();
    this.regenerating = false;
    this.ensureRoot();
    this.clearNode(this.root);
    this.root.hidden = false;

    const card = this.doc.createElement("section");
    card.className = "bco-card";
    card.setAttribute("role", "note");
    card.setAttribute("aria-live", "polite");

    const micro = this.doc.createElement("p");
    micro.className = "bco-micro";
    micro.textContent = prompt.micro;

    card.append(this.createHeader(prompt), this.createCloseButton(), micro, this.createActions());
    this.root.append(card);
  }

  showStreaming(prompt) {
    if (!this.doc?.body || !prompt || !isDisplayablePrompt(prompt)) return;
    this.promptEpoch += 1;
    this.currentPrompt = {
      ...prompt,
      micro: prompt.micro ?? "",
      expanded: prompt.expanded ?? ""
    };
    this.streamState = {
      sessionId: prompt.streamSessionId ?? prompt.sessionId ?? null,
      lastSequence: -1,
      directText: "",
      associationText: ""
    };
    this.feedbackKeys.clear();
    this.regenerating = false;
    this.ensureRoot();
    this.clearNode(this.root);
    this.root.hidden = false;

    const card = this.doc.createElement("section");
    card.className = "bco-card bco-stream-card";
    card.setAttribute("role", "note");
    card.setAttribute("aria-live", "polite");

    const directLane = this.createStreamLane({
      className: "bco-lane bco-lane-direct",
      label: "概念解释",
      outputClassName: "bco-stream-output bco-stream-direct",
      initialText: ""
    });
    const associationLane = this.createStreamLane({
      className: "bco-lane bco-lane-association",
      label: "关联记忆",
      outputClassName: "bco-stream-output bco-stream-association",
      initialText: "正在查找关联记忆..."
    });

    const bridges = this.doc.createElement("div");
    bridges.className = "bco-stream-bridges";
    associationLane.append(bridges);

    const actions = this.createActions();
    card.append(this.createHeader(this.currentPrompt), this.createCloseButton(), directLane, associationLane, actions);
    this.root.append(card);
  }

  applyStreamEvent(event = {}) {
    if (!this.root || !this.currentPrompt || !this.streamState) return false;
    if (this.streamState.sessionId && event.sessionId && event.sessionId !== this.streamState.sessionId) return false;
    if (typeof event.sequence === "number" && event.sequence <= this.streamState.lastSequence) return false;
    if (typeof event.sequence === "number") this.streamState.lastSequence = event.sequence;

    if (event.type === StreamEventType.LANE_DELTA) {
      this.appendLaneText(event.lane, event.text ?? "");
      return true;
    }
    if (event.type === StreamEventType.RECALL_STATUS) {
      this.renderBridgeNames(event.bridges ?? event.memoryRecall?.bridges ?? []);
      return true;
    }
    if (event.type === StreamEventType.LANE_FINAL) {
      this.applyLaneFinal(event);
      return true;
    }
    if (event.type === StreamEventType.LANE_ERROR) {
      this.setLaneText(event.lane, event.lane === StreamLane.ASSOCIATION ? "关联解释暂不可用" : "解释暂不可用");
      return true;
    }
    return false;
  }

  expand() {
    if (!this.root || !this.currentPrompt) return;
    const existing = this.root.querySelector(".bco-expanded");
    if (existing && !existing.hidden) return;
    if (!this.currentPrompt.expanded) {
      this.setStatus("More detail is not available right now.");
      return;
    }
    if (existing) {
      existing.textContent = this.currentPrompt.expanded;
      existing.hidden = false;
      this.onExpand(this.currentPrompt);
      return;
    }

    const expanded = this.doc.createElement("p");
    expanded.className = "bco-expanded";
    expanded.textContent = this.currentPrompt.expanded;
    this.root.querySelector(".bco-card")?.append(expanded);
    this.onExpand(this.currentPrompt);
  }

  feedback(type, extra = {}) {
    if (!this.currentPrompt) return null;
    if (this.regenerating && type !== MemoryEventType.REQUESTED_REGENERATION) return null;
    const explanationVersion = this.currentPrompt.explanationVersion ?? {};
    const feedbackKey = createFeedbackKey(type, this.currentPrompt, extra);
    if (this.feedbackKeys.has(feedbackKey)) return null;
    this.feedbackKeys.add(feedbackKey);
    const event = {
      type,
      concept: this.currentPrompt.concept,
      knowledgeType: this.currentPrompt.knowledgeType,
      explanationVersionId: explanationVersion.id ?? this.currentPrompt.explanationVersionId ?? null,
      explanationStyle: explanationVersion.style ?? this.currentPrompt.explanationStyle ?? null,
      feedbackEventId: explanationVersion.feedbackEventId ?? this.currentPrompt.feedbackEventId ?? null,
      context: this.currentPrompt.context,
      ...extra
    };
    this.onFeedback(event, this.currentPrompt);
    return event;
  }

  async regenerate(requestedStyle = ExplanationStyle.CONTEXTUAL_ROLE) {
    const prompt = this.currentPrompt;
    if (!prompt || !this.onRegenerate) return null;
    const regenerationKey = createFeedbackKey(MemoryEventType.REQUESTED_REGENERATION, prompt, { requestedStyle });
    if (this.regenerationKeys.has(regenerationKey)) return null;
    this.regenerationKeys.add(regenerationKey);
    const card = this.root?.querySelector(".bco-card");
    const previousText = prompt.micro;
    let shouldRestoreControls = true;
    this.regenerating = true;
    this.setActionButtonsDisabled(true);
    this.setStatus("Trying another wording...");
    this.feedback(MemoryEventType.REQUESTED_REGENERATION, { requestedStyle });

    try {
      const regenerated = await this.onRegenerate(prompt, requestedStyle);
      if (this.currentPrompt !== prompt || this.root?.hidden) {
        shouldRestoreControls = !this.currentPrompt;
        return null;
      }
      if (regenerated?.status && regenerated.status !== AgentResultStatus.AVAILABLE) {
        if (isQuietRegenerationSuppression(regenerated)) {
          this.setStatus("");
          return regenerated;
        }
        this.setStatus("Explanation service is not available right now.");
        return regenerated;
      }
      if (!regenerated?.text) {
        this.setStatus("Could not rephrase right now.");
        return null;
      }
      const nextExpanded = regenerated.expandedExplanation ?? regenerated.expanded ?? "";
      this.currentPrompt = {
        ...prompt,
        micro: regenerated.text,
        expanded: nextExpanded,
        explanationVersion: regenerated,
        explanationVersionId: regenerated.id,
        context: {
          ...prompt.context,
          explanationVersionId: regenerated.id ?? prompt.context?.explanationVersionId ?? null,
          explanationStyle: regenerated.style ?? prompt.context?.explanationStyle ?? null
        },
        previousMicro: previousText
      };
      this.feedbackKeys.clear();
      const micro = card?.querySelector(".bco-micro");
      if (micro) micro.textContent = regenerated.text;
      this.replaceExpandedDetail(nextExpanded);
      this.setStatus("");
      return regenerated;
    } catch {
      if (this.currentPrompt !== prompt || this.root?.hidden) {
        shouldRestoreControls = !this.currentPrompt;
        return null;
      }
      this.setStatus("Could not rephrase right now.");
      return null;
    } finally {
      if (shouldRestoreControls) {
        this.regenerating = false;
        this.setActionButtonsDisabled(false);
      }
      this.regenerationKeys.delete(regenerationKey);
    }
  }

  dismiss() {
    this.promptEpoch += 1;
    if (this.root) {
      this.root.hidden = true;
      this.clearNode(this.root);
    }
    if (this.currentPrompt) {
      this.onDismiss(this.currentPrompt);
    }
    this.currentPrompt = null;
    this.regenerating = false;
    this.streamState = null;
  }

  ensureRoot() {
    if (this.root) return;
    this.root = this.doc.getElementById?.("browser-cognitive-overlay") ??
      this.doc.body.querySelector?.("#browser-cognitive-overlay") ??
      null;
    if (this.root) return;
    this.root = this.doc.createElement("div");
    this.root.id = "browser-cognitive-overlay";
    this.root.className = "bco-root";
    this.doc.body.append(this.root);
  }

  createHeader(prompt = {}) {
    const header = this.doc.createElement("div");
    header.className = "bco-header";
    const icon = this.createIcon("concept", "bco-concept-icon");
    const title = this.doc.createElement("h2");
    title.className = "bco-title";
    title.textContent = prompt.concept ?? prompt.targetObject?.canonicalName ?? "概念解释";
    header.append(icon, title);
    return header;
  }

  createActionButton(label, onClick, { icon = "", variant = "secondary" } = {}) {
    const button = this.doc.createElement("button");
    button.type = "button";
    button.className = `bco-button bco-button-${variant}`;
    button.setAttribute("aria-label", label);
    const iconNode = this.createIcon(icon, "bco-button-icon");
    const labelNode = this.doc.createElement("span");
    labelNode.className = "bco-button-label";
    labelNode.textContent = label;
    button.append(iconNode, labelNode);
    button.addEventListener("click", onClick);
    return button;
  }

  createActions() {
    const actions = this.doc.createElement("div");
    actions.className = "bco-actions";
    const muteType = this.createActionButton("不提示此类", () => this.feedback(MemoryEventType.MUTED_CATEGORY), {
      icon: "bell-off",
      variant: "ghost"
    });
    const regenerate = this.createActionButton("重新解释", () => this.regenerate(ExplanationStyle.CONTEXTUAL_ROLE), {
      icon: "refresh",
      variant: "primary"
    });
    const confusing = this.createActionButton("困惑", () => this.feedback(MemoryEventType.MARKED_CONFUSING), {
      icon: "help",
      variant: "secondary"
    });
    actions.append(regenerate, confusing, muteType);
    return actions;
  }

  createCloseButton() {
    const close = this.doc.createElement("button");
    close.type = "button";
    close.className = "bco-icon-button bco-close";
    close.setAttribute("aria-label", "关闭解释");
    close.textContent = "x";
    close.addEventListener("click", () => this.dismiss());
    return close;
  }

  createIcon(name, className) {
    const icon = this.doc.createElement("span");
    icon.className = className;
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("data-icon", name);
    const definition = ICONS[name];
    if (definition && typeof this.doc.createElementNS === "function") {
      const svg = this.doc.createElementNS(SVG_NS, "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "1.9");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
      for (const d of definition.paths) {
        const path = this.doc.createElementNS(SVG_NS, "path");
        path.setAttribute("d", d);
        svg.append(path);
      }
      icon.append(svg);
    }
    return icon;
  }

  clearNode(node) {
    if (!node) return;
    if (typeof node.replaceChildren === "function") {
      node.replaceChildren();
      return;
    }
    node.textContent = "";
  }

  createStreamLane({ className, label, outputClassName, initialText }) {
    const lane = this.doc.createElement("section");
    lane.className = className;
    const title = this.doc.createElement("h3");
    title.className = "bco-lane-title";
    title.textContent = label;
    const output = this.doc.createElement("p");
    output.className = outputClassName;
    output.textContent = initialText;
    lane.append(title, output);
    return lane;
  }

  appendLaneText(lane, text) {
    if (!text) return;
    const stateKey = lane === StreamLane.ASSOCIATION ? "associationText" : "directText";
    this.streamState[stateKey] = `${this.streamState[stateKey] ?? ""}${text}`;
    this.setLaneText(lane, this.streamState[stateKey]);
  }

  setLaneText(lane, text) {
    const selector = lane === StreamLane.ASSOCIATION ? ".bco-stream-association" : ".bco-stream-direct";
    const node = this.root?.querySelector?.(selector);
    if (node) node.textContent = text;
  }

  renderBridgeNames(bridges = []) {
    const container = this.root?.querySelector?.(".bco-stream-bridges");
    if (!container) return;
    this.clearNode(container);
    for (const bridge of bridges.slice(0, 3)) {
      const name = bridge.relatedConcept ?? bridge.canonicalName ?? "";
      if (!name) continue;
      const chip = this.doc.createElement("span");
      chip.className = "bco-stream-bridge";
      chip.textContent = name;
      container.append(chip);
    }
  }

  applyLaneFinal(event = {}) {
    const result = event.result ?? {};
    const text = result.text ?? result.microExplanation ?? result.explanation ?? "";
    if (event.lane === StreamLane.ASSOCIATION) {
      if (result.reason === "no_memory_bridge" || result.reason === "weak_candidates_only") {
        this.streamState.associationText = "暂无关联";
        this.setLaneText(StreamLane.ASSOCIATION, "暂无关联");
      } else if (text && !this.streamState.associationText) {
        this.streamState.associationText = text;
        this.setLaneText(StreamLane.ASSOCIATION, text);
      }
      return;
    }
    if (text && !this.streamState.directText) {
      this.streamState.directText = text;
      this.setLaneText(StreamLane.DIRECT, text);
    }
    if (result.status === AgentResultStatus.AVAILABLE) {
      const version = result.explanationVersion ?? result.versionMetadata ?? result;
      this.currentPrompt = {
        ...this.currentPrompt,
        micro: text || this.currentPrompt.micro,
        explanationVersion: {
          ...version,
          status: result.status,
          source: version.source ?? result.versionMetadata?.source ?? "external_agent",
          text: text || version.text
        },
        explanationVersionId: version.id ?? this.currentPrompt.explanationVersionId ?? null,
        context: {
          ...this.currentPrompt.context,
          explanationVersionId: version.id ?? this.currentPrompt.context?.explanationVersionId ?? null,
          explanationStyle: version.style ?? this.currentPrompt.context?.explanationStyle ?? null
        }
      };
    }
  }

  setStatus(text) {
    if (!this.root) return;
    let status = this.root.querySelector(".bco-status");
    if (!status) {
      status = this.doc.createElement("p");
      status.className = "bco-status";
      this.root.querySelector(".bco-card")?.append(status);
    }
    status.textContent = text;
    status.hidden = !text;
  }

  setActionButtonsDisabled(disabled) {
    const actions = this.root?.querySelector?.(".bco-actions");
    const buttons = actions?.querySelectorAll?.("button") ?? [];
    for (const button of buttons) {
      if (String(button.className).split(/\s+/).includes("bco-icon-button")) continue;
      button.disabled = Boolean(disabled);
    }
  }

  replaceExpandedDetail(text) {
    const expanded = this.root?.querySelector?.(".bco-expanded");
    if (!expanded) return;
    if (text) {
      expanded.textContent = text;
      return;
    }
    expanded.hidden = true;
    expanded.textContent = "";
  }
}

function createFeedbackKey(type, prompt = {}, extra = {}) {
  const versionId = prompt.explanationVersion?.id ?? prompt.explanationVersionId ?? "";
  const style = extra.requestedStyle ?? "";
  return `${type}|${versionId}|${style}`;
}

function isDisplayablePrompt(prompt) {
  if (prompt.debug) return true;
  const version = prompt.explanationVersion;
  return Boolean(
    version?.status === AgentResultStatus.AVAILABLE ||
    version?.source === "external_agent" ||
    version?.versionMetadata?.source === "external_agent"
  );
}

function isQuietRegenerationSuppression(result = {}) {
  const reason = result.reason ?? result.unavailableReason;
  return reason === "runtime_config_changed" || reason === "feature_disabled";
}

const SVG_NS = "http://www.w3.org/2000/svg";

const ICONS = {
  concept: {
    paths: [
      "M8 8H6a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2",
      "M16 8h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2",
      "M10 7l-2 10",
      "M14 7l2 10"
    ]
  },
  help: {
    paths: [
      "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
      "M9.8 9a2.5 2.5 0 1 1 4.3 1.8c-.9.7-1.6 1.2-1.6 2.4",
      "M12 17h.01"
    ]
  },
  "bell-off": {
    paths: [
      "M13.7 21a2 2 0 0 1-3.4 0",
      "M18.6 13A18 18 0 0 1 18 8",
      "M6.3 6.3A7 7 0 0 0 6 8c0 7-3 9-3 9h14",
      "M18 8a6 6 0 0 0-9.3-5",
      "M2 2l20 20"
    ]
  },
  mute: {
    paths: [
      "M4 4l16 16",
      "M10 5 6 9H3v6h3l4 4V5Z",
      "M16 9.5c.6.7 1 1.6 1 2.5",
      "M19 7a7 7 0 0 1 1 7.5"
    ]
  },
  refresh: {
    paths: [
      "M20 6v5h-5",
      "M4 18v-5h5",
      "M18 9a7 7 0 0 0-11.7-2.7L4 8.5",
      "M6 15a7 7 0 0 0 11.7 2.7L20 15.5"
    ]
  }
};
