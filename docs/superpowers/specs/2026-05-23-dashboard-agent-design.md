# Dashboard Agent — 设计规划文档

> 版本：v1.0 | 日期：2026-05-23 | 状态：待实现

---

## 一、项目概述

**Dashboard Agent** 是一个基于对话的仪表板模板生成工具。用户通过自然语言描述需求，Agent 自动完成需求分析、思路拆解、组件规划、数据 Mock、HTML 模板生成，最终输出一份可直接使用的精美仪表板 HTML 文件。

### 核心特性

| 特性 | 说明 |
|------|------|
| 三种生成模式 | Quick（快速）/ Think（深思）/ Expert（专家互动） |
| 五步流水线 | 需求分析 → 思路拆解 → 布局规划 → Mock 数据 → 模板生成 |
| 打字机流式输出 | 每个步骤实时流式展示 AI 推理过程 |
| 上下文压缩 | 超出阈值自动智能压缩，默认 128k tokens |
| 质量评分 | 每步自动评分，低于阈值自动中止并引导补充 |
| 多轮对话 | React 范式推理，保持完整对话上下文 |

---

## 二、技术栈

### 前端
- **Next.js 14+**（App Router）
- **TypeScript**
- **Tailwind CSS** + **shadcn/ui**（UI 组件库）
- **Zustand**（客户端状态管理）
- **Vercel AI SDK**（`useChat`、`streamText`，支持 OpenAI-compatible endpoint）
- **ECharts**（图表渲染，在生成的 HTML 模板中引用 CDN）
- **Framer Motion**（动画，折叠/展开过渡）

### 后端
- **Next.js App Router Route Handlers**（API 层）
- **Prisma ORM**（数据库操作）
- **MySQL 8.0**（持久化存储）
- **OpenAI SDK**（直接调用 packyapi 代理，绕过 AI SDK 做复杂编排）

### 部署
- **Docker + Docker Compose**
- **MySQL** 容器（持久化 volume）
- **Node.js 20** Alpine 镜像

### 环境变量（写入 `.env.local`，不进入代码库）
```
OPENAI_API_KEY=<your-key>
OPENAI_BASE_URL=https://www.packyapi.com/v1
OPENAI_MODEL=gpt-5.4-mini
DATABASE_URL=mysql://root:123456789@db:3306/agent-explore
CONTEXT_MAX_TOKENS=128000
QUALITY_SCORE_THRESHOLD=30
```

---

## 三、数据库设计（Prisma Schema）

```prisma
model Session {
  id          String    @id @default(cuid())
  title       String    @default("新对话")
  mode        Mode      @default(QUICK)
  status      SessionStatus @default(ACTIVE)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  messages    Message[]
  steps       PipelineStep[]
  template    Template?
}

model Message {
  id        String      @id @default(cuid())
  sessionId String
  role      MessageRole
  content   String      @db.LongText
  type      MessageType @default(TEXT)
  metadata  Json?
  createdAt DateTime    @default(now())
  session   Session     @relation(fields: [sessionId], references: [id], onDelete: Cascade)
}

model PipelineStep {
  id        String     @id @default(cuid())
  sessionId String
  stepIndex Int
  stepName  StepName
  status    StepStatus @default(PENDING)
  content   String     @db.LongText
  score     Int?
  reasoning String?    @db.LongText  // Think 模式推理过程
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  session   Session    @relation(fields: [sessionId], references: [id], onDelete: Cascade)
}

model Template {
  id          String   @id @default(cuid())
  sessionId   String   @unique
  htmlContent String   @db.LongText
  score       Int
  components  Json
  createdAt   DateTime @default(now())
  session     Session  @relation(fields: [sessionId], references: [id])
}

model ExpertQuestion {
  id         String   @id @default(cuid())
  sessionId  String
  stepIndex  Int
  question   String
  options    Json     // [{label, value}]
  answer     String?  // 用户选择的答案
  customText String?  // "其他" 选项的自定义输入
  createdAt  DateTime @default(now())
}

enum Mode         { QUICK THINK EXPERT }
enum SessionStatus { ACTIVE PAUSED COMPLETED FAILED }
enum MessageRole  { USER ASSISTANT SYSTEM }
enum MessageType  { TEXT TEMPLATE_CARD EXPERT_QUESTION SCORE_REPORT }
enum StepStatus   { PENDING RUNNING COMPLETED FAILED SKIPPED }
enum StepName     {
  REQUIREMENTS_ANALYSIS
  THOUGHT_BREAKDOWN
  LAYOUT_PLANNING
  MOCK_DATA
  TEMPLATE_GENERATION
}
```

