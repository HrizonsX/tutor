## Context

当前 Browser Cognitive Overlay 已经围绕技术阅读建立了五个能力边界：reading-context、confusion-inference、concept-understanding、learning-memory 和 cognitive-overlay。它能观察当前阅读片段，结合行为信号和学习记忆，在低打扰 overlay 中给出短解释。

新的需求把“知识”从技术概念扩展为网页阅读中的泛知识对象。用户可能在历史典故、天文地理、科技圈名词、小说电影、组织人物、理论事件或文化梗上卡住。系统需要识别这些语义关键对象，结合用户过往反馈形成可解释的阅读画像，再决定是否解释、解释什么以及用什么方式解释。

这个设计的关键约束是：agent 是后台整理者和检索者，不是浏览器操作者；大模型负责生成短解释文本，不负责最终决定是否打扰用户。

## Goals / Non-Goals

**Goals:**

- 识别当前网页语义中关键的泛知识对象，而不只识别技术术语。
- 维护用户遇到、解释过、反馈过、重新生成过的知识对象事件记忆。
- 用 agent 整理知识对象别名、相关对象、卡壳证据和解释历史，并保留证据和不确定性。
- 建立可解释、可清除的用户阅读画像，让反馈影响未来信号选择、解释优先级、解释风格和静默策略。
- 接入 LLM 生成短、准、贴当前上下文的解释，并支持基于用户反馈重新生成解释。
- 在稳定知识和事实敏感知识之间分流，避免对近期、易变、争议或事实敏感对象过度自信。
- 保持低打扰 overlay，不把产品变成百科弹窗、聊天侧边栏或自动浏览器 agent。

**Non-Goals:**

- 不自动解释页面中所有新名词。
- 不把用户反馈直接固化为永久掌握、永久不懂或人格标签。
- 不由 LLM 独自决定是否显示解释。
- 不让 agent 点击、跳转、搜索网页、填写表单或操作页面。
- 不存储整篇网页正文作为长期记忆。
- 不在第一版实现完整外部知识库、全网检索或复杂事实审校系统；只预留事实敏感分流和来源校验接口。

## Decisions

### Decision: 使用 knowledge object 作为泛知识统一数据模型

系统应把人物、地点、组织、作品、历史事件、理论、文化典故、科技名词和其他语义关键对象归一为 `knowledge object`。每个对象至少包含 canonical name、aliases、type、first seen、recently seen、previously explained、feedback events、related objects 和 evidence。

Rationale: “技术概念”无法覆盖真实网页阅读。统一对象模型可以让历史典故、电影角色、地理名词和 AI 术语走同一条记忆与解释管线。

Alternative considered: 为不同领域分别建立独立管线。这个方案会造成重复策略和重复 UI，也很难让用户反馈跨领域影响解释偏好。

### Decision: Agent 负责整理和检索，策略层负责是否干预

Knowledge agent 应整理候选对象、别名、历史反馈、相关对象和用户画像，输出带证据的 retrieval packet。Intervention policy 使用该 packet 决定是否解释和解释哪个对象。

Rationale: 如果让 agent 或 LLM 直接决定是否打扰，系统容易变成“看到新词就解释”的百科插件。策略层保留最终判断，可以继续维持低打扰原则。

Alternative considered: LLM 直接读取页面片段并决定解释内容。这个方案实现快，但难以测试、难以解释，也难以可靠应用用户反馈。

### Decision: LLM Composer 只负责表达，不负责最终决策

短解释生成应接收结构化输入：target object、knowledge type、当前最小上下文、用户记忆摘要、画像偏好、解释目标、事实敏感标记和上一版解释。模型输出必须短、贴上下文，并返回解释版本元数据。

Rationale: 大模型适合把知识讲清楚，但不适合单独承担触发策略、事实校验和用户画像更新。

Alternative considered: 用本地静态词典生成解释。这个方案无法覆盖泛知识范围，也无法根据上下文和用户反馈改写解释。

### Decision: 用户反馈同时更新对象记忆和阅读画像

