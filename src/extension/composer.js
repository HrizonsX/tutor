// @ts-nocheck
import { DEFAULT_CONFIG } from "../shared/config.js";
import { AgentCapability, AgentRequestGoal, ExplanationStyle } from "../shared/contracts.js";
import { createUnavailableAgentResult, validateAgentExplanationResult } from "./agent-service.js";
import { clampText } from "../shared/privacy.js";

export function createComposerInput({
  retrievalPacket,
  target = null,
  fragment = null,
  explanationGoal = AgentRequestGoal.MICRO,
  previousVersion = null,
  feedbackEvent = null,
  requestedStyle = null,
  config = DEFAULT_CONFIG
} = {}) {
  const requestTarget = target ?? retrievalPacket?.target ?? {};
  return {
    target: {
      canonicalName: requestTarget.canonicalName,
      observedText: requestTarget.observedText,
      knowledgeType: requestTarget.knowledgeType,
      factSensitivity: requestTarget.factSensitivity
    },
    minimalContext: {
      fragmentId: fragment?.id ?? null,
      fragmentType: fragment?.type ?? null,
      text: clampText(fragment?.text ?? "", config.privacy.maxContextChars)
    },
    explanationGoal,
    requestedStyle: requestedStyle ?? config.composer.defaultStyle,
    previousVersion,
    feedbackEvent,
    constraints: {
      maxChars: config.composer.maxMicroChars,
      avoidNewJargon: true,
      composerOwnsInterventionDecision: false
    }
  };
}

export async function composeShortExplanation({
  retrievalPacket,
  target = null,
  fragment = null,
  agentClient = null,
  modelClient = null,
  style = null,
  config = DEFAULT_CONFIG
} = {}) {
  const input = createComposerInput({
    retrievalPacket,
    target,
    fragment,
    requestedStyle: style,
    config
  });
  const client = agentClient ?? modelClient;
  if (!client?.composeShortExplanation && !client?.explainKnowledge) {
    return createUnavailableAgentResult({
      reason: "agent_provider_unconfigured",
      capabilityKind: AgentCapability.EXPLAIN,
      goal: AgentRequestGoal.MICRO,
      input
    });
  }

  const raw = client.explainKnowledge
    ? await client.explainKnowledge({ input, goal: AgentRequestGoal.MICRO })
    : await client.composeShortExplanation(input);
  return validateAgentExplanationResult(raw, {
    input,
    capabilityKind: AgentCapability.EXPLAIN,
    goal: AgentRequestGoal.MICRO,
    config
  });
}

export async function regenerateExplanation({
  retrievalPacket,
  target = null,
  fragment = null,
  previousVersion,
  feedbackEvent,
  requestedStyle = ExplanationStyle.CONTEXTUAL_ROLE,
  agentClient = null,
  modelClient = null,
  config = DEFAULT_CONFIG
} = {}) {
  const input = createComposerInput({
    retrievalPacket,
    target,
    fragment,
    previousVersion,
    feedbackEvent,
    requestedStyle,
    explanationGoal: AgentRequestGoal.REGENERATE,
    config
  });
  const client = agentClient ?? modelClient;
  if (!client?.regenerateExplanation && !client?.explainKnowledge) {
    return createUnavailableAgentResult({
      reason: "agent_provider_unconfigured",
      capabilityKind: AgentCapability.REWRITE,
      goal: AgentRequestGoal.REGENERATE,
      input,
      previousVersion
    });
  }

  const raw = client.explainKnowledge
    ? await client.explainKnowledge({ input, goal: AgentRequestGoal.REGENERATE })
    : await client.regenerateExplanation(input);
  return validateAgentExplanationResult(raw, {
    input,
    capabilityKind: AgentCapability.REWRITE,
    goal: AgentRequestGoal.REGENERATE,
    config
  });
}

export function trimMicro(text, config = DEFAULT_CONFIG) {
  const bounded = clampText(text, config.composer.maxMicroChars);
  const sentences = bounded.match(/[^.!?。！？]+[.!?。！？]?/g) ?? [bounded];
  return clampText(sentences.slice(0, 2).join(" ").trim(), config.composer.maxMicroChars);
}