---

## 四、UI 布局设计

### 三栏结构总览

```
┌──────────────┬─────────────────────────┬──────────────────────────┐
│  左侧边栏     │      中间聊天区           │      右侧进度面板          │
│  240px 固定  │      flex-1              │      380px 固定           │
│              │                          │                          │
│ ┌──────────┐ │  ┌─────────────────┐    │  ┌────────────────────┐  │
│ │ + 新对话  │ │  │ 用户消息气泡      │    │  │ ▼ Step 1: 需求分析  │  │
│ └──────────┘ │  └─────────────────┘    │  │   [进行中/展开]      │  │
│              │                          │  │   流式内容...        │  │
│ 今天          │  ┌─────────────────┐    │  │   评分: 85/100      │  │
│ ● 电商仪表板   │  │ AI 回复（打字机）  │    │  └────────────────────┘  │
│ ● 销售分析    │  └─────────────────┘    │                          │
│              │                          │  ┌────────────────────┐  │
│ 昨天          │  ┌─────────────────┐    │  │ ▶ Step 2: 思路拆解  │  │
│   数据报表    │  │  [模板预览卡片]   │    │  │   [已完成/折叠]      │  │
│   运营看板    │  │  预览 | 全屏     │    │  └────────────────────┘  │
│              │  └─────────────────┘    │                          │
│              │                          │  ┌────────────────────┐  │
│              │  ┌─────────────────┐    │  │ ○ Step 3: 布局规划  │  │
│              │  │ [输入框]  [发送]  │    │  │   [待开始]           │  │
│              │  └─────────────────┘    │  └────────────────────┘  │
└──────────────┴─────────────────────────┴──────────────────────────┘
```

### 左侧边栏

- 顶部固定：`+ 新对话` 按钮 + 模式选择（Quick / Think / Expert）
- 会话列表：按日期分组（今天 / 昨天 / 更早）
- 每条会话：标题（AI 自动生成）+ 状态图标 + 时间
- 激活会话高亮，右键 / 悬停显示删除选项
- 底部：设置入口（打开配置面板抽屉）

### 中间聊天区

**消息类型：**

1. **普通文本消息**：用户右对齐，AI 左对齐，AI 消息有打字机效果
2. **模板预览卡片**（`MessageType.TEMPLATE_CARD`）：
   ```
   ┌─────────────────────────────────────┐
   │  🎨 仪表板模板已生成                   │
   │  ─────────────────────────────────  │
   │  [缩略图预览区 160px 高]               │
   │  综合评分：92/100  组件：8个           │
   │  [👁 预览]  [⛶ 全屏]  [⬇ 下载 HTML] │
   └─────────────────────────────────────┘
   ```
   点击预览/全屏后，右侧面板切换显示 HTML iframe

3. **专家模式问题卡片**（`MessageType.EXPERT_QUESTION`）：
   ```
   ┌─────────────────────────────────────┐
   │  💡 发现以下信息需要补充：              │
   │  您希望图表的更新频率是？               │
   │  ○ 实时（每秒）                       │
   │  ○ 准实时（每分钟）                    │
   │  ○ 静态数据（无需刷新）                │
   │  ● 其他: [________________]          │
   │                    [确认提交]         │
   └─────────────────────────────────────┘
   ```

4. **评分报告卡**（`MessageType.SCORE_REPORT`）：当某步骤低于阈值时显示问题列表

### 右侧进度面板

**进度步骤卡片状态：**
- `PENDING`：灰色圆圈 + 步骤名，不可展开
- `RUNNING`：蓝色脉冲动画 + 展开，内容流式写入
- `COMPLETED`：绿色勾 + 可展开/折叠 + 评分徽章 + 完成时间
- `FAILED`：红色叉 + 展开显示问题

**进度卡片内容（展开时）：**

Quick 模式：关键结论文本  
Think 模式：折叠的「推理过程」区 + 结论（类似 DeepSeek R1 的 `<thinking>` 块）  
Expert 模式：缺口分析列表 + 「已补充 N 项」徽章

