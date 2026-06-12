// @ts-nocheck
export const BROWSER_CONFIG_STORAGE_KEY = "bco.browserConfig";

export const DEFAULT_CONFIG = Object.freeze({
  featureEnabled: true,
  devMode: false,
  evaluationDebounceMs: 250,
  evaluationIntervalMs: 3000,
  privacy: {
    maxContextChars: 1200,
    maxStoredAliasChars: 120,
    maxStoredUrlChars: 180
  },
  behavior: {
    dwellThresholdMs: 8000,
    inactivityThresholdMs: 45000,
    largeSelectionChars: 420,
    largeSelectionLines: 8,
    revisitWindowMs: 120000,
    repeatedPauseWindowMs: 90000,
    maxTrackedFragments: 300,
    maxTrackedConceptPauses: 300
  },
  inference: {
    showThreshold: 0.6,
    dismissalCooldownMs: 120000,
    paragraphCooldownMs: 90000,
    recentlyExplainedCooldownMs: 600000,
    lowInterventionPenalty: 0.22,
    profileInterestBoost: 0.1,
    profileDifficultyBoost: 0.18,
    markedKnownPenalty: 0.28,
    mutedPenalty: 0.6,
    wrongExplanationPenalty: 0.2
  },
  knowledge: {
    maxCandidates: 5,
    maxRelatedObjects: 5,
    semanticCueWindowChars: 90,
    factSensitiveFallback: "background_only"
  },
  profile: {
    evidenceWindowMs: 30 * 24 * 60 * 60 * 1000,
    feedbackCooldownMs: 30 * 60 * 1000,
    categoryInterestThreshold: 2,
    stylePreferenceThreshold: 2
  },
  composer: {
    maxMicroChars: 220,
    maxRegenerationsPerPrompt: 3,
    defaultStyle: "concise"
  },
  localGateway: {
    endpoint: "http://127.0.0.1:17321",
    pairingToken: "",
    timeoutMs: 8000,
    streamIdleTimeoutMs: 30000,
    health: {
      enabled: true,
      cacheTtlMs: 30 * 1000
    }
  },
  agent: {
    cacheTtlMs: 5 * 60 * 1000,
    rateLimit: {
      maxRequests: 20,
      windowMs: 60 * 1000
    }
  },
  embedding: {
    vectorDimensions: 0
  },
  memory: {
    schemaVersion: 1,
    cognitive: {
      dailySummaryWindowDays: 30,
      selectedDayLimit: 8,
      relationProposalConcurrency: 3,
      relationProposalCacheVersion: "relation-proposer.v1",
      relationDepth: 1,
      maxActiveRelationsPerConcept: 20,
      microBridgeLimit: 1,
      expandedBridgeLimit: 3,
      relatedConceptHintLimit: 20,
      relatedConceptHintCandidateLimit: 8,
      profileRefreshIntervalMs: 30 * 60 * 1000,
      profileRefreshMinNewEvents: 30,
      reportConceptLimit: 12,
      reportRelationLimit: 8,
      forgettingRiskDays: 14
    }
  }
});

export function mergeConfig(base, override = {}) {
  const { providerConfig: legacyProviderConfig, localGateway: localGatewayOverride, ...safeOverride } = override;
  const output = { ...base, ...safeOverride };
  output.privacy = { ...base.privacy, ...override.privacy };
  output.behavior = { ...base.behavior, ...override.behavior };
  output.inference = { ...base.inference, ...override.inference };
  output.knowledge = { ...base.knowledge, ...override.knowledge };
  output.profile = { ...base.profile, ...override.profile };
  output.composer = { ...base.composer, ...override.composer };
  output.localGateway = mergeLocalGatewayConfig(
    base.localGateway,
    localGatewayOverride ?? legacyProviderConfig?.localGateway
  );
  output.agent = {
    ...base.agent,
    ...override.agent,
    rateLimit: { ...base.agent.rateLimit, ...override.agent?.rateLimit }
  };
  output.embedding = { ...base.embedding, ...override.embedding };
  output.memory = {
    ...base.memory,
    ...override.memory,
    cognitive: { ...base.memory?.cognitive, ...override.memory?.cognitive }
  };
  return output;
}

function mergeLocalGatewayConfig(base = {}, override = {}) {
  return {
    ...base,
    ...override,
    health: { ...base.health, ...override.health }
  };
}

export function readFeatureFlag(win = globalThis.window, doc = globalThis.document) {
  const datasetFlag = doc?.documentElement?.dataset?.bcoEnabled;
  const datasetDevFlag = doc?.documentElement?.dataset?.bcoDev;
  const globalFlag = win?.__BCO_CONFIG__?.featureEnabled;
  const featureFlag = {};

  if (datasetFlag === "true" || globalFlag === true) {
    featureFlag.featureEnabled = true;
  } else if (datasetFlag === "false" || globalFlag === false) {
    featureFlag.featureEnabled = false;
  }

  return {
    ...featureFlag,
    devMode: datasetDevFlag === "true" || win?.__BCO_CONFIG__?.devMode === true
  };
}

export function loadRuntimeConfig(win = globalThis.window, doc = globalThis.document) {
  return mergeConfig(DEFAULT_CONFIG, {
    ...win?.__BCO_CONFIG__,
    ...readFeatureFlag(win, doc)
  });
}
