// @ts-nocheck
import { BROWSER_CONFIG_STORAGE_KEY, loadRuntimeConfig, mergeConfig } from "../shared/config.js";
import { ReadingContextTracker, isIgnoredReadingSurface } from "./reading-context.js";
import { BehaviorTracker, summarizeSelectionValidation } from "./behavior.js";
import { extractConceptCandidates, normalizeKnowledgeObjectName, validateSelectedConcept } from "../shared/concepts.js";
import { composeShortExplanation, createComposerInput, regenerateExplanation } from "./composer.js";
import { classifyFactSensitivity } from "./fact-sensitivity.js";
import { scoreIntervention } from "./inference.js";
import { buildAnalysisPayload, hashString, safeUrlMetadata } from "../shared/privacy.js";
import { CognitiveOverlay } from "./overlay.js";
import { AgentResultStatus, MemoryEventType } from "../shared/contracts.js";
import { createBackgroundAgentClient, validateAgentExplanationResult } from "./agent-service.js";

const ENCOUNTER_WRITE_COOLDOWN_MS = 30 * 1000;
const SELECTION_STABLE_MS = 900;
const SELECTION_FINALIZE_SETTLE_MS = 60;
const SELECTION_WRITE_COOLDOWN_MS = 30 * 1000;

export function startBrowserCognitiveOverlay({
  win = globalThis.window,
  doc = globalThis.document,
  config = loadRuntimeConfig(win, doc),
  now = () => Date.now(),
  agentClient = createBackgroundAgentClient(win?.chrome?.runtime ?? globalThis.chrome?.runtime),
  memoryClient = agentClient
} = {}) {
  let eventSequence = 0;
  let runtimeConfigVersion = 0;
  // Diagnostics that name concepts are written to the page-readable dataset
  // only in dev mode: under <all_urls> any site could otherwise harvest the
  // user's reading-concept stream. Read at call time so hot config updates
  // apply.
  const isDevMode = () => config.devMode === true;
  // Learning events leave the content boundary with hashed URL/title metadata
  // instead of raw location data.
  const buildPageContext = () => {
    const urlMetadata = safeUrlMetadata(win?.location?.href ?? "");
    return {
      pageOrigin: urlMetadata.origin,
      pagePathHash: urlMetadata.pathHash,
      titleHash: doc?.title ? hashString(doc.title) : null
    };
  };
  const recentDismissals = new Map();
  const writeLearningEvent = (event) => {
    void memoryClient?.writeMemoryEvent?.({ event, repository: "learning" });
  };
  // Gateway memory context for intervention scoring: per-concept TTL cache
  // with in-flight dedup, a hard wait budget per evaluate pass, and a global
  // failure cooldown so an unreachable gateway costs one failed roundtrip per
  // window instead of one per concept per pass.
  const memoryContexts = new Map();
  let memoryContextFailedAt = 0;
  const memoryContextSettings = () => config.inference?.memoryContext ?? {};
  const pruneMemoryContexts = () => {
    const maxEntries = memoryContextSettings().maxEntries ?? 64;
    while (memoryContexts.size > maxEntries) {
      let oldestKey = null;
      let oldestAt = Infinity;
      for (const [entryKey, entry] of memoryContexts) {
        if (entry.fetchedAt < oldestAt) {
          oldestAt = entry.fetchedAt;
          oldestKey = entryKey;
        }
      }
      if (oldestKey === null) break;
      memoryContexts.delete(oldestKey);
    }
  };
  const startMemoryContextQuery = (key, candidate, timestamp) => {
    const promise = (async () => {
      try {
        const result = await memoryClient.queryMemory({
          canonicalName: key,
          candidate: {
            canonicalName: candidate.canonicalName,
            observedText: candidate.observedText,
            knowledgeType: candidate.knowledgeType
          },
          timestamp,
          allowSyncSummarize: false
        });
        if (result?.status === AgentResultStatus.AVAILABLE && result.memoryPacket) {
          memoryContexts.set(key, { packet: result.memoryPacket, fetchedAt: now(), promise: null });
          pruneMemoryContexts();
          return result.memoryPacket;
        }
        memoryContextFailedAt = now();
        memoryContexts.delete(key);
        return null;
      } catch {
        memoryContextFailedAt = now();
        memoryContexts.delete(key);
        return null;
      }
    })();
    memoryContexts.set(key, { packet: null, fetchedAt: 0, promise });
    pruneMemoryContexts();
    return promise;
  };
  // Returns null or a cached packet synchronously; returns a promise only
  // when a real query is in flight. The synchronous fast path matters: the
  // evaluate pass must not yield a microtask when there is nothing to await,
  // or the stream-dismissal race guard's synchronous ordering breaks.
  const fetchMemoryContextPacket = (candidate, timestamp) => {
    const settings = memoryContextSettings();
    if (settings.enabled === false) return null;
    if (typeof memoryClient?.queryMemory !== "function") return null;
    if (memoryContextFailedAt && timestamp - memoryContextFailedAt < (settings.failureCooldownMs ?? 30000)) {
      return null;
    }
    const key = candidate.canonicalName;
    if (!key) return null;
    const cached = memoryContexts.get(key);
    if (cached?.packet && timestamp - cached.fetchedAt < (settings.ttlMs ?? 60000)) {
      return cached.packet;
    }
    const pending = cached?.promise ?? startMemoryContextQuery(key, candidate, timestamp);
    if (typeof win?.setTimeout !== "function") return pending;
    // Hard wait budget: on a wedged gateway this pass scores with the
    // ephemeral context while the query settles into the cache for later.
    return Promise.race([
      pending,
      new Promise((resolve) => win.setTimeout(() => resolve(null), settings.timeoutMs ?? 400))
    ]);
  };
  const createEvent = (event = {}) => {
    const timestamp = event.timestamp ?? now();
    const canonicalName = normalizeKnowledgeObjectName(event.concept ?? event.canonicalName ?? "");
    eventSequence += 1;
    return {
      id: event.id ?? `evt_${timestamp}_${eventSequence}`,
      type: event.type,
      canonicalName,
      observedAlias: event.observedAlias ?? event.concept ?? event.canonicalName ?? "",
      timestamp,
      context: event.context ?? {},
      knowledgeType: event.knowledgeType ?? event.context?.knowledgeType ?? null,
      explanationVersionId: event.explanationVersionId ?? null,
      previousExplanationVersionId: event.previousExplanationVersionId ?? null,
      requestedStyle: event.requestedStyle ?? null,
      explanationStyle: event.explanationStyle ?? null,
      factSensitivity: event.factSensitivity ?? null,
      feedbackEventId: event.feedbackEventId ?? null,
      relatedConcepts: Array.isArray(event.relatedConcepts ?? event.relatedObjects)
        ? (event.relatedConcepts ?? event.relatedObjects).slice(0, config.knowledge?.maxRelatedObjects ?? 5)
        : []
    };
  };
  const overlay = doc?.body ? new CognitiveOverlay({
    doc,
    onDismiss: (prompt) => {
      const timestamp = now();
      const dismissalKey = createInteractionKey({
        candidate: prompt.targetObject ?? { canonicalName: prompt.concept, observedText: prompt.concept },
        fragment: prompt.fragment ?? { id: prompt.context?.fragmentId ?? "" }
      });
      if (dismissalKey) recentDismissals.set(dismissalKey, timestamp);
      const event = createEvent({
        type: MemoryEventType.DISMISSED,
        concept: prompt.concept,
        context: prompt.context,
        timestamp
      });
      writeLearningEvent(event);
    },
    onExpand: (prompt) => {
      const event = createEvent({
        type: MemoryEventType.EXPANDED,
        concept: prompt.concept,
        context: prompt.context,
        knowledgeType: prompt.knowledgeType,
        explanationStyle: prompt.explanationVersion?.style,
        explanationVersionId: prompt.explanationVersion?.id,
        timestamp: now()
      });
      writeLearningEvent(event);
    },
    onFeedback: (event) => {
      if (event?.type === MemoryEventType.REQUESTED_REGENERATION) return;
      const stored = createEvent({
        ...event,
        timestamp: now()
      });
      writeLearningEvent(stored);
    },
    onRegenerate: async (prompt, requestedStyle) => {
      const request = createEvent({
        type: MemoryEventType.REQUESTED_REGENERATION,
        concept: prompt.concept,
        context: prompt.context,
        knowledgeType: prompt.knowledgeType,
        previousExplanationVersionId: prompt.explanationVersion?.id,
        requestedStyle,
        timestamp: now()
      });
      writeLearningEvent(request);
      const requestConfigVersion = runtimeConfigVersion;
      const regenerated = await regenerateExplanation({
        target: prompt.targetObject,
        fragment: prompt.fragment,
        previousVersion: prompt.explanationVersion,
        feedbackEvent: request,
        requestedStyle,
        agentClient,
        config
      });
      if (!config.featureEnabled) {
        return createUnavailableRegenerationResult("feature_disabled", prompt);
      }
      if (requestConfigVersion !== runtimeConfigVersion) {
        return createUnavailableRegenerationResult("runtime_config_changed", prompt);
      }
      if (regenerated.status !== AgentResultStatus.AVAILABLE || !regenerated.text) {
        return regenerated;
      }
      return {
        ...regenerated,
        ...regenerated.explanationVersion,
        text: regenerated.text
      };
    }
  }) : null;
  installDebugOverlay({ doc, win, overlay, now, devMode: isDevMode() });

  if (!config.featureEnabled || !doc?.body) {
    setRuntimeState(doc, "disabled", config.featureEnabled && !doc?.body ? "missing_document_body" : "feature_disabled");
    let startedFromConfig = false;
    const startFromConfig = (nextConfig) => {
      config = mergeConfig(config, nextConfig);
      if (config.featureEnabled && !startedFromConfig) {
        startedFromConfig = true;
        doc.documentElement.dataset.bcoEnabled = "true";
        startBrowserCognitiveOverlay({ win, doc, config, now, agentClient, memoryClient });
      }
    };
    // Page-driven enable (bco:enable / data-bco-enabled) is a dev-only
    // channel; the production enable path is the extension's own storage
    // config update below.
    if (isDevMode()) {
      installRuntimeEnable({
        doc,
        win,
        start: () => startBrowserCognitiveOverlay({
          win,
          doc,
          config: loadRuntimeConfig(win, doc),
          now,
          agentClient,
          memoryClient
        })
      });
    }
    readInitialBrowserConfig({ win, onLoad: startFromConfig });
    installBrowserConfigUpdateListener({ win, onUpdate: startFromConfig });
    return { started: false, reason: "feature_disabled", debugOverlay: overlay };
  }

  const contextTracker = new ReadingContextTracker({ win, doc, now });
  const behaviorTracker = new BehaviorTracker({ config: config.behavior, now });
  setRuntimeState(doc, "started");

  let timer = null;
  let debounce = null;
  let selectionDebounce = null;
  let selectionFinalizeDebounce = null;
  let pendingSelectionFragment = null;
  let pendingSelectionCandidate = null;
  let pointerSelectionActive = false;
  let ignoredSelectionGesture = false;
  let evaluating = false;
  const recentEncounters = new Map();
  const recentSelections = new Map();
  const pendingExplanations = new Set();
  let activeStreamController = null;
  const failedExplanations = new Map();
  const failedExplainCooldownMs = config.inference?.paragraphCooldownMs ?? 90 * 1000;
  const selectionStableMs = Math.max(config.evaluationDebounceMs ?? 0, SELECTION_STABLE_MS);
  const disableRuntime = () => {
    setRuntimeState(doc, "disabled", "feature_disabled");
    stopLoops();
    win.clearTimeout?.(debounce);
    win.clearTimeout?.(selectionDebounce);
    win.clearTimeout?.(selectionFinalizeDebounce);
    pendingSelectionFragment = null;
    pendingSelectionCandidate = null;
    pointerSelectionActive = false;
    ignoredSelectionGesture = false;
    activeStreamController?.abort?.();
    activeStreamController = null;
    hideOverlayQuietly(overlay);
  };

  installBrowserConfigUpdateListener({ win, onUpdate: (nextConfig) => {
    runtimeConfigVersion += 1;
    config = mergeConfig(config, nextConfig);
    behaviorTracker.config = config.behavior;
    if (!config.featureEnabled) {
      disableRuntime();
    } else {
      setRuntimeState(doc, "started");
      startLoops();
      scheduleEvaluate();
    }
  } });

  const clearSelectionFinalize = () => {
    win.clearTimeout?.(selectionFinalizeDebounce);
    selectionFinalizeDebounce = null;
  };

  const clearSelectionSideEffects = () => {
    win.clearTimeout?.(selectionDebounce);
    pendingSelectionFragment = null;
  };

  const readSelectionCandidate = (completedBy) => {
    const fragment = contextTracker.update();
    return {
      text: win.getSelection?.()?.toString?.() ?? "",
      fragment,
      timestamp: now(),
      completedBy
    };
  };

  const selectionTouchesIgnoredSurface = (event = {}, { includeActiveElement = true, includeSelection = true } = {}) => {
    if (isIgnoredReadingSurface(event?.target)) return true;
    if (includeActiveElement && isIgnoredReadingSurface(doc?.activeElement)) return true;
    if (!includeSelection) return false;
    const selection = win.getSelection?.();
    return isIgnoredReadingSurface(selection?.anchorNode) || isIgnoredReadingSurface(selection?.focusNode);
  };

  const finalizeSelection = (completedBy = "keyboard") => {
    if (!config.featureEnabled) {
      disableRuntime();
      return;
    }
    clearSelectionFinalize();
    if (selectionTouchesIgnoredSurface(null)) {
      cancelSelectionGesture();
      return;
    }
    const candidate = readSelectionCandidate(completedBy);
    pendingSelectionCandidate = null;
    const validation = validateSelectedConcept({
      text: candidate.text,
      fragment: candidate.fragment,
      sourceText: candidate.fragment?.text ?? "",
      completedBy,
      config: config.behavior
    });

    behaviorTracker.recordSelection({
      text: validation.text,
      fragment: candidate.fragment,
      timestamp: candidate.timestamp,
      validation
    });

    if (validation.status !== "accepted") {
      clearSelectionSideEffects();
      return setLastSuppressedDecision(doc, validation.reason, candidate.fragment, {
        selectionValidation: validation
      }, isDevMode());
    }

    scheduleSelectedTermEvent(candidate.fragment, 0);
  };

  const scheduleSelectionFinalize = (completedBy = "keyboard", delayMs = selectionStableMs) => {
    clearSelectionFinalize();
    selectionFinalizeDebounce = win.setTimeout?.(() => finalizeSelection(completedBy), delayMs);
  };

  const beginSelectionGesture = (event = {}) => {
    if (!isPrimaryPointerEvent(event)) return;
    ignoredSelectionGesture = selectionTouchesIgnoredSurface(event, {
      includeActiveElement: false,
      includeSelection: false
    });
    pointerSelectionActive = !ignoredSelectionGesture;
    pendingSelectionCandidate = null;
    clearSelectionFinalize();
    clearSelectionSideEffects();
    win.clearTimeout?.(debounce);
    if (ignoredSelectionGesture) return;
    behaviorTracker.recordActivity(now());
  };

  const completeSelectionGesture = (event = {}) => {
    if (!isPrimaryPointerEvent(event)) return;
    if (ignoredSelectionGesture || selectionTouchesIgnoredSurface(event, {
      includeActiveElement: false,
      includeSelection: true
    })) {
      cancelSelectionGesture();
      return;
    }
    if (!pointerSelectionActive) return;
    pointerSelectionActive = false;
    scheduleSelectionFinalize("pointer", SELECTION_FINALIZE_SETTLE_MS);
  };

  const cancelSelectionGesture = () => {
    pointerSelectionActive = false;
    ignoredSelectionGesture = false;
    pendingSelectionCandidate = null;
    clearSelectionFinalize();
    clearSelectionSideEffects();
  };

  const evaluate = async () => {
    if (!config.featureEnabled) {
      disableRuntime();
      return setLastSuppressedDecision(doc, "feature_disabled", null, {}, isDevMode());
    }
    if (evaluating) {
      return setLastSuppressedDecision(doc, "evaluate_in_flight", null, {}, isDevMode());
    }
    evaluating = true;

    try {
      const timestamp = now();
      // Sweep expired failure entries so the map stays bounded on SPA pages.
      // Entries are {failedAt, retryAt} objects (legacy: bare retryAt number).
      for (const [failedKey, failedEntry] of failedExplanations) {
        const entryRetryAt = typeof failedEntry === "number" ? failedEntry : failedEntry?.retryAt ?? 0;
        if (entryRetryAt <= timestamp) failedExplanations.delete(failedKey);
      }
      const fragment = contextTracker.update();
      if (!fragment) {
        return setLastSuppressedDecision(doc, "no_readable_fragment", null, {}, isDevMode());
      }

      const behavior = behaviorTracker.observeFragment(fragment, timestamp);
      if (fragment.selectionAnchored && fragment.selectedText && behavior.selectionText !== fragment.selectedText) {
        const validation = validateSelectedConcept({
          text: fragment.selectedText,
          fragment,
          sourceText: fragment.text,
          completedBy: "selection_anchor",
          config: config.behavior
        });
        if (validation.status === "accepted") {
          behaviorTracker.recordSelection({
            text: validation.text,
            fragment,
            timestamp,
            validation
          });
        }
      }
      const effectiveBehavior = behaviorTracker.getSummary(fragment.id, timestamp);
      const candidates = extractConceptCandidates({
        text: fragment.text,
        selectedText: effectiveBehavior.selectionText,
        maxContextChars: config.privacy.maxContextChars,
        maxCandidates: config.knowledge.maxCandidates
      });
      const top = candidates[0];
      if (!top) {
        return setLastSuppressedDecision(doc, "no_candidate", fragment, {}, isDevMode());
      }

      let memoryPacket = fetchMemoryContextPacket(top, timestamp);
      if (memoryPacket && typeof memoryPacket.then === "function") {
        memoryPacket = await memoryPacket;
        if (!config.featureEnabled) {
          // The feature was hot-disabled while we awaited the memory query.
          disableRuntime();
          return setLastSuppressedDecision(doc, "feature_disabled", null, {}, isDevMode());
        }
      }
      const factSensitivity = classifyFactSensitivity({
        candidate: top,
        fragment,
        feedbackEvents: memoryPacket?.feedbackEvents ?? []
      });
      const candidate = {
        ...top,
        factSensitivity: factSensitivity.level
      };
      const encounterKey = createInteractionKey({ candidate, fragment });
      if (shouldAllowRecent(recentEncounters, encounterKey, timestamp, ENCOUNTER_WRITE_COOLDOWN_MS)) {
        const encounter = createEvent({
          type: MemoryEventType.KNOWLEDGE_ENCOUNTERED,
          concept: candidate.canonicalName,
          observedAlias: candidate.observedText,
          knowledgeType: candidate.knowledgeType,
          context: { fragmentId: fragment.id, fragmentType: fragment.type, ...buildPageContext() },
          relatedConcepts: candidate.relatedConcepts,
          timestamp
        });
        writeLearningEvent(encounter);
      }

      const localCooldowns = {
        recentDismissal: hasRecent(
          recentDismissals,
          createInteractionKey({ candidate, fragment }),
          timestamp,
          config.inference.dismissalCooldownMs
        )
      };
      const learningContext = memoryPacket
        ? createMemoryLearningContext({ candidate, factSensitivity, memoryPacket, localCooldowns })
        : createEphemeralLearningContext({ candidate, factSensitivity, cooldowns: localCooldowns });
      const decision = scoreIntervention({
        fragment,
        behavior: effectiveBehavior,
        candidates: [candidate, ...candidates.slice(1)],
        learningContext,
        config
      });
      if (effectiveBehavior.selectionValidation) {
        decision.selectionValidation = effectiveBehavior.selectionValidation;
      }
      setLastDecision(doc, decision, isDevMode());

      if (!decision.shouldShow || !decision.candidate) return decision;
      if (isSameOverlayPromptVisible(overlay, decision.candidate)) {
        return suppressDecision(decision, "overlay_already_visible", doc, {}, isDevMode());
      }

      const context = {
        fragmentId: fragment.id,
        fragmentType: fragment.type,
        ...buildPageContext(),
        relatedConcepts: learningContext.relatedConcepts,
        knowledgeType: candidate.knowledgeType,
        factSensitivity: factSensitivity.level
      };
      const concept = decision.candidate.canonicalName;
      const explanationKey = createInteractionKey({ candidate: decision.candidate, fragment, style: decision.explanationStyle });
      const failedExplanation = failedExplanations.get(explanationKey);
      const retryAt = typeof failedExplanation === "number" ? failedExplanation : failedExplanation?.retryAt ?? 0;
      const failedAt = typeof failedExplanation === "number" ? 0 : failedExplanation?.failedAt ?? 0;
      const explicitReselection =
        effectiveBehavior.selectedPreciseTerm &&
        Number(effectiveBehavior.selectionTimestamp ?? 0) > failedAt;
      if (retryAt > timestamp && !explicitReselection) {
        return suppressDecision(decision, "recent_agent_unavailable_retry_suppressed", doc, {
          target: decision.candidate,
          retryAt
        }, isDevMode());
      }
      if (pendingExplanations.has(explanationKey)) {
        return suppressDecision(decision, "explain_request_in_flight", doc, { target: decision.candidate }, isDevMode());
      }

      pendingExplanations.add(explanationKey);
      const requestConfigVersion = runtimeConfigVersion;
      const streamPrompt = {
        id: `prompt_${now()}_${fragment.id}`,
        concept,
        knowledgeType: candidate.knowledgeType,
        micro: "",
        expanded: "",
        context,
        decision,
        fragment,
        targetObject: candidate,
        explanationVersion: {
          id: `pending_${now()}_${fragment.id}`,
          status: AgentResultStatus.AVAILABLE,
          source: "external_agent",
          text: ""
        },
        explanationVersionId: null,
        payload: buildAnalysisPayload(fragment, candidates, config)
      };
      let streamPromptShown = false;
      let shownPromptEpoch = null;
      let capturedController = null;
      const explanationVersion = await (agentClient?.streamExplanation
        ? runStreamingExplanation({
            agentClient,
            target: candidate,
            fragment,
            style: decision.explanationStyle,
            config,
            streamPrompt,
            overlay,
            getRuntimeConfigVersion: () => runtimeConfigVersion,
            requestConfigVersion,
            isFeatureEnabled: () => config.featureEnabled,
            setActiveController: (controller) => {
              activeStreamController = controller;
              capturedController = controller;
            },
            onStreamPromptShown: () => {
              streamPromptShown = true;
              // This callback fires synchronously right after
              // overlay.showStreaming, so the captured epoch identifies the
              // exact prompt we showed. The dismissal guard below depends on
              // that ordering — do not make this callback async.
              shownPromptEpoch = overlay?.promptEpoch ?? null;
            }
          })
        : composeShortExplanation({
            target: candidate,
            fragment,
            style: decision.explanationStyle,
            agentClient,
            config
          })).finally(() => {
            // Only clear our own controller: an unconditional reset could
            // null out a newer request's controller once evaluate runs
            // concurrently (currently serialized by `evaluating`).
            if (activeStreamController === capturedController) activeStreamController = null;
            pendingExplanations.delete(explanationKey);
          });
      if (requestConfigVersion !== runtimeConfigVersion) {
        hideOverlayQuietly(overlay);
        return suppressDecision(decision, "runtime_config_changed", doc, { target: decision.candidate }, isDevMode());
      }
      if (!config.featureEnabled) {
        hideOverlayQuietly(overlay);
        return suppressDecision(decision, "feature_disabled", doc, { target: decision.candidate }, isDevMode());
      }
      if (explanationVersion.status !== AgentResultStatus.AVAILABLE || !explanationVersion.text) {
        const failedAt = now();
        failedExplanations.set(explanationKey, {
          failedAt,
          retryAt: failedAt + failedExplainCooldownMs
        });
        setLastAgentResult(doc, explanationVersion, isDevMode());
        return {
          ...decision,
          shouldShow: false,
          agentStatus: explanationVersion.status,
          agentReason: explanationVersion.reason ?? explanationVersion.unavailableReason
        };
      }
      if (streamPromptShown && shownPromptEpoch !== null && !overlay.isPromptLive(shownPromptEpoch)) {
        // The user closed the streaming card while we awaited the final
        // result; writing EXPLANATION_SHOWN/PARAGRAPH_PROMPTED now would
        // train the profile on an explanation that was never accepted.
        return suppressDecision(decision, "prompt_dismissed_during_stream", doc, { target: decision.candidate }, isDevMode());
      }
      failedExplanations.delete(explanationKey);
      const currentVersion = {
        ...explanationVersion,
        ...explanationVersion.explanationVersion,
        timestamp: explanationVersion.explanationVersion?.timestamp ?? now()
      };
      setLastAgentResult(doc, {
        ...currentVersion,
        target: currentVersion.target || candidate.canonicalName,
        targetObject: currentVersion.targetObject?.canonicalName ? currentVersion.targetObject : candidate
      }, isDevMode());
      context.explanationVersionId = currentVersion.id;
      context.explanationStyle = currentVersion.style;
      const prompt = {
        id: `prompt_${now()}_${fragment.id}`,
        concept,
        knowledgeType: candidate.knowledgeType,
        micro: currentVersion.text,
        expanded: explanationVersion.expandedExplanation ?? "",
        context,
        decision,
        fragment,
        targetObject: candidate,
        explanationVersion: currentVersion,
        explanationVersionId: currentVersion.id,
        payload: buildAnalysisPayload(fragment, candidates, config)
      };

      if (streamPromptShown) {
        overlay.currentPrompt = {
          ...(overlay.currentPrompt ?? prompt),
          context,
          explanationVersion: currentVersion,
          explanationVersionId: currentVersion.id
        };
      } else {
        overlay.show(prompt);
      }
      const shown = createEvent({
        type: MemoryEventType.EXPLANATION_SHOWN,
        concept,
        context,
        relatedConcepts: learningContext.relatedConcepts,
        timestamp: now()
      });
      writeLearningEvent(shown);
      const prompted = createEvent({ type: MemoryEventType.PARAGRAPH_PROMPTED, concept, context, timestamp: now() });
      writeLearningEvent(prompted);
      return decision;
    } finally {
      evaluating = false;
    }
  };

  const scheduleEvaluate = (delayMs = config.evaluationDebounceMs) => {
    win.clearTimeout?.(debounce);
    debounce = win.setTimeout?.(evaluate, delayMs);
  };

  const writeSelectedTermEvent = () => {
    const stableSelection = behaviorTracker.selection;
    const stableFragment = pendingSelectionFragment;
    pendingSelectionFragment = null;
    if (!stableFragment || !stableSelection?.selectedPreciseTerm || stableSelection.fragmentId !== stableFragment.id) {
      return;
    }

    const concept = stableSelection.validation?.canonicalName ?? normalizeKnowledgeObjectName(stableSelection.text);
    if (!concept) return;

    const timestamp = now();
    const selectionKey = createInteractionKey({
      candidate: { canonicalName: concept, observedText: stableSelection.text },
      fragment: stableFragment,
      style: "selection"
    });
    if (shouldAllowRecent(recentSelections, selectionKey, timestamp, SELECTION_WRITE_COOLDOWN_MS)) {
      const event = createEvent({
        type: MemoryEventType.USER_SELECTED_TERM,
        concept,
        observedAlias: stableSelection.text,
        context: { fragmentId: stableFragment.id, fragmentType: stableFragment.type, ...buildPageContext() },
        timestamp
      });
      writeLearningEvent(event);
    }

    void evaluate();
  };

  const scheduleSelectedTermEvent = (fragment, delayMs = selectionStableMs) => {
    win.clearTimeout?.(selectionDebounce);
    const selection = behaviorTracker.selection;
    if (!fragment || !selection?.selectedPreciseTerm) {
      pendingSelectionFragment = null;
      return;
    }

    pendingSelectionFragment = fragment;
    if (delayMs <= 0) {
      writeSelectedTermEvent();
      return;
    }
    selectionDebounce = win.setTimeout?.(writeSelectedTermEvent, delayMs);
  };

  doc.addEventListener("selectionchange", (event) => {
    if (!config.featureEnabled) {
      disableRuntime();
      return;
    }
    if (ignoredSelectionGesture || selectionTouchesIgnoredSurface(event)) {
      cancelSelectionGesture();
      return;
    }
    pendingSelectionCandidate = readSelectionCandidate("selectionchange");
    if (pointerSelectionActive) return;
    scheduleSelectionFinalize("keyboard", selectionStableMs);
  });
  doc.addEventListener?.("pointerdown", beginSelectionGesture);
  doc.addEventListener?.("pointerup", completeSelectionGesture);
  doc.addEventListener?.("pointercancel", cancelSelectionGesture);
  doc.addEventListener?.("mousedown", beginSelectionGesture);
  doc.addEventListener?.("mouseup", completeSelectionGesture);
  win.addEventListener?.("blur", cancelSelectionGesture);
  doc.addEventListener?.("visibilitychange", () => {
    if (doc.visibilityState === "hidden") cancelSelectionGesture();
  });
  installDebugOverlay({ doc, win, overlay, now, devMode: isDevMode() });
  win.addEventListener("scroll", scheduleEvaluate, { passive: true });
  win.addEventListener("resize", scheduleEvaluate, { passive: true });
  win.addEventListener("pointermove", () => behaviorTracker.recordActivity(now()), { passive: true });
  win.addEventListener("keydown", () => behaviorTracker.recordActivity(now()), { passive: true });

  // Single lifecycle seam for the periodic work: "disabled" must really stop
  // the interval and the whole-body MutationObserver, not just hide the UI.
  const MutationObserverCtor = win.MutationObserver;
  const mutationObserver = MutationObserverCtor ? new MutationObserverCtor(scheduleEvaluate) : null;
  let loopsRunning = false;
  function startLoops() {
    if (loopsRunning) return;
    loopsRunning = true;
    mutationObserver?.observe?.(doc.body, { childList: true, subtree: true, characterData: true });
    timer = win.setInterval?.(evaluate, config.evaluationIntervalMs);
  }
  function stopLoops() {
    if (!loopsRunning) return;
    loopsRunning = false;
    win.clearInterval?.(timer);
    timer = null;
    mutationObserver?.disconnect?.();
  }
  startLoops();
  scheduleEvaluate();

  return {
    started: true,
    evaluate,
    stop() {
      stopLoops();
      win.clearTimeout?.(debounce);
      win.clearTimeout?.(selectionDebounce);
      win.clearTimeout?.(selectionFinalizeDebounce);
    },
    contextTracker,
    behaviorTracker,
    overlay
  };
}