**右侧面板双视图切换：**
- 默认：进度看板视图
- 模板生成后：可切换到「模板预览」视图（HTML iframe 全高展示）
- 支持全屏按钮（将 iframe 展开至全屏覆盖整个应用）

---

## 五、三种生成模式详解

### 5.1 Quick 模式（默认）

五步流水线，每步直接执行，结果流式输出到右侧进度面板。步骤完成后自动折叠，展开下一步。

```
用户发送需求
    ↓
Step 1: 需求分析（~500 tokens）
    ↓ 评分 ≥ 阈值
Step 2: 思路拆解（~800 tokens）
    ↓ 评分 ≥ 阈值
Step 3: 布局规划 + 组件列表（~600 tokens）
    ↓ 评分 ≥ 阈值
Step 4: Mock 数据生成（~1000 tokens）
    ↓ 评分 ≥ 阈值
Step 5: HTML 模板生成（~5000+ tokens）
    ↓
输出模板卡片到聊天区
```

### 5.2 Think 模式

每步执行前先输出推理过程（类似 `<thinking>` 块），右侧进度面板中显示可折叠的推理区域，推理完成后输出结论。

```
用户发送需求
    ↓
Step N: [展开推理区，流式输出推理过程]
         ── 推理区分隔线 ──
        [输出结论]
        [评分]
    ↓ 继续下一步
```

Think 模式的每步 prompt 会附加：
```
请先在 <thinking></thinking> 标签中进行深度推理，分析所有可能性和边界情况，
然后在标签外输出最终结论。
```

### 5.3 Expert 模式

在每步执行前，先运行一个「缺口分析」子步骤，识别当前信息的模糊点和遗漏项，生成多选题卡片推送给用户。用户回答后，将答案注入上下文，再执行该步骤。

```
用户发送需求
    ↓
[缺口分析 Step 1]: 识别遗漏/模糊点
    ↓ 有问题
生成专家问题卡片（推送到聊天区）
    ↓ 用户回答
注入答案到上下文
    ↓
Step 1: 需求分析（基于补充后的完整上下文）
    ↓
[缺口分析 Step 2]: 识别遗漏/模糊点
    ... 以此类推
```

**专家问题生成规则：**
- 每次最多 3 个问题，避免信息疲劳
- 选项数量：2～4 个 + 「其他（可自定义）」
- 问题类型：单选为主，复杂场景允许多选
- 如无缺口，跳过问题直接执行该步骤

---

## 六、AI Pipeline 实现

### 6.1 Prompt 体系

每步骤有独立的系统 prompt，共用一套基础上下文构建函数：

```typescript
function buildContext(session: Session, messages: Message[]): string {
  const compressedHistory = compressContext(messages)
  const completedSteps = session.steps.filter(s => s.status === 'COMPLETED')
  return `
## 会话历史
${compressedHistory}

## 已完成步骤摘要
${completedSteps.map(s => `### ${s.stepName}\n${s.content}`).join('\n\n')}
  `
}
```

**各步骤 Prompt 要点：**

| 步骤 | 输出格式 | 评分维度 |
|------|---------|---------|
| 需求分析 | JSON：目标用户、核心指标、数据维度、风格偏好 | 需求完整度、歧义率 |
| 思路拆解 | Markdown：模块划分、数据关系、用户路径 | 逻辑合理性、覆盖度 |
| 布局规划 | JSON：区域列表、组件类型、尺寸比例 | 布局合理性、组件匹配度 |
| Mock 数据 | JSON：每个组件对应的示例数据 | 数据真实性、完整性 |
| 模板生成 | HTML 完整文件（含内联 CSS + JS） | 视觉质量、功能完整度 |

### 6.2 评分机制

每步完成后，使用独立的评分调用：

```typescript
async function scoreStep(stepName: string, content: string, requirements: string): Promise<number> {
  const result = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL,
    messages: [{
      role: 'system',
      content: `你是一个专业评审员。根据原始需求，对以下${stepName}输出打分（0-100分）。
      
评分标准：
- 0-30: 严重缺陷，无法继续
- 31-60: 基本可用，存在明显问题  
- 61-85: 良好，小问题可接受
- 86-100: 优秀

只输出 JSON：{"score": <数字>, "issues": ["问题1", "问题2"]}`
    }, {
      role: 'user',
      content: `原始需求：${requirements}\n\n步骤输出：${content}`
    }],
    response_format: { type: 'json_object' }
  })
  return JSON.parse(result.choices[0].message.content)
}
```

