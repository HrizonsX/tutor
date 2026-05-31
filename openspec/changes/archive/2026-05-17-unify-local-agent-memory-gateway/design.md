## Context

当前系统已经具备浏览器 content script、Manifest V3 background service worker、外部 Agent 调用边界、IndexedDB 学习记忆和结构化解释结果。新的产品方向是 MVP 本机版：浏览器插件捕捉阅读信号与用户反馈，background 作为唯一网关客户端，localhost Agent/Gateway 负责本机 Agent 能力与跨浏览器长期记忆。

这个设计将“用户在产品里学过什么”从单个浏览器 profile 的 IndexedDB 中抽象出来。MVP 默认由本机服务维护长期记忆；浏览器侧保留必要缓存、降级存储和页面交互状态，但不直接拥有跨浏览器记忆数据库。

## Goals / Non-Goals

**Goals:**

- 支持 `off`、`local`、`custom`、`cloud` 四种 provider 模式。
- 将 `local` provider 定义为本机 HTTP 服务/localhost Agent，默认只监听 `127.0.0.1`。
- 通过统一 Agent 协议调用 health、explain、rewrite、embedding 和 memory 相关能力。
- 让 content script 不因 provider 切换而修改；content script 只和 background 通讯。
- 将长期学习记忆、profile、解释版本、summary、graph edge、vector 和迁移逻辑封装在 repository 边界中。
- 暴露 provider、health、permission、last decision、suppression、last Agent result、memory 状态，供 debug/popup/options 使用。

**Non-Goals:**

- 不在本次 MVP 中实现云同步、账号体系、多设备授权或端到端加密。
- 不把 content script 变成 Agent 客户端或长期记忆数据库客户端。
- 不实现聊天侧边栏、自动网页操作、自动搜索或 autonomous browser agent。
- 不要求 embedding provider 才能使用学习记忆。
- 不移除测试 fixture；只要求生产解释路径不依赖 fixture 生成知识解释。

## Decisions

### Decision: Browser extension is the sensing and UX layer

Content script 负责阅读上下文捕捉、候选识别、低打扰 overlay 和用户反馈收集。它只把结构化输入发给 background，不直接调用 localhost service、cloud provider、custom endpoint、LLM、Agent、embedding 或长期记忆数据库。

Rationale: content script 运行在页面附近，暴露面最大。让它保持轻量，可以让 provider、记忆库和安全策略在不改页面注入逻辑的情况下演进。

Alternative considered: content script 直接调用 localhost Agent。这样初期简单，但会让页面上下文、provider 配置和长期记忆权限分散，后续很难审计。

### Decision: Background is the browser-side gateway client

Background service worker 负责 provider mode、endpoint、pairing token、host permission、timeout、rate limit、cache、错误归一化和 diagnostics。它把 content script 的请求转换为统一 Agent 协议，并调用对应 provider。

Rationale: background 是扩展中最适合持有外部调用边界的位置。它可以集中处理 Chrome permissions、API key、本机 token 和失败策略。

Alternative considered: 在每个业务模块中各自处理 provider 调用。这样会造成协议重复和错误语义不一致。

### Decision: Local provider means localhost Agent/Gateway

`local` provider 指本机 HTTP 服务，例如 `http://127.0.0.1:<port>`。该服务提供 `/health`、`/explain`、`/rewrite`、`/embedding`、`/memory/events` 和 `/memory/query` 等端点，MVP 可以先用 stub 或最小实现覆盖部分能力。

Rationale: localhost 服务能够跨浏览器共享记忆，并允许未来接入本机模型、agent runtime、SQLite/graph/vector 存储和 provider adapter。

Alternative considered: 在浏览器扩展内运行本地模型或本地记忆图谱。这样部署简单但受扩展运行时限制，且跨浏览器共享困难。

### Decision: Memory source of truth moves behind repository boundary

MVP 中长期学习记忆的 source of truth 是 localhost memory repository。它保存 learning events、profile hints、explanation versions、agent summaries、graph edges、optional vectors 和 migrations。浏览器 IndexedDB 可作为缓存、离线降级或迁移来源，但业务编排层依赖 repository 接口而不是具体存储实现。

Rationale: 用户换浏览器后仍应能继承已学知识和学习画像。repository 边界让后续从 SQLite、IndexedDB、文件、加密数据库或云同步切换时不重写核心编排。

Alternative considered: 继续把 IndexedDB 作为唯一 source of truth。这样最简单，但会把记忆绑死在单个浏览器 profile。

### Decision: Lightweight local pairing is enough for MVP

MVP 不做账号体系，但 localhost gateway 必须只监听 `127.0.0.1`，使用本地生成的 token/pairing key，并限制 CORS 到扩展 origin。Diagnostics 可以显示 token 是否配置，但不得泄露 token 值。

Rationale: 这是最小可接受边界，能避免任意网页或本机程序随意读写个人学习记忆，同时不引入重型账号系统。

Alternative considered: 完全无 token。这样开发快，但任何可访问 localhost 端口的上下文都可能尝试读写记忆。

### Decision: Diagnostics are read-only observability

系统暴露 provider mode、provider health、capabilities、permission status、pairing status、last decision、suppression reasons、last Agent result 和 memory repository status。Diagnostics 只用于 debug/popup/options，不参与核心解释策略决策。

Rationale: 观测状态应该帮助排障，而不是让 UI 状态反向改变解释策略。

Alternative considered: popup 根据 diagnostics 直接改变策略。这样容易产生隐藏副作用，导致同一页面在不同 UI 打开状态下行为不同。

## Risks / Trade-offs

- Localhost service 未启动 -> background 返回结构化 unavailable，proactive overlay 保持静默，debug 状态显示 local gateway unreachable。
- Pairing token 遗失或不匹配 -> 引导重新配对，不回退到无鉴权 localhost 调用。
- 本机 memory repository 损坏或迁移失败 -> 保留浏览器缓存/导出作为恢复来源，迁移必须可重试。
- 本机服务增加安装复杂度 -> MVP 允许 `off` 模式和 browser fallback，文档中明确 local service 是增强路径。
- Provider health 频繁检查影响性能 -> 使用 TTL 缓存 health 结果，并允许用户显式刷新。
- 跨浏览器共享记忆可能混合不同扩展版本数据 -> repository API 必须带 schemaVersion，迁移逻辑集中在 repository 层。

## Migration Plan

1. 定义 provider mode、Agent request/response、health/capability 和 diagnostics contracts。
2. 新增 localhost gateway client，并将 background 的 provider 调用切换到 provider registry。
3. 引入 memory repository 接口和 browser/local gateway adapters。
4. 将 learning memory/profile/explanation version 的读写从具体 storage 调用迁移到 repository 接口。
5. 增加本机 service unavailable、token missing、capability unsupported 的结构化错误。
6. 增加 debug/popup/options 可读取的 diagnostics snapshot。
7. 保留 IndexedDB 迁移和 fallback；如 local provider 不可用，系统不得生成本地知识解释。

Rollback: 将 provider mode 设置为 `off` 或回退到 browser repository fallback，overlay 保持静默而不是使用 fixture 解释。

## Open Questions

- MVP localhost gateway 的默认端口是否固定，还是从 options/pairing 流程中发现？
- 本机 service 是否由本项目提供最小 Node.js 服务，还是先只定义协议并用测试 stub 验证？
- 跨浏览器 memory repository 的第一版是否使用 SQLite，还是先用 JSON 文件/内存存储降低实现成本？
- popup/options 的具体 UI 是否在本 change 实现，还是只暴露 diagnostics API 与测试？
