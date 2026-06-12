// @ts-nocheck
import { AgentResultStatus, MemoryRepositoryMode } from "./contracts.js";

export function createLocalGatewayMemoryRepository({ gatewayClient }) {
  return {
    mode: MemoryRepositoryMode.LOCAL_GATEWAY,
    shared: true,
    async writeEvent(event, options = {}) {
      const result = await gatewayClient.writeMemoryEvent({ event, ...options });
      return { ...result, mode: MemoryRepositoryMode.LOCAL_GATEWAY, shared: true };
    },
    async queryMemory(query = {}) {
      const result = await gatewayClient.queryMemory(query);
      return { ...result, mode: MemoryRepositoryMode.LOCAL_GATEWAY, shared: true };
    },
    async migrateTo() {
      return {
        status: AgentResultStatus.UNAVAILABLE,
        reason: "local_gateway_repository_is_target_only"
      };
    }
  };
}