startBrowserCognitiveOverlay();

async function runStreamingExplanation({
  agentClient,
  target,
  fragment,
  style,
  config,
  streamPrompt,
  overlay,
  getRuntimeConfigVersion,
  requestConfigVersion,
  isFeatureEnabled,
  setActiveController,
  onStreamPromptShown
} = {}) {
  const input = createComposerInput({
    target,
    fragment,
    requestedStyle: style,
    config
  });
  const Controller = globalThis.AbortController;
  const controller = Controller ? new Controller() : { signal: null, abort() {} };
  setActiveController?.(controller);
  let promptShown = false;
  let directFinal = null;
  const raw = await agentClient.streamExplanation(input, {
    signal: controller.signal,
    onEvent: (event = {}) => {
      if (getRuntimeConfigVersion?.() !== requestConfigVersion || !isFeatureEnabled?.()) return;
      if (!promptShown) {
        promptShown = true;
        overlay?.showStreaming?.({
          ...streamPrompt,
          streamSessionId: event.sessionId ?? input.requestId
        });
        onStreamPromptShown?.();
      }
      overlay?.applyStreamEvent?.(event);
      if (event.type === "lane_final" && event.lane === "direct" && event.result) {
        directFinal = event.result;
      }
    }
  });
  const result = directFinal?.status === AgentResultStatus.AVAILABLE ? directFinal : raw;
  return validateAgentExplanationResult(result, {
    input,
    capabilityKind: "explain",
    goal: "micro",
    config
  });
}

