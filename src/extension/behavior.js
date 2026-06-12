// @ts-nocheck
import { DEFAULT_CONFIG } from "../shared/config.js";
import { FragmentType } from "../shared/contracts.js";
import { looksLikeCodeSelection, validateSelectedConcept } from "../shared/concepts.js";

export class BehaviorTracker {
  constructor({ config = DEFAULT_CONFIG.behavior, now = () => Date.now() } = {}) {
    this.config = config;
    this.now = now;
    this.currentFragmentId = null;
    this.enteredAt = null;
    this.lastActivityAt = now();
    this.fragments = new Map();
    this.selection = null;
    this.conceptPauses = new Map();
  }

  recordActivity(timestamp = this.now()) {
    this.lastActivityAt = timestamp;
  }

  observeFragment(fragment, timestamp = this.now()) {
    if (!fragment?.id) return null;
    this.recordActivity(timestamp);

    const alreadySeen = this.fragments.has(fragment.id);
    const existing = this.fragments.get(fragment.id) ?? {
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
      revisitCount: 0,
      totalDwellMs: 0,
      type: fragment.type
    };

    if (this.currentFragmentId !== fragment.id) {
      if (this.currentFragmentId && this.enteredAt != null) {
        const previous = this.fragments.get(this.currentFragmentId);
        if (previous) {
          previous.totalDwellMs += Math.max(0, timestamp - this.enteredAt);
        }
      }

      if (alreadySeen) {
        existing.revisitCount += 1;
      }

      this.currentFragmentId = fragment.id;
      this.enteredAt = timestamp;
    }

    existing.lastSeenAt = timestamp;
    existing.type = fragment.type;
    this.fragments.set(fragment.id, existing);
    this.evictStaleFragments();
    return this.getSummary(fragment.id, timestamp);
  }

  // SPA pages never reload, so tracked fragments and pause keys would grow
  // without bound; evict the least recently seen entries past the cap.
  evictStaleFragments() {
    const limit = Number(this.config.maxTrackedFragments ?? 0);
    if (!limit || this.fragments.size <= limit) return;
    while (this.fragments.size > limit) {
      let oldestKey = null;
      let oldestAt = Infinity;
      for (const [key, state] of this.fragments) {
        if (key === this.currentFragmentId) continue;
        if ((state.lastSeenAt ?? 0) < oldestAt) {
          oldestAt = state.lastSeenAt ?? 0;
          oldestKey = key;
        }
      }
      if (oldestKey == null) break;
      this.fragments.delete(oldestKey);
    }
  }

  recordSelection({ text = "", fragment, timestamp = this.now(), validation = null }) {
    this.recordActivity(timestamp);
    const normalized = String(text).trim();
    const lineCount = normalized ? normalized.split(/\r?\n/).length : 0;
    const selectedConceptValidation = validation ?? validateSelectedConcept({
      text: normalized,
      fragment,
      sourceText: fragment?.text ?? "",
      config: this.config
    });
    const codeLike =
      selectedConceptValidation.reason === "code_like_selection" ||
      fragment?.type === FragmentType.CODE ||
      looksLikeCode(normalized);
    const largeSelection =
      selectedConceptValidation.reason === "large_selection" ||
      normalized.length >= this.config.largeSelectionChars ||
      lineCount >= this.config.largeSelectionLines;

    this.selection = {
      text: normalized,
      fragmentId: fragment?.id ?? null,
      timestamp,
      largeSelection,
      codeSelection: codeLike,
      selectedPreciseTerm: selectedConceptValidation.status === "accepted",
      validation: selectedConceptValidation
    };

    return this.selection;
  }

  recordPauseNearConcept({ fragmentId, concept, timestamp = this.now() }) {
    if (!fragmentId || !concept) return;
    const key = `${fragmentId}:${concept}`;
    const pauses = this.conceptPauses.get(key) ?? [];
    const recent = pauses.filter((pauseAt) => timestamp - pauseAt <= this.config.repeatedPauseWindowMs);
    recent.push(timestamp);
    this.conceptPauses.set(key, recent);
    const limit = Number(this.config.maxTrackedConceptPauses ?? 0);
    if (limit && this.conceptPauses.size > limit) {
      let oldestKey = null;
      let oldestAt = Infinity;
      for (const [pauseKey, pauseList] of this.conceptPauses) {
        const lastAt = pauseList[pauseList.length - 1] ?? 0;
        if (lastAt < oldestAt) {
          oldestAt = lastAt;
          oldestKey = pauseKey;
        }
      }
      if (oldestKey != null && oldestKey !== key) this.conceptPauses.delete(oldestKey);
    }
  }

  getSummary(fragmentId = this.currentFragmentId, timestamp = this.now()) {
    const state = this.fragments.get(fragmentId) ?? {
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
      revisitCount: 0,
      totalDwellMs: 0,
      type: FragmentType.OTHER
    };
    const liveDwell =
      this.currentFragmentId === fragmentId && this.enteredAt != null
        ? Math.max(0, timestamp - this.enteredAt)
        : 0;

    const repeatedPauseCount = Array.from(this.conceptPauses.entries())
      .filter(([key]) => key.startsWith(`${fragmentId}:`))
      .reduce((max, [, pauses]) => Math.max(max, pauses.length), 0);

    return {
      fragmentId,
      dwellMs: state.totalDwellMs + liveDwell,
      dwellSignal: state.totalDwellMs + liveDwell >= this.config.dwellThresholdMs,
      revisitCount: state.revisitCount,
      repeatedPauseCount,
      selectionText: this.selection?.fragmentId === fragmentId ? this.selection.text : "",
      selectionTimestamp: this.selection?.fragmentId === fragmentId ? this.selection.timestamp : null,
      selectedPreciseTerm:
        this.selection?.fragmentId === fragmentId ? this.selection.selectedPreciseTerm : false,
      selectionValidation:
        this.selection?.fragmentId === fragmentId ? summarizeSelectionValidation(this.selection.validation) : null,
      largeSelection: this.selection?.fragmentId === fragmentId ? this.selection.largeSelection : false,
      codeSelection: this.selection?.fragmentId === fragmentId ? this.selection.codeSelection : false,
      inactive: timestamp - this.lastActivityAt >= this.config.inactivityThresholdMs,
      fragmentType: state.type
    };
  }
}

export function looksLikeCode(text = "") {
  return looksLikeCodeSelection(text);
}

export function summarizeSelectionValidation(validation = null) {
  if (!validation) return null;
  return {
    status: validation.status,
    reason: validation.reason ?? null,
    completedBy: validation.completedBy ?? "unknown"
  };
}
