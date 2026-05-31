## Why

当前浏览器插件已经能通过 background service worker 调用外部 Agent，但 provider 模式、健康检查、长期记忆归属和运行时排障状态仍然分散。为了支持 MVP 本机版产品形态，需要把浏览器插件定位为“信号捕捉与交互层”，把 localhost Agent/Gateway 定位为“本机能力与跨浏览器记忆层”。

这样可以让 Chrome、Edge、Firefox 等浏览器插件共享同一套本机学习记忆，同时保持 content script 不直接调用 Agent、LLM、embedding 或长期记忆数据库。

## What Changes

- 引入统一 provider 架构，明确 `off`、`local`、`custom`、`cloud` 四种模式。
- 定义稳定 Agent 协议，覆盖 `health`、`explain`、`rewrite`、`embedding` 和记忆相关能力发现。
- 引入 MVP 本机 localhost Agent/Gateway：只监听 `127.0.0.1`，通过轻量配对 token 保护接口，并提供本机记忆 repository。
- 将长期学习记忆的 source of truth 从“单个浏览器 IndexedDB”提升为可替换 repository；MVP 默认由 localhost 服务维护，浏览器侧只保留必要缓存或降级存储。
- 扩展 background service worker 职责，使其成为浏览器侧唯一 gateway client，负责 provider 配置、权限、token、超时、限流、缓存和错误归一化。
- 暴露运行时观测状态，包括 provider 模式、health、capabilities、权限、最近触发决策、suppression reasons、最近 Agent 结果和 memory repository 状态。
- 保持生产解释路径不使用本地硬编码概念库；fixture 仅用于测试、demo 或候选识别验证。

## Capabilities

### New Capabilities

- `agent-provider-architecture`: 定义统一 provider 模式、稳定 Agent request/response contract、能力发现和结构化状态。
- `local-agent-memory-gateway`: 定义 MVP 本机 localhost Agent/Gateway、轻量配对、记忆 repository、跨浏览器共享记忆和 gateway API。
- `runtime-observability`: 定义 debug/popup/options 可读取的运行时状态、最近决策、provider health、权限和 Agent 结果。

### Modified Capabilities

- `background-service-mediation`: background service worker 从“外部 Agent 调用边界”扩展为浏览器侧唯一 gateway client，负责 provider 模式、localhost endpoint、token、权限、超时、限流、缓存和错误归一化。
- `learning-memory`: 学习记忆从浏览器 IndexedDB 专属存储升级为 repository 边界，支持 localhost 服务作为 MVP 持久 source of truth，并允许浏览器本地存储作为缓存或降级路径。
- `short-explanation-composer`: composer 边界改为通过统一 Agent 协议请求解释与改写，并验证 provider capability 与结构化结果。

## Impact

- Affected code: `src/contracts.js`, `src/config.js`, `src/agent-service.js`, `src/background.js`, `src/content.js`, `src/memory.js`, `src/profile.js`, `src/indexeddb-storage.js`, composer and tests.
- New code areas: provider registry/client, localhost gateway client, memory repository adapters, diagnostics/runtime state module, options/popup-facing diagnostics API.
- Local service/API: MVP localhost Agent/Gateway with `/health`, `/explain`, `/rewrite`, `/embedding`, `/memory/events`, `/memory/query`, and optional management endpoints.
- Manifest/permissions: host permissions for `http://127.0.0.1:<port>/*` or configurable localhost endpoint; content scripts remain isolated from direct external calls.
- Tests: contract tests for provider modes, health/capabilities, background-only calls, localhost unavailable states, memory repository fallback, and runtime diagnostics.
