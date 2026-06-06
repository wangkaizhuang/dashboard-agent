# 对话上下文分界 + 会话分叉 — 设计文档

> 日期：2026-06-07 | 状态：待实现 | 作者：Kevin + Claude

## 一、背景与问题

当前多轮对话的行为（`pipeline.ts`）：在一个已完成的会话里再发消息，会把**整段对话历史**作为上下文喂给生成。问题：当新需求与当前看板**无关**（例如在"销售看板"会话里发"做个物流看板"）时，旧上下文会**污染**新生成。

目标：引入「上下文分界」与「会话分叉」两个机制，让用户能在同一会话里干净地切换主题，或从任意节点分叉出新会话，而**界面始终展示完整历史**、**喂给模型的上下文按分界裁剪**。

## 二、核心概念

- **会话节点（node）**：一轮对话（一条用户消息 + 其后的助手输出）。**以对话轮次为单位，不以"看板"为单位**——不是每轮都产出看板（可能是澄清、微调、提问）。
- **上下文分界点（context boundary）**：标记在某条用户消息上的标志。表示"从这条消息起，开启新的上下文段落"。
- **有效上下文**：喂给模型的内容 = **最近一个分界点之后 → 当前节点**（不是整段历史）。
- **显示 ≠ 上下文**：界面**永远展示完整历史**；只有"喂给模型的上下文"按分界裁剪。

### 示例
```
会话A: [做销售看板]→看板1 ┊ [改配色]→看板2 ┊ ⚡[做物流看板](判无关→选"重新生成")→看板3 ┊ [加预警]→看板4
```
- 生成看板3：上下文不含销售/配色（分界点 ⚡ 在此）。
- 生成看板4：上下文 = ⚡之后（看板3 + 加预警）。
- 界面 A 始终显示看板1–4 全部历史。
- 在看板4 下方点分叉 → 新会话 B，带 ⚡之后到看板4 的有效上下文（看板3 + 看板4），界面显示完整复制过来的历史。

## 三、数据模型

复用 `Message.metadata`（Prisma `Json?`，**无需迁移**）：

- **分界标记**：用户消息 `metadata.contextBoundary = true` —— 该消息开启一个新上下文段落。
- **意图决策（瞬态）**：检测到无关时，写在触发消息上 `metadata.intentDecision = 'pending' | 'continue' | 'regenerate'`，供 pipeline 轮询。决策完成后 `pending` → 终态。

会话分叉复制 `Message`、当前 `Template`、已完成的 `PipelineStep` 到新 `Session`（见机制2）。

## 四、上下文裁剪（贯穿规则）

`pipeline.ts` 在 `buildCompressedContext` 之前新增裁剪：

```
取 messages（按时间升序）
找最后一个 metadata.contextBoundary === true 的消息下标 i
effectiveMessages = i 存在 ? messages.slice(i) : messages
buildCompressedContext(effectiveMessages, ...)
```

`previousOutputs`（步骤复用）同理：仅当当前段落内有已完成步骤时复用；跨分界不复用旧步骤输出。**显示与 DB 不删除任何历史。**

## 五、机制 1：无关检测 + 选项卡

仿"专家问答"的等待模式（`analyzeGaps` / `waitForExpertAnswers`）。

**触发条件**：会话已有 Template，且当前段落（最近分界点之后）已有 ≥1 轮历史（即这是带上下文的跟进）。首条消息或紧跟分界点的消息不触发。

**流程**：
1. `pipeline.ts` 开头：一次轻量 LLM 调用判定相关性。输入 = 当前段落的需求摘要（取段落内 `REQUIREMENTS_ANALYSIS` 的 summary，或最近用户消息）+ 新消息。输出 `{ related: boolean, reason: string }`。
2. `related === true` → 照常生成。
3. `related === false` → 发 SSE `intent_choice` 事件（含 messageId、reason）；将触发消息 `metadata.intentDecision='pending'`；进入 `waitForIntentChoice(messageId)`（轮询该消息 metadata，超时默认 `continue`）。
4. 前端收到 `intent_choice` → 渲染**选择卡**（仿 `ExpertQuestionCard`）：「检测到本次需求与当前看板关系不大」+ 两个按钮：「基于现有继续」/「重新生成（忽略旧上下文）」。
5. 用户点选 → `POST /api/sessions/[id]/intent { messageId, choice }`：
   - `continue` → 仅写 `intentDecision='continue'`。
   - `regenerate` → 写 `intentDecision='regenerate'` **且** `contextBoundary=true`。
6. pipeline 轮询到决策 → 继续：`regenerate` 时本轮起按新分界裁剪上下文。

**高精度优先**：提示词要求"只有明显跑题/换主题才判 false"，避免正常细化被误拦。误判兜底：选择卡是非破坏性的，选"继续"即恢复原行为。

## 六、机制 2：会话分叉

**入口**：每轮助手结果下方一个**分叉图标**（在 `MessageItem` 的助手输出/模板卡附近）。

**端点**：`POST /api/sessions/[id]/fork { fromMessageId }`
1. 读取源会话 `createdAt <= fromMessage.createdAt` 的全部 `Message`（含 metadata 的分界标记）。
2. 新建 `Session`（mode 继承）。
3. 复制这些 Message 到新会话（保留 `contextBoundary` 等 metadata，时间顺序不变）。
4. 复制"截止该节点时有效的" `Template` 与已完成 `PipelineStep` 到新会话（使分叉会话可继续编辑同一看板）。
5. **生成新会话标题**：对**有效上下文**（最近分界点之后 → fromMessage）做一次轻量 LLM 主题总结，作为新会话 `title`（失败兜底用源标题 + "（分叉）"）。
6. 返回新 sessionId，前端 `router.push` 跳转。

**结果**：新会话界面显示复制过来的完整历史；继续对话时上下文按"最近分界点之后"自然裁剪（标记已带过来）。

## 七、新增 SSE 事件与接口

- SSE：新增 `intent_choice`（字段：`messageId`、`reason`）。
- API：
  - `POST /api/sessions/[id]/intent` —— 提交意图选择。
  - `POST /api/sessions/[id]/fork` —— 分叉。
- Prompts：`intent-detection`（相关性判定）、`fork-title`（主题总结）。
- 组件：`IntentChoiceCard`（选择卡，仿 ExpertQuestionCard）；`MessageItem` 助手输出下方加分叉图标按钮。

## 八、边界与异常

- **超时/断连**：意图选择无响应（超时）→ 默认 `continue`，不卡流程。
- **误判**：选择卡可选"继续"，零破坏。
- **分叉源是很早的节点**：仍复制其有效上下文；若该节点尚无 Template，则分叉会话无看板、可继续生成。
- **分叉标题总结失败**：兜底用源标题派生。
- **裁剪不影响显示/删除**：DB 与界面历史完整保留。
- **EXPERT 模式**：意图检测在专家澄清之前；二者独立，不叠加弹卡。

## 九、测试

- 单元：上下文裁剪函数（有/无分界点、多分界点取最后一个）；相关性判定 JSON 解析兜底；fork 复制范围（按 createdAt 截断 + 保留分界标记）。
- 真机验收（subagent）：无关消息→弹选择卡→选"重新生成"→新看板不含旧上下文；分叉图标→新会话带历史+主题标题+上下文裁剪正确。

## 十、不做（YAGNI）

- 不做任意"回到中间节点改写历史/编辑分支树"的复杂版本控制，只做"从节点向前分叉新会话"。
- 不做分界点的手动增删 UI（分界仅由"无关→重新生成"产生）。
