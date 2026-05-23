// Enums (mirror Prisma enums for client use)
export type Mode = 'QUICK' | 'THINK' | 'EXPERT'
export type SessionStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'FAILED'
export type MessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM'
export type MessageType = 'TEXT' | 'TEMPLATE_CARD' | 'EXPERT_QUESTION' | 'SCORE_REPORT'
export type StepStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED'
export type StepName =
  | 'REQUIREMENTS_ANALYSIS'
  | 'THOUGHT_BREAKDOWN'
  | 'LAYOUT_PLANNING'
  | 'MOCK_DATA'
  | 'TEMPLATE_GENERATION'

// Core entities
export interface Session {
  id: string
  title: string
  mode: Mode
  status: SessionStatus
  createdAt: string
  updatedAt: string
  messages?: Message[]
  steps?: PipelineStep[]
  template?: Template | null
}

export interface Message {
  id: string
  sessionId: string
  role: MessageRole
  content: string
  type: MessageType
  metadata?: Record<string, unknown> | null
  createdAt: string
}

export interface PipelineStep {
  id: string
  sessionId: string
  stepIndex: number
  stepName: StepName
  status: StepStatus
  content: string
  score?: number | null
  reasoning?: string | null
  issues?: string[] | null
  createdAt: string
  updatedAt: string
}

export interface Template {
  id: string
  sessionId: string
  htmlContent: string
  score: number
  components: string[]
  createdAt: string
}

export interface ExpertQuestion {
  id: string
  sessionId: string
  stepIndex: number
  question: string
  options: { label: string; value: string }[]
  answer?: string | null
  customText?: string | null
  answered: boolean
  createdAt: string
}

// SSE Event types
export type SSEEventType =
  | 'step_start'
  | 'step_content'
  | 'step_thinking'
  | 'step_score'
  | 'step_complete'
  | 'step_failed'
  | 'expert_question'
  | 'template_ready'
  | 'pipeline_complete'
  | 'pipeline_paused'
  | 'heartbeat'
  | 'error'

export interface SSEEvent {
  type: SSEEventType
  stepIndex?: number
  stepName?: StepName
  delta?: string
  score?: number
  issues?: string[]
  question?: ExpertQuestion
  templateId?: string
  reason?: string
  message?: string
}

// Step labels for display
export const STEP_LABELS: Record<StepName, string> = {
  REQUIREMENTS_ANALYSIS: '需求分析',
  THOUGHT_BREAKDOWN: '思路拆解',
  LAYOUT_PLANNING: '布局规划',
  MOCK_DATA: 'Mock 数据',
  TEMPLATE_GENERATION: '模板生成',
}

export const STEP_DESCRIPTIONS: Record<StepName, string> = {
  REQUIREMENTS_ANALYSIS: '提取核心需求、目标用户、关键指标',
  THOUGHT_BREAKDOWN: '分解功能模块、数据关系、用户路径',
  LAYOUT_PLANNING: '确定页面布局、选择所需组件',
  MOCK_DATA: '为每个组件生成真实感示例数据',
  TEMPLATE_GENERATION: '生成可直接使用的 HTML 仪表板',
}

export const STEP_ORDER: StepName[] = [
  'REQUIREMENTS_ANALYSIS',
  'THOUGHT_BREAKDOWN',
  'LAYOUT_PLANNING',
  'MOCK_DATA',
  'TEMPLATE_GENERATION',
]

// App config
export interface AppConfig {
  contextMaxTokens: number
  qualityScoreThreshold: number
  contextKeepRecent: number
  theme: 'light' | 'dark' | 'system'
}

export const DEFAULT_CONFIG: AppConfig = {
  contextMaxTokens: 128000,
  qualityScoreThreshold: 30,
  contextKeepRecent: 10,
  theme: 'system',
}