**阈值行为：**
- 评分 ≥ 阈值（默认 30）：继续下一步
- 评分 < 阈值：
  1. 当前步骤标记为 `FAILED`
  2. 会话状态改为 `PAUSED`
  3. 推送 `SCORE_REPORT` 消息到聊天区，列出具体问题
  4. 用户补充信息后，从该步骤重新执行（不重置已完成的步骤）

**续接判断逻辑：**

```typescript
function isResumingSession(session: Session, newMessage: string): boolean {
  const hasPausedStep = session.steps.some(s => s.status === 'FAILED')
  const hasRecentUserMessage = session.messages.filter(m => m.role === 'USER').length > 1
  return hasPausedStep && hasRecentUserMessage
}
```

---

## 七、上下文压缩算法

### 7.1 Token 计数

使用 `tiktoken` 库估算 token 数：

```typescript
import { encoding_for_model } from 'tiktoken'

function estimateTokens(messages: Message[]): number {
  const enc = encoding_for_model('gpt-4o')
  return messages.reduce((sum, m) => {
    return sum + enc.encode(m.content).length + 4
  }, 0)
}
```

### 7.2 压缩策略（滑动窗口 + AI 摘要）

```typescript
async function compressContext(messages: Message[], maxTokens: number): Promise<Message[]> {
  const totalTokens = estimateTokens(messages)
  
  if (totalTokens <= maxTokens) return messages
  
  // 始终保留最近 10 条消息（约保留 20% 上下文）
  const recentMessages = messages.slice(-10)
  const olderMessages = messages.slice(0, -10)
  
  // 对较早的消息进行 AI 摘要
  const summary = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL,
    messages: [{
      role: 'system',
      content: '将以下对话历史压缩为一段摘要，保留所有关键决策、用户偏好和重要信息。'
    }, {
      role: 'user',
      content: olderMessages.map(m => `${m.role}: ${m.content}`).join('\n')
    }]
  })
  
  const summaryMessage: Message = {
    role: 'SYSTEM',
    content: `[对话摘要]\n${summary.choices[0].message.content}`,
    type: 'TEXT'
  }
  
  return [summaryMessage, ...recentMessages]
}
```

### 7.3 配置项

| 配置项 | 默认值 | 范围 |
|--------|--------|------|
| `CONTEXT_MAX_TOKENS` | 128,000 | 8,000 ~ 200,000 |
| `CONTEXT_KEEP_RECENT` | 10 | 5 ~ 30（条消息） |

---

## 八、组件库（生成模板使用）

模板生成步骤的 prompt 中包含完整的组件示例代码，让 AI 直接参考生成。

### 8.1 组件清单

| 类别 | 组件名 | 实现方式 |
|------|--------|---------|
| 数据展示 | 指标卡（KPI Card） | 纯 HTML/CSS |
| 数据展示 | 统计数字（Counter） | 纯 HTML/CSS + 数字动画 JS |
| 图表 | 折线图 / 面积图 | ECharts CDN |
| 图表 | 柱状图 / 条形图 | ECharts CDN |
| 图表 | 饼图 / 环形图 | ECharts CDN |
| 图表 | 仪表盘（Gauge） | ECharts CDN |
| 图表 | 散点图 / 气泡图 | ECharts CDN |
| 导航 | 选项卡（Tabs） | 纯 HTML/CSS/JS |
| 布局 | 卡片容器（Card） | 纯 HTML/CSS |
| 布局 | 栅格布局（Grid） | CSS Grid |
| 文本 | 标题区（Header） | 纯 HTML/CSS |
| 文本 | 分隔线 | 纯 HTML/CSS |
| 列表 | 数据列表（List） | 纯 HTML/CSS |
| 列表 | 排行榜（Ranking） | 纯 HTML/CSS |
| 列表 | 时间线（Timeline） | 纯 HTML/CSS |
| 媒体 | 图片（Image） | HTML img + 占位符 |
| 媒体 | 轮播图（Carousel） | 纯 JS 轮播 |
| 状态 | 进度条（Progress） | 纯 HTML/CSS |
| 状态 | 徽章 / 标签（Badge） | 纯 HTML/CSS |
| 状态 | 告警横幅（Alert Banner） | 纯 HTML/CSS |
| 交互 | 日期选择器（Date Filter） | 纯 JS |
| 交互 | 下拉筛选（Dropdown Filter） | 纯 JS |
| 地图 | 地图占位（Map Placeholder） | 纯 HTML/CSS（可选引入高德地图 CDN） |

