import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { PipelineStep, StepStatus, StepName, SSEEvent, ExpertQuestion } from '@/types'
import { STEP_ORDER } from '@/types'

interface StepState {
  stepName: StepName
  stepIndex: number
  status: StepStatus
  content: string
  thinking: string
  score: number | null
  issues: string[]
}

interface PipelineState {
  sessionId: string | null
  steps: StepState[]
  isRunning: boolean
  isPaused: boolean
  pendingQuestions: ExpertQuestion[]

  // Actions
  initPipeline: (sessionId: string) => void
  handleSSEEvent: (event: SSEEvent) => void
  loadStepsFromDB: (sessionId: string) => Promise<void>
  setRunning: (running: boolean) => void
  clearPipeline: () => void
  addExpertQuestion: (question: ExpertQuestion) => void
  removeExpertQuestion: (id: string) => void
}

const createInitialSteps = (): StepState[] =>
  STEP_ORDER.map((name, index) => ({
    stepName: name,
    stepIndex: index,
    status: 'PENDING',
    content: '',
    thinking: '',
    score: null,
    issues: [],
  }))

export const usePipelineStore = create<PipelineState>()(
  immer((set, get) => ({
    sessionId: null,
    steps: createInitialSteps(),
    isRunning: false,
    isPaused: false,
    pendingQuestions: [],

    initPipeline: (sessionId) => set(state => {
      state.sessionId = sessionId
      state.steps = createInitialSteps()
      state.isRunning = false
      state.isPaused = false
      state.pendingQuestions = []
    }),

    handleSSEEvent: (event: SSEEvent) => set(state => {
      switch (event.type) {
        case 'step_start':
          if (event.stepIndex !== undefined) {
            state.steps[event.stepIndex].status = 'RUNNING'
            state.steps[event.stepIndex].content = ''
            state.steps[event.stepIndex].thinking = ''
          }
          break

        case 'step_content':
          if (event.stepIndex !== undefined && event.delta) {
            state.steps[event.stepIndex].content += event.delta
          }
          break

        case 'step_thinking':
          if (event.stepIndex !== undefined && event.delta) {
            state.steps[event.stepIndex].thinking += event.delta
          }
          break

        case 'step_score':
          if (event.stepIndex !== undefined && event.score !== undefined) {
            state.steps[event.stepIndex].score = event.score
          }
          break

        case 'step_complete':
          if (event.stepIndex !== undefined) {
            state.steps[event.stepIndex].status = 'COMPLETED'
          }
          break

        case 'step_failed':
          if (event.stepIndex !== undefined) {
            state.steps[event.stepIndex].status = 'FAILED'
            state.steps[event.stepIndex].issues = event.issues || []
          }
          break

        case 'expert_question':
          if (event.question) {
            state.pendingQuestions.push(event.question)
          }
          break

        case 'pipeline_complete':
          state.isRunning = false
          break

        case 'pipeline_paused':
          state.isRunning = false
          state.isPaused = true
          break
      }
    }),

    loadStepsFromDB: async (sessionId: string) => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/steps`)
        if (res.ok) {
          const dbSteps: PipelineStep[] = await res.json()
          set(state => {
            state.steps = createInitialSteps()
            dbSteps.forEach(dbStep => {
              state.steps[dbStep.stepIndex] = {
                stepName: dbStep.stepName,
                stepIndex: dbStep.stepIndex,
                status: dbStep.status,
                content: dbStep.content,
                thinking: dbStep.reasoning || '',
                score: dbStep.score ?? null,
                issues: (dbStep.issues as string[]) || [],
              }
            })
          })
        }
      } catch {}
    },

    setRunning: (running) => set(state => { state.isRunning = running }),

    clearPipeline: () => set(state => {
      state.steps = createInitialSteps()
      state.isRunning = false
      state.isPaused = false
      state.pendingQuestions = []
    }),

    addExpertQuestion: (question) => set(state => { state.pendingQuestions.push(question) }),

    removeExpertQuestion: (id) => set(state => {
      state.pendingQuestions = state.pendingQuestions.filter(q => q.id !== id)
    }),
  }))
)