function installDebugOverlay({ doc, win, overlay, now = () => Date.now(), devMode = false } = {}) {
  // Page-dispatchable debug events are a dev-only channel: in production any
  // site could otherwise force the overlay open or detect the extension.
  if (devMode !== true) return;
  if (!doc?.addEventListener || !overlay) return;
  if (doc.documentElement?.dataset?.bcoDebugListener === "registered") return;
  doc.documentElement.dataset.bcoDebugListener = "registered";
  doc.addEventListener("bco:debug-show", () => {
    overlay.show({
      id: `debug_${now()}`,
      concept: "KL divergence",
      knowledgeType: "technology",
      micro: "BCO debug card: the overlay UI is rendering correctly.",
      expanded: "If this appears, the extension loaded and the overlay can draw. If normal selection still stays silent, inspect document.documentElement.dataset.bcoLastDecision.",
      context: { fragmentId: "debug", fragmentType: "debug", url: win?.location?.href ?? "", title: doc.title },
      decision: { shouldShow: true, reasons: ["debug"] },
      fragment: { id: "debug", type: "debug", text: "" },
      targetObject: { canonicalName: "KL divergence", observedText: "KL divergence", knowledgeType: "technology" },
      explanationVersion: { id: "debug", style: "concise", text: "BCO debug card: the overlay UI is rendering correctly." },
      debug: true,
      explanationVersionId: "debug"
    });
  });
}