### 8.2 组件示例代码片段（写入 Template Generation Prompt）

每个组件提供一段可直接使用的 HTML 代码示例，AI 根据需求选择并组合。示例覆盖：
- 浅色主题 + 深色主题变体
- 响应式布局（基于 CSS Grid）
- 数据绑定方式（内联 JSON → JS 读取）

### 8.3 主题设计规范

生成的 HTML 模板遵循统一的设计规范：

```css
/* CSS 变量体系 */
:root {
  --color-primary: #4F46E5;    /* 主色调 */
  --color-success: #10B981;
  --color-warning: #F59E0B;
  --color-danger:  #EF4444;
  --color-bg:      #F8FAFC;
  --color-surface: #FFFFFF;
  --color-border:  #E2E8F0;
  --color-text-1:  #1E293B;
  --color-text-2:  #64748B;
  --radius-card:   12px;
  --shadow-card:   0 1px 3px rgba(0,0,0,.08), 0 4px 16px rgba(0,0,0,.04);
}
```

---

## 九、Route Handlers（API 设计）

```
GET  /api/sessions                    # 获取会话列表
POST /api/sessions                    # 创建新会话
GET  /api/sessions/[id]               # 获取会话详情
DELETE /api/sessions/[id]             # 删除会话

POST /api/sessions/[id]/messages      # 发送消息（触发流水线）
GET  /api/sessions/[id]/messages      # 获取消息历史

GET  /api/sessions/[id]/steps         # 获取流水线进度

GET  /api/templates/[id]              # 获取模板 HTML
GET  /api/templates/[id]/preview      # 模板预览（返回 HTML 文件）

POST /api/expert/[questionId]/answer  # 提交专家问题答案

GET  /api/config                      # 获取配置
PUT  /api/config                      # 更新配置
```

### 流式响应（SSE）

`POST /api/sessions/[id]/messages` 返回 SSE 流：

```typescript
// SSE 事件格式
data: {"type": "step_start", "stepIndex": 0, "stepName": "REQUIREMENTS_ANALYSIS"}
data: {"type": "step_content", "stepIndex": 0, "delta": "分析用户需求..."}
data: {"type": "step_thinking", "stepIndex": 0, "delta": "..."}  // Think 模式
data: {"type": "step_score", "stepIndex": 0, "score": 85}
data: {"type": "step_complete", "stepIndex": 0}
data: {"type": "step_failed", "stepIndex": 0, "issues": ["..."]}
data: {"type": "expert_question", "question": {...}}
data: {"type": "template_ready", "templateId": "xxx"}
data: {"type": "pipeline_complete"}
data: {"type": "pipeline_paused", "reason": "score_below_threshold"}
data: [DONE]
```

---

## 十、配置面板设计

抽屉式面板（从左侧边栏底部入口打开），包含以下可调配置：

```
┌─────────────────────────────────────┐
│  ⚙️ 系统配置                          │
│                                     │
│  模型设置                            │
│  ├ API Endpoint: [____________]     │
│  ├ Model Name:   [____________]     │
│  └ API Key:      [••••••••••••]     │
│                                     │
│  上下文设置                           │
│  ├ 最大 Token 数: [====|====] 128k  │
│  └ 保留最近消息数: [====|] 10 条     │
│                                     │
│  质量控制                            │
│  ├ 评分阈值:      [==|=====] 30 分  │
│  └ 低分行为: ○终止会话 ○仅警告       │
│                                     │
│  界面设置                            │
│  └ 主题: ○ 浅色 ○ 深色 ○ 跟随系统   │
│                                     │
│        [保存配置]  [恢复默认]         │
└─────────────────────────────────────┘
```

配置存储到 `localStorage`，服务端从环境变量读取（环境变量优先级高于前端配置）。

---

## 十一、Docker 部署配置

### 文件结构

