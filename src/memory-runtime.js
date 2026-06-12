// @ts-nocheck
// Memory Runtime boundary: a thin runtime-owned facade over the local memory
// store (or layered repository). The HTTP gateway and the explain pipeline go
// through this facade; neither touches local-memory-store.js directly.
import { AgentResultStatus } from "./contracts.js";
import {
  createLocalMemoryStore,
  createPersistentLocalMemoryStore,
  resolveDefaultLocalMemoryStorePath
} from "./local-memory-store.js";
import { createMemoryRepositoryFromRuntimeConfig } from "./memory-repository-factory.js";

export {
  createLocalMemoryStore,
  createPersistentLocalMemoryStore,
  createMemoryRepositoryFromRuntimeConfig,
  resolveDefaultLocalMemoryStorePath
};

// Methods the explain pipeline probes with optional chaining before calling.
// They are mirrored only when the underlying store provides them, so the
// pipeline's capability probes keep working against stub stores in tests and
// against repositories that do not implement the full surface.
const DELEGATED_STORE_METHODS = [
  "writeEvent",
  "queryMemory",
  "writeExplanationVersion",
  "writeMemoryCandidate",
  "scheduleRelationDiscovery",
  "discoverPreRecallMemoryBridges",
  "commitPreRecallRelations",
  "writeRelatedConceptHints",
  "readProfileSummary",
  "processBacklog",
  "processOutbox"
];

export function createMemoryRuntime({ store = createLocalMemoryStore() } = {}) {
  const runtime = {
    getHealth() {
      return typeof store.getHealth === "function" ? store.getHealth() : null;
    },
    updateCognitiveConfig(update = {}) {
      return store.updateConfig?.(update);
    },
    async writeEvents(payloads = []) {
      const events = [];
      for (const payload of payloads) {
        const stored = await store.writeEvent(payload);
        events.push(stored);
        if (stored?.status === AgentResultStatus.UNAVAILABLE) break;
      }
      return events;
    },
    close() {
      return store.close?.();
    }
  };
  for (const name of DELEGATED_STORE_METHODS) {
    if (typeof store[name] === "function") {
      runtime[name] = (...args) => store[name](...args);
    }
  }
  return runtime;
}