function installRuntimeEnable({ doc, win, start } = {}) {
  const root = doc?.documentElement;
  if (!root?.dataset || !doc?.addEventListener || typeof start !== "function") return;
  if (root.dataset.bcoEnableListener === "registered") return;
  root.dataset.bcoEnableListener = "registered";

  const tryStart = () => {
    if (root.dataset.bcoState === "started") return null;
    const enabled = root.dataset.bcoEnabled === "true" || win?.__BCO_CONFIG__?.featureEnabled === true;
    if (!enabled) return null;
    return start();
  };

  doc.addEventListener("bco:enable", tryStart);
  const MutationObserverCtor = win?.MutationObserver;
  if (MutationObserverCtor) {
    const observer = new MutationObserverCtor(tryStart);
    observer.observe(root, { attributes: true, attributeFilter: ["data-bco-enabled"] });
  }
}

// One dispatcher per storage.onChanged surface: the disabled bootstrap and
// the started runtime both want config updates, and the bootstrap path
// re-enters startBrowserCognitiveOverlay. Registering once and swapping the
// active handler prevents listener accumulation across disable/enable cycles.
const browserConfigDispatchers = new WeakMap();

function installBrowserConfigUpdateListener({ win, onUpdate } = {}) {
  const chromeApi = win?.chrome ?? globalThis.chrome;
  const storage = chromeApi?.storage;
  if (!storage?.onChanged?.addListener || typeof onUpdate !== "function") return;
  const existing = browserConfigDispatchers.get(storage.onChanged);
  if (existing) {
    existing.handler = onUpdate;
    return;
  }
  const dispatcher = { handler: onUpdate };
  browserConfigDispatchers.set(storage.onChanged, dispatcher);
  storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    const nextConfig = changes?.[BROWSER_CONFIG_STORAGE_KEY]?.newValue;
    if (!nextConfig || typeof nextConfig !== "object") return;
    dispatcher.handler(nextConfig);
  });
}