```
agents-explore/
├── docker-compose.yml
├── Dockerfile
├── .env.local              # 本地开发（不进 git）
├── .env.example            # 示例配置（进 git）
└── src/
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    env_file:
      - .env.local
    environment:
      - DATABASE_URL=mysql://root:${MYSQL_ROOT_PASSWORD}@db:3306/${MYSQL_DATABASE}
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: ${MYSQL_DATABASE}
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      timeout: 20s
      retries: 10
    restart: unless-stopped

volumes:
  mysql_data:
```

### Dockerfile

```dockerfile
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
```

---

## 十二、目录结构

```
agents-explore/
├── src/
│   ├── app/
│   │   ├── layout.tsx                    # Root layout（全局字体、Providers）
│   │   ├── page.tsx                      # 重定向到 /chat/new
│   │   ├── chat/
│   │   │   └── [sessionId]/
│   │   │       └── page.tsx              # 主聊天页面
│   │   └── api/
│   │       ├── sessions/
│   │       │   ├── route.ts              # GET/POST sessions
│   │       │   └── [id]/
│   │       │       ├── route.ts          # GET/DELETE session
│   │       │       ├── messages/route.ts # POST 触发流水线（SSE）
│   │       │       └── steps/route.ts    # GET 进度
│   │       ├── templates/
│   │       │   └── [id]/
│   │       │       ├── route.ts          # GET template
│   │       │       └── preview/route.ts  # GET HTML preview
│   │       ├── expert/
│   │       │   └── [questionId]/
│   │       │       └── answer/route.ts   # POST answer
│   │       └── config/route.ts           # GET/PUT config
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx              # 三栏布局容器
│   │   │   ├── Sidebar.tsx               # 左侧边栏
│   │   │   ├── ChatPanel.tsx             # 中间聊天区
│   │   │   └── ProgressPanel.tsx         # 右侧进度面板
│   │   ├── chat/
│   │   │   ├── MessageList.tsx           # 消息列表
│   │   │   ├── MessageItem.tsx           # 单条消息（分类型渲染）
│   │   │   ├── TemplateCard.tsx          # 模板预览卡片
│   │   │   ├── ExpertQuestionCard.tsx    # 专家问题卡片
│   │   │   ├── ScoreReportCard.tsx       # 评分报告卡片
│   │   │   ├── ChatInput.tsx             # 输入框
│   │   │   └── TypewriterText.tsx        # 打字机效果组件
│   │   ├── progress/
│   │   │   ├── PipelineProgress.tsx      # 流水线整体进度
│   │   │   ├── StepCard.tsx              # 单个步骤卡片
│   │   │   ├── ThinkingBlock.tsx         # Think 模式推理区
│   │   │   └── ScoreBadge.tsx            # 评分徽章
│   │   ├── template/
│   │   │   ├── TemplatePreview.tsx       # 模板预览（iframe）
│   │   │   └── FullscreenPreview.tsx     # 全屏预览
│   │   └── settings/
│   │       └── ConfigDrawer.tsx          # 配置抽屉
│   │
│   ├── lib/
│   │   ├── ai/
│   │   │   ├── client.ts                 # OpenAI client（singleton）
│   │   │   ├── pipeline.ts               # 五步流水线编排
│   │   │   ├── modes/
│   │   │   │   ├── quick.ts              # Quick 模式
│   │   │   │   ├── think.ts              # Think 模式
│   │   │   │   └── expert.ts             # Expert 模式
│   │   │   ├── prompts/
│   │   │   │   ├── requirements.ts       # 需求分析 prompt
│   │   │   │   ├── breakdown.ts          # 思路拆解 prompt
│   │   │   │   ├── layout.ts             # 布局规划 prompt
│   │   │   │   ├── mockdata.ts           # Mock 数据 prompt
│   │   │   │   ├── template.ts           # 模板生成 prompt（含组件示例）
│   │   │   │   ├── scoring.ts            # 评分 prompt
│   │   │   │   └── expert-gap.ts         # 专家模式缺口分析 prompt
│   │   │   └── context.ts                # 上下文构建 + 压缩算法
│   │   ├── db/
│   │   │   └── prisma.ts                 # Prisma client singleton
│   │   └── utils/
│   │       ├── tokens.ts                 # Token 计数工具
│   │       └── sse.ts                    # SSE 流构建工具
│   │
│   ├── store/
│   │   ├── session.ts                    # 会话状态（Zustand）
│   │   ├── pipeline.ts                   # 流水线进度状态
│   │   └── ui.ts                         # UI 状态（面板、全屏）
│   │
│   └── types/
│       └── index.ts                      # 全局 TypeScript 类型
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-05-23-dashboard-agent-design.md
│
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.ts
```

