## 1. 数据契约与配置

- [x] 1.1 扩展共享 contracts，新增 knowledge object、knowledge type、feedback event、reading profile、retrieval packet、explanation version 和 fact-sensitivity 相关类型。
- [x] 1.2 扩展默认配置，加入知识对象候选数量、画像信号权重、解释重新生成限制、事实敏感降级和反馈冷却时间。
- [x] 1.3 更新隐私清洗逻辑，确保 encounter、feedback、profile 和 explanation version 只保存最小上下文元数据。
- [x] 1.4 为新增契约添加单元测试，覆盖必要字段、默认值和隐私裁剪边界。

## 2. 泛知识对象识别

- [x] 2.1 扩展 concept-understanding 流程，使其能识别人物、地点、组织、作品、历史事件、理论、文化典故、科技名词和其他语义关键对象。
- [x] 2.2 实现 knowledge object 归一化和别名保留，支持不确定别名证据而不强行合并。
- [x] 2.3 在候选排序中加入当前网页语义关键性，降低路过式命名实体的优先级。
- [x] 2.4 添加测试覆盖非技术对象识别、短语级精确提取、上下文特殊含义和路过对象降权。

## 3. Agentic 知识记忆与检索

- [x] 3.1 扩展 LearningMemory 或新增 knowledge memory 模块，记录 first seen、recently seen、prior explanations、feedback events、related objects 和 evidence。
- [x] 3.2 实现 agentic memory curator，整理别名、相关对象、卡壳证据、解释历史和不确定摘要。
- [x] 3.3 实现 retrieval packet 生成，解释前返回对象身份、历史解释、用户反馈、画像提示、相关对象、冷却状态和不确定性。
- [x] 3.4 确保 agent 生成的关系和偏好摘要必须带 source event ids、时间戳和 uncertainty。
- [x] 3.5 添加测试覆盖首次遇到、重复遇到、已解释对象、相关对象桥接和 agent 摘要证据链。

## 4. 用户阅读画像

- [x] 4.1 实现 user-reading-profile 模块，维护类别兴趣、静默类别、解释风格偏好、干预偏好、熟悉对象和易卡对象信号。
- [x] 4.2 将 `marked_known`、`marked_confusing`、`marked_wrong`、`requested_regeneration`、`requested_simpler`、`requested_more_context`、`muted_object` 和 `muted_category` 转换为画像证据。
- [x] 4.3 支持清除对象级偏好、清除类别级偏好和撤销静默设置。
- [x] 4.4 确保画像不保存笼统人格标签，所有偏好都能追溯到具体事件。
- [x] 4.5 添加测试覆盖类别兴趣学习、静默策略、风格偏好学习、偏好清除和不从单次反馈得出确定结论。

## 5. 干预策略与信号选择

- [x] 5.1 将阅读画像、显式反馈、重新生成行为和知识类别偏好接入 intervention priority 计算。
- [x] 5.2 保持现有低打扰约束：画像兴趣不能在缺少当前语义关键性时单独触发解释。
- [x] 5.3 对已标记知道、已静默对象、已静默类别和最近错误解释对象降低或抑制优先级。
- [x] 5.4 对反复没懂、反复重新生成后接受特定风格、相关易卡对象提高支持程度或调整解释风格。
- [x] 5.5 添加测试覆盖画像升权、静默降权、语义关键性约束、错误解释谨慎策略和风格偏好影响。

## 6. LLM 短解释与重新生成

- [x] 6.1 新增 short-explanation-composer 模块，接收结构化 retrieval packet，而不是整页自由文本。
- [x] 6.2 实现初始短解释生成，限制长度、避免不必要新术语，并解释对象在当前上下文中的作用。
- [x] 6.3 实现重新生成解释，输入上一版解释、反馈事件、目标改写风格、画像提示和当前上下文。
- [x] 6.4 记录 explanation version，并将 regenerated version 链接到 previous version 和 feedback event。
- [x] 6.5 添加测试覆盖 composer 输入结构、短解释约束、简单化改写、背景改写、版本链接和 LLM 不拥有干预决策。

## 7. 事实敏感分流

- [x] 7.1 实现 fact-sensitivity 分类，区分稳定知识和近期、易变、争议、当前人物或公司状态等事实敏感对象。
- [x] 7.2 为事实敏感对象实现来源校验接口或保守降级路径。
- [x] 7.3 在无法校验时避免显示具体事实性解释，或仅显示非具体背景解释。
- [x] 7.4 添加测试覆盖稳定知识直出、近期对象要求校验、校验不可用时降级和用户标记不准后的谨慎策略。

## 8. Overlay 反馈 UI

- [x] 8.1 在解释卡片中增加紧凑反馈控件：懂了、没懂、换个说法、不准、别再提示。
- [x] 8.2 实现对象级静默和类别级静默入口，并保证静默设置可撤销。
- [x] 8.3 实现重新生成按钮的 loading、成功、失败和保留原解释状态。
- [x] 8.4 将所有反馈控件连接到结构化 memory event、reading profile update 和 explanation version tracking。
- [x] 8.5 添加 UI 测试覆盖反馈事件记录、重新生成替换、失败非阻塞、静默行为和低打扰布局。

## 9. 端到端场景与回归

- [x] 9.1 添加端到端场景：用户首次遇到历史典故并有卡壳信号时触发短解释。
- [x] 9.2 添加端到端场景：用户标记某对象懂了后，近期再次出现时降低提示。
- [x] 9.3 添加端到端场景：用户多次请求换个说法后接受类比解释，后续相似对象优先采用类比风格。
- [x] 9.4 添加端到端场景：用户静默电影角色类别后，后续影视角色不再主动提示。
- [x] 9.5 添加端到端场景：事实敏感科技圈名词在缺少来源校验时走保守降级。
- [x] 9.6 运行现有测试套件，确认原有技术概念解释、记忆污染保护、冷却策略和 overlay 行为没有回归。