function readInitialBrowserConfig({ win, onLoad } = {}) {
  const chromeApi = win?.chrome ?? globalThis.chrome;
  const storage = chromeApi?.storage?.local;
  if (!storage?.get || typeof onLoad !== "function") return;
  try {
    storage.get([BROWSER_CONFIG_STORAGE_KEY], (result) => {
      const nextConfig = result?.[BROWSER_CONFIG_STORAGE_KEY];
      if (!nextConfig || typeof nextConfig !== "object") return;
      onLoad(nextConfig);
    });
  } catch {
    // Startup should stay disabled if extension storage is unavailable.
  }
}

function setRuntimeState(doc, state, reason = "") {
  const root = doc?.documentElement;
  if (!root?.dataset) return;
  root.dataset.bcoState = state;
  if (reason) root.dataset.bcoReason = reason;
  else delete root.dataset.bcoReason;
}

function setLastDecision(doc, decision, devMode = false) {
  // Decision diagnostics name the concepts the user is reading; never write
  // them to the page-readable dataset outside dev mode.
  if (devMode !== true) return;
  const root = doc?.documentElement;
  if (!root?.dataset || !decision) return;
  root.dataset.bcoLastDecision = JSON.stringify({
    shouldShow: decision.shouldShow,
    priority: decision.priority,
    candidate: decision.candidate?.canonicalName ?? null,
    fragmentId: decision.fragmentId ?? null,
    reasons: decision.reasons ?? [],
    suppressions: decision.suppressions ?? [],
    selectionValidation: decision.selectionValidation ?? null
  });
}