---

## 十三、Subagent 并发实现规划

以下 7 个 Subagent 可并发启动，实现无缝衔接。

### Agent 1 — 基础设施（Infrastructure）
**工作范围：**
- 初始化 Next.js 14 项目（App Router + TypeScript）
- 配置 Tailwind CSS + shadcn/ui
- 配置 Prisma + MySQL，编写 schema.prisma（见第三章）
- 配置 Docker + docker-compose.yml + Dockerfile
- 编写 `.env.example`、`.gitignore`
- 配置 `next.config.ts`（standalone output、env 透传）
- 运行 `prisma migrate dev` 验证 DB 连接
- 建立 `src/lib/db/prisma.ts` 单例

**交付物：** 可 `docker-compose up` 启动的空应用框架

---

### Agent 2 — UI Shell（三栏布局）
**依赖：** Agent 1 完成项目初始化

**工作范围：**
- `AppShell.tsx`：三栏布局骨架（Sidebar 240px + Chat flex-1 + Progress 380px）
- `Sidebar.tsx`：会话列表、日期分组、激活高亮、新建按钮、模式选择器
- `ChatPanel.tsx`：消息区容器、滚动逻辑
- `ProgressPanel.tsx`：进度步骤容器骨架
- `ConfigDrawer.tsx`：配置抽屉（只做 UI，配置保存逻辑由 Agent 7 完成）
- 主题切换（浅色/深色，CSS 变量体系）
- 响应式（最小宽度 1280px）

**交付物：** 完整 UI 框架，各面板有占位内容，路由 `/chat/[sessionId]` 正常渲染

---

### Agent 3 — 聊天引擎（Chat Engine）
**依赖：** Agent 1、Agent 2

**工作范围：**
- `MessageList.tsx` + `MessageItem.tsx`：消息渲染分发
- `TypewriterText.tsx`：打字机流式文本组件（基于 `requestAnimationFrame`）
- `ChatInput.tsx`：输入框（Enter 发送、Shift+Enter 换行、禁用状态）
- Zustand store：`session.ts`（会话列表、当前会话）
- `GET /api/sessions`、`POST /api/sessions`、`DELETE /api/sessions/[id]` 实现
- `GET /api/sessions/[id]/messages` 实现
- SSE 客户端接收逻辑（连接、断线重连、事件解析）
- 上下文压缩算法：`src/lib/ai/context.ts`（含 tiktoken）
- `src/lib/utils/tokens.ts` token 计数工具

**交付物：** 可发送普通消息（非 AI 生成），聊天区流式渲染正常

---

### Agent 4 — AI 流水线（Pipeline）
**依赖：** Agent 1

**工作范围：**
- `src/lib/ai/client.ts`：OpenAI client 单例（从环境变量读取 baseUrl、model、key）
- `src/lib/ai/pipeline.ts`：五步流水线主编排器
  - 接收 SSE writer，按步骤顺序执行
  - 每步完成后评分，低于阈值暂停会话
  - 续接检测（`isResumingSession`）
- `src/lib/ai/modes/quick.ts`：Quick 模式各步骤调用
- `src/lib/ai/modes/think.ts`：Think 模式（`<thinking>` 块解析）
- `src/lib/ai/modes/expert.ts`：Expert 模式（缺口分析 + 问题生成）
- 所有 prompts（`src/lib/ai/prompts/`）：
  - 含完整组件示例代码的 `template.ts` prompt（最重要）
  - 其余各步骤 prompt
- `POST /api/sessions/[id]/messages` Route Handler（触发流水线，返回 SSE）
- `GET /api/sessions/[id]/steps` Route Handler
- `POST /api/expert/[questionId]/answer` Route Handler
- Zustand store：`pipeline.ts`（步骤状态、评分）

**交付物：** 可完整跑通 Quick 模式五步流水线（含评分），SSE 流正常输出

---

### Agent 5 — 进度面板（Progress Panel）
**依赖：** Agent 2、Agent 3（SSE 事件格式）

