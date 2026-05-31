# Dashboard Agent

基于对话的仪表板模板生成工具。用自然语言描述需求，Agent 通过五步流水线（需求分析 → 思路拆解 → 布局规划 → Mock 数据 → 模板生成）自动产出一份开箱即用的精美仪表板 HTML。

## 功能

- **三种模式**：Quick（快速）/ Think（深思，带推理过程）/ Expert（专家互动问答）
- **流式输出**：SSE 实时展示每一步推理与评分
- **质量评分**：每步自动打分，低于阈值自动中止并引导补充
- **组件交互**：注释式局部调整（F2）、tab/筛选器联动（F3）
- **可配置**：模型、上下文窗口、评分阈值均可在界面里调整

## 技术栈

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Zustand · Prisma + MySQL 8 · OpenAI 兼容 SDK · ECharts · Framer Motion

## 环境要求

- **Node.js 20+**
- **MySQL 8.0**（本地起，或用下文的 Docker 一键起）
- 一个 OpenAI 兼容的 API Key（默认走 packyapi 代理）

---

## 快速开始（本地开发）

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量：复制模板后填入真实值
cp .env.example .env
#   然后编辑 .env，至少填好 OPENAI_API_KEY 和 DATABASE_URL（见下方「环境变量」）

# 3. 生成 Prisma Client 并建表
npx prisma generate
npx prisma migrate deploy     # 应用已有迁移建表（首次部署）
#   或者用：npx prisma db push   # 直接把 schema 同步到库（不走迁移）

# 4. 启动开发服务器
npm run dev
```

打开 http://localhost:3000 即可。

> **环境变量文件说明**：Next.js 运行时会读 `.env` 和 `.env.local`，Prisma CLI 只读 `.env`。
> 为省事，**推荐统一用 `.env`**（Prisma 和 Next 都能读到）；本地想覆盖某些值时再用 `.env.local`。
> `.env` / `.env.local` 已在 `.gitignore` 中，不会进仓库。

## 生产构建与启动

```bash
npm run build
npm run start        # 默认监听 0.0.0.0:3000
```

## Docker 一键启动（含 MySQL）

`docker-compose.yml` 会同时起 app 和一个 MySQL 8 容器，并在启动时自动跑迁移建表。

```bash
# 把 OPENAI_API_KEY 传给 compose（其余有默认值）
export OPENAI_API_KEY=你的key
docker compose up -d --build
```

- 应用：http://localhost:3000
- MySQL：容器内 `db:3306`，数据持久化在 `mysql_data` 卷
- 如需自定义模型/阈值，可在 shell 里 `export OPENAI_MODEL=... QUALITY_SCORE_THRESHOLD=...` 后再 `up`

## 常用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发模式（热更新） |
| `npm run build` / `npm run start` | 生产构建 / 启动 |
| `npm test` | 运行测试（Vitest） |
| `npm run db:push` | 把 schema 同步到数据库 |
| `npm run db:migrate` | 创建并应用迁移（开发用） |
| `npm run db:studio` | 打开 Prisma Studio 可视化看数据 |

---

## 环境变量

| 变量 | 必填 | 说明 |
|------|:---:|------|
| `OPENAI_API_KEY` | ✅ | OpenAI 兼容 API Key |
| `OPENAI_BASE_URL` | | API 端点，默认 `https://www.packyapi.com/v1` |
| `OPENAI_MODEL` | | 主模型，默认 `gpt-5.4-mini`（Quick/Expert 及大部分步骤） |
| `OPENAI_REASONING_MODEL` | | **仅 Think 模式**使用的推理模型，默认 `deepseek-v4-flash`（会输出可见推理过程） |
| `DATABASE_URL` | ✅ | MySQL 连接串，如 `mysql://root:密码@localhost:3306/agent-explore` |
| `CONTEXT_MAX_TOKENS` | | 上下文压缩阈值，默认 `128000` |
| `QUALITY_SCORE_THRESHOLD` | | 全局质量评分阈值，默认 `30` |
| `NEXT_PUBLIC_APP_URL` | | 应用对外地址，如 `http://localhost:3000` |

> **数据库名带连字符**：`agent-explore` 在 SQL 里需用反引号包裹，
> 例如 `CREATE DATABASE \`agent-explore\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`。
> 连接串里密码含特殊字符（`@ # / :` 等）需做 URL 编码，建议密码只用字母数字。

> **关于推理模型**：默认 `gpt-5.4-mini` 不输出独立推理内容，Think 模式因此改用
> `deepseek-v4-flash`（在系统配置抽屉里可切 flash/pro）。若你的 API 令牌不覆盖该模型，
> Think 模式仍可运行，只是不展示推理过程。