function setLastSuppressedDecision(doc, reason, fragment = null, extra = {}, devMode = false) {
  const decision = {
    shouldShow: false,
    priority: 0,
    candidate: null,
    reasons: [],
    suppressions: [reason],
    fragmentId: fragment?.id ?? null,
    selectionValidation: summarizeSelectionValidation(extra.selectionValidation)
  };
  setLastDecision(doc, decision, devMode);
  return decision;
}

function setLastAgentResult(doc, result, devMode = false) {
  if (devMode !== true) return;
  const root = doc?.documentElement;
  if (!root?.dataset || !result) return;
  root.dataset.bcoLastAgentResult = JSON.stringify({
    status: result.status,
    reason: result.reason ?? result.unavailableReason ?? null,
    target: result.targetObject?.canonicalName ?? result.target ?? null,
    capabilityKind: result.capabilityKind ?? null,
    providerMode: result.providerMode ?? null,
    versionId: result.id ?? result.explanationVersion?.id ?? result.versionMetadata?.id ?? null,
    timestamp: result.timestamp ?? result.explanationVersion?.timestamp ?? result.versionMetadata?.timestamp ?? null
  });
}

function isPrimaryPointerEvent(event = {}) {
  return event.button == null || event.button === 0;
}

function createInteractionKey({ candidate, fragment, style = "" } = {}) {
  const concept = candidate?.canonicalName ?? candidate?.observedText ?? "";
  const fragmentId = fragment?.id ?? "";
  return `${concept}|${fragmentId}|${style}`;
}