**工作范围：**
- `PipelineProgress.tsx`：步骤列表容器，监听 SSE 事件更新状态
- `StepCard.tsx`：单步骤卡片（PENDING/RUNNING/COMPLETED/FAILED 四态）
  - RUNNING 状态：蓝色脉冲动画 + 内容流式写入
  - COMPLETED 状态：自动折叠 + 绿色勾 + 评分徽章
  - FAILED 状态：红色叉 + 展开问题列表
  - Framer Motion 折叠/展开动画
- `ThinkingBlock.tsx`：Think 模式推理区（可折叠的灰色区域，类 DeepSeek 样式）
- `ScoreBadge.tsx`：评分徽章（颜色随分数变化）
- 进度面板双视图切换逻辑（进度视图 ↔ 模板预览视图）

**交付物：** 进度面板完整运作，三种模式的步骤卡片正确渲染

---

### Agent 6 — 模板引擎（Template Engine）
**依赖：** Agent 4（模板 HTML 生成）

**工作范围：**
- `GET /api/templates/[id]` Route Handler
- `GET /api/templates/[id]/preview` Route Handler（返回 HTML 文件，设置正确 Content-Type）
- `TemplateCard.tsx`：
  - 缩略图预览区（iframe 缩放，scale transform）
  - 综合评分、组件数量展示
  - 预览 / 全屏 / 下载按钮
- `TemplatePreview.tsx`：右侧面板模板预览（iframe 全高展示）
- `FullscreenPreview.tsx`：全屏预览（覆盖整个应用层）
- `ScoreReportCard.tsx`：低分报告卡（展示问题列表，引导用户补充）
- `ExpertQuestionCard.tsx`：
  - 单选 / 多选问题卡
  - 「其他」选项 + 自定义输入框
  - 提交按钮（调用 expert answer API）

**交付物：** 模板卡片、预览、全屏、下载全部可用；专家问题卡片可交互

---

### Agent 7 — 配置与工具（Config & Utils）
**依赖：** Agent 1

**工作范围：**
- `GET /api/config` 和 `PUT /api/config` Route Handler（读写 localStorage 配置 + 环境变量覆盖）
- `ConfigDrawer.tsx` 配置逻辑（连接 API，保存/恢复默认）
- Zustand store：`ui.ts`（面板状态、全屏状态）
- `src/lib/utils/sse.ts`：SSE 流构建工具函数
- `src/lib/ai/context.ts`：上下文压缩算法（支持 maxTokens 配置注入）
- 应用整体集成测试：确保 7 个 agent 交付物正确连接

**交付物：** 配置面板可用，全局状态正确，整体应用可端到端运行

---

## 十四、React 范式推理实现

Agent 的多轮对话采用类 React 状态机范式：

```typescript
type PipelineState = {
  phase: 'idle' | 'analyzing' | 'planning' | 'generating' | 'paused' | 'done'
  currentStep: StepName | null
  completedSteps: CompletedStep[]
  pendingExpertAnswers: string[]
  contextTokens: number
}

// 状态转移纯函数（可测试）
function reducer(state: PipelineState, action: PipelineAction): PipelineState {
  switch (action.type) {
    case 'STEP_COMPLETE': return { ...state, completedSteps: [...state.completedSteps, action.step] }
    case 'SCORE_FAIL':    return { ...state, phase: 'paused' }
    case 'RESUME':        return { ...state, phase: 'analyzing' }
    // ...
  }
}
```

每次用户发送消息，都通过 `buildContext()` 重新构建完整上下文（含压缩后的历史 + 所有已完成步骤摘要），保证多轮对话的连贯性。

---

## 附录：关键实现注意事项

1. **API Key 安全**：Key 只能存在 `.env.local` 和 Docker env，不得出现在前端 bundle 中（所有 AI 调用在 Route Handler 服务端执行）
2. **iframe 沙箱**：模板预览 iframe 使用 `sandbox="allow-scripts"` 隔离，防止生成的 HTML 访问父页面
3. **SSE 超时**：长流水线（Expert 模式）可能超过 30 秒，需配置 `maxDuration` 或使用流式响应分块
4. **MySQL 连接池**：Prisma 使用连接池，Docker 重启后等待 DB 健康检查通过再启动 app
5. **组件示例代码长度**：`template.ts` prompt 包含大量组件示例，估计 ~4000 tokens，需计入上下文预算

---

*文档由 Claude Sonnet 4.6 生成，供 Subagent 并发实现参考。*