Overlay 反馈必须产生结构化事件，例如 `marked_known`、`marked_confusing`、`marked_wrong`、`requested_regeneration`、`requested_simpler`、`requested_more_context`、`muted_object` 和 `muted_category`。这些事件同时影响 object-level memory 和 profile-level preferences。

Rationale: 用户反馈只有进入未来行为才有价值。对象层记忆决定下次是否重复解释同一个知识点；画像层偏好决定未来更关注哪些类别、采用哪种解释方式、降低哪些提示。

Alternative considered: 只把反馈当日志。这个方案不会改善未来行为，用户会感觉系统不长记性。

### Decision: 阅读画像必须可解释、可清除、非人格化

Profile 不应保存“用户聪明/不懂历史”这类笼统标签，而应保存具体、可解释的信号：关注领域、静默类别、解释风格偏好、低干预偏好、常卡对象族、熟悉对象族和近期反馈证据。

Rationale: 可解释画像能让用户理解和控制系统行为，也降低隐私和误判风险。

Alternative considered: 建立黑盒个性化分数。这个方案可能短期效果更强，但很难调试，也不利于用户信任。

### Decision: 重新生成解释是第一等反馈事件

“换个说法”按钮必须携带上一版解释、目标对象、用户反馈、偏好画像和目标改写风格。重新生成后的接受、展开、关闭或继续改写，都应继续记录。

Rationale: 用户反复重新生成说明当前解释方式不合适。它既是内容请求，也是画像学习信号。

Alternative considered: 简单重新调用模型生成随机替代文本。这个方案无法学习用户偏好，也容易重复失败。

### Decision: 按事实敏感度分流解释

系统应区分稳定知识和事实敏感知识。历史典故、基础科学、经典作品等稳定知识可以由 LLM 保守短解释；近期事件、当代人物动态、公司变化、争议观点或高风险事实必须进入来源校验或保守降级路径。

Rationale: 泛知识覆盖面广，模型幻觉风险不均匀。事实敏感分流能在不拖慢全部解释的情况下控制风险。

Alternative considered: 所有解释都走外部检索。这个方案更稳但成本高、延迟高，也不适合低打扰微解释。

## Risks / Trade-offs

- 解释过多导致打扰 -> 继续要求语义关键性和行为/记忆/画像信号共同支撑，默认偏安静。
- 用户画像误学偏好 -> 将反馈作为可撤销证据，不写入永久人格标签，并提供清除、静默和反向反馈。
- 大模型事实错误 -> 对事实敏感对象分流，保守措辞，必要时要求来源校验或不显示解释。
- 记忆污染 -> 底层仍保存事件流，agent 整理结果必须带证据和不确定性，不能从单次反馈得出确定结论。
- UI 变重 -> 第一版反馈控件保持克制，只露出常用操作，把更多操作放进轻量菜单。
- 延迟上升 -> 先用本地记忆和策略筛选候选对象，只对最终解释对象调用 LLM。
- 隐私暴露 -> 长期记忆只保存对象、事件、偏好信号和最小上下文元数据，不保存完整网页正文。

## Migration Plan

1. 扩展数据契约：新增 knowledge object、feedback event、reading profile、retrieval packet 和 explanation version。
2. 在现有 concept-understanding 和 learning-memory 之上增加泛知识对象识别与 agentic retrieval，不移除现有技术概念路径。
3. 在 overlay 中先加入最小反馈控件和重新生成按钮，所有反馈先记录为事件。
4. 将画像信号接入干预策略，逐步影响解释优先级和风格。
5. 接入 LLM composer，并将事实敏感对象先走保守降级路径。
6. Rollback 可以关闭 agentic knowledge policy 和 LLM regeneration，保留已有事件数据用于检查。

## Open Questions

- 第一版是否需要提供显式“画像管理”面板，还是先只提供概念级和类别级静默控制？
- 事实敏感对象的来源校验第一版接入哪个服务，还是先只标记并降级为“需要来源”的状态？
- 用户反馈按钮第一版保留几个主操作：`懂了`、`没懂`、`换个说法`、`不准`、`别再提示` 是否足够？
- 画像信号的过期时间如何设定，避免长期偏好被早期少量反馈锁死？