function shouldAllowRecent(cache, key, timestamp, windowMs) {
  if (!cache || !key) return true;
  for (const [cachedKey, seenAt] of cache.entries()) {
    if (timestamp - seenAt > windowMs) cache.delete(cachedKey);
  }
  const lastSeenAt = cache.get(key);
  if (lastSeenAt && timestamp - lastSeenAt <= windowMs) return false;
  cache.set(key, timestamp);
  return true;
}

function hasRecent(cache, key, timestamp, windowMs) {
  if (!cache || !key) return false;
  for (const [cachedKey, seenAt] of cache.entries()) {
    if (timestamp - seenAt > windowMs) cache.delete(cachedKey);
  }
  const seenAt = cache.get(key);
  return typeof seenAt === "number" && timestamp - seenAt <= windowMs;
}

function isSameOverlayPromptVisible(overlay, candidate) {
  if (!(overlay?.root && overlay.root.hidden === false && overlay.currentPrompt)) return false;
  const currentConcept = normalizeKnowledgeObjectName(
    overlay.currentPrompt.concept ?? overlay.currentPrompt.targetObject?.canonicalName ?? ""
  );
  const nextConcept = normalizeKnowledgeObjectName(candidate?.canonicalName ?? candidate?.observedText ?? "");
  return Boolean(currentConcept && nextConcept && currentConcept === nextConcept);
}

function hideOverlayQuietly(overlay) {
  if (!overlay?.root) return;
  overlay.root.hidden = true;
  if (typeof overlay.clearNode === "function") overlay.clearNode(overlay.root);
  else if (typeof overlay.root.replaceChildren === "function") overlay.root.replaceChildren();
  else overlay.root.textContent = "";
  overlay.currentPrompt = null;
}

function suppressDecision(decision, reason, doc, extra = {}, devMode = false) {
  const result = {
    status: AgentResultStatus.UNAVAILABLE,
    reason,
    unavailableReason: reason,
    targetObject: extra.target ?? decision.candidate ?? null,
    retryAt: extra.retryAt ?? null
  };
  const suppressedDecision = {
    ...decision,
    shouldShow: false,
    suppressions: [...(decision.suppressions ?? []), reason],
    agentStatus: result.status,
    agentReason: reason
  };
  setLastDecision(doc, suppressedDecision, devMode);
  if (reason !== "overlay_already_visible") {
    setLastAgentResult(doc, result, devMode);
  }
  return suppressedDecision;
}

function createUnavailableRegenerationResult(reason, prompt = {}) {
  return {
    status: AgentResultStatus.UNAVAILABLE,
    reason,
    unavailableReason: reason,
    targetObject: prompt.targetObject ?? null,
    text: ""
  };
}

function createMemoryLearningContext({ candidate, factSensitivity, memoryPacket, localCooldowns = {} }) {
  const packetCooldowns = memoryPacket.cooldowns ?? {};
  return {
    canonicalName: candidate.canonicalName,
    events: [],
    aliases: memoryPacket.agentSummary?.aliases ?? [],
    relatedConcepts: (memoryPacket.relatedObjects ?? [])
      .map((related) => related?.canonicalName)
      .filter(Boolean),
    recentTopics: [],
    derivedSignals: memoryPacket.derivedSignals ?? {},
    feedbackEvents: memoryPacket.feedbackEvents ?? [],
    priorExplanations: memoryPacket.priorExplanations ?? [],
    profileHints: memoryPacket.profileHints ?? {},
    // Cooldowns merge as a union: the local tracker reacts before the event
    // batch reaches the gateway, while gateway memory remembers across pages
    // and reloads. Neither side may clear the other's suppression.
    cooldowns: {
      ...packetCooldowns,
      recentDismissal: Boolean(localCooldowns.recentDismissal || packetCooldowns.recentDismissal)
    },
    factSensitivity: factSensitivity.level,
    sourceVerified: !factSensitivity.requiresSource,
    retrievalMode: "gateway_memory_packet"
  };
}

function createEphemeralLearningContext({ candidate, factSensitivity, cooldowns = {} }) {
  return {
    canonicalName: candidate.canonicalName,
    events: [],
    aliases: [],
    relatedConcepts: [],
    recentTopics: [],
    derivedSignals: {},
    feedbackEvents: [],
    priorExplanations: [],
    profileHints: {},
    cooldowns,
    factSensitivity: factSensitivity.level,
    sourceVerified: !factSensitivity.requiresSource,
    retrievalMode: "immediate_browser_context"
  };
}
