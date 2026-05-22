import { prisma } from '@/lib/db/prisma'
import { openai, MODEL } from '@/lib/ai/client'
import { buildCompressedContext } from './context'
import { runQuickStep } from './modes/quick'
import { runThinkStep } from './modes/think'
import { analyzeGaps, waitForExpertAnswers } from './modes/expert'
import * as P from './prompts/requirements'
import * as PB from './prompts/breakdown'
import * as PL from './prompts/layout'
import * as PM from './prompts/mockdata'
import * as PT from './prompts/template'
import { SCORING_SYSTEM, SCORING_USER } from './prompts/scoring'
import type { SSEEvent, StepName, Mode } from '@/types'
import { STEP_ORDER } from '@/types'

type SendFn = (event: SSEEvent) => void

export async function runPipeline(
  sessionId: string,
  userInput: string,
  mode: Mode,
  scoreThreshold: number,
  send: SendFn
): Promise<void> {
  // Load session with messages and steps
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { messages: { orderBy: { createdAt: 'asc' } }, steps: { orderBy: { stepIndex: 'asc' } } }
  })

  if (!session) throw new Error('Session not found')

  // Determine start step (resume from FAILED step if any)
  const failedStep = session.steps.find(s => s.status === 'FAILED')
  const startIndex = failedStep ? failedStep.stepIndex : 0

  // Build context — map Prisma result (Date createdAt) to our Message type (string createdAt)
  const mappedMessages = session.messages.map(m => ({
    ...m,
    createdAt: m.createdAt.toISOString(),
    metadata: m.metadata as Record<string, unknown> | null | undefined,
  }))
  const contextMessages = await buildCompressedContext(
    mappedMessages,
    parseInt(process.env.CONTEXT_MAX_TOKENS || '128000'),
    10
  )
  const history = contextMessages.map(m => `${m.role}: ${m.content}`).join('\n')

  // Build outputs from completed steps
  const previousOutputs: Record<string, string> = {}
  session.steps.filter(s => s.status === 'COMPLETED').forEach(s => {
    previousOutputs[s.stepName] = s.content
  })

  // Execute each step
  for (let i = startIndex; i < STEP_ORDER.length; i++) {
    const stepName = STEP_ORDER[i]

    // Find existing step record if resuming
    const existingStep = session.steps.find(s => s.stepName === stepName)

    // Create or update step as RUNNING
    const step = existingStep
      ? await prisma.pipelineStep.update({ where: { id: existingStep.id }, data: { status: 'RUNNING', content: '' } })
      : await prisma.pipelineStep.create({ data: { sessionId, stepIndex: i, stepName, status: 'RUNNING', content: '' } })

    let content = ''

    try {
      // Expert mode: gap analysis before each step
      if (mode === 'EXPERT') {
        const hasGaps = await analyzeGaps(sessionId, i, stepName, userInput, history, send)
        if (hasGaps) {
          // Wait for user to answer questions (up to 5 minutes)
          const answers = await waitForExpertAnswers(sessionId, i)
          if (answers) {
            userInput = userInput + '\n\n[专家补充信息]\n' + answers
          }
        }
      }

      // Run the step
      if (mode === 'QUICK' || mode === 'EXPERT') {
        content = await runQuickStep({
          stepIndex: i, stepName, userInput, history, previousOutputs
        }, send)
      } else if (mode === 'THINK') {
        // Build prompts same as quick mode, then use think mode
        const { systemPrompt, userPrompt } = buildStepPrompts(stepName, userInput, history, previousOutputs)
        content = await runThinkStep(i, stepName, systemPrompt, userPrompt, send)
      }

      // Score the step
      const scoreResp = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: SCORING_SYSTEM },
          { role: 'user', content: SCORING_USER(stepName, userInput, content) }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 300,
      })

      let score = 75
      let issues: string[] = []
      try {
        const scored = JSON.parse(scoreResp.choices[0]?.message?.content || '{"score":75}')
        score = scored.score || 75
        issues = scored.issues || []
      } catch { /* use defaults */ }

      send({ type: 'step_score', stepIndex: i, score })

      // Check threshold
      if (score < scoreThreshold) {
        await prisma.pipelineStep.update({
          where: { id: step.id },
          data: { status: 'FAILED', content, score, issues: issues as never }
        })
        await prisma.session.update({ where: { id: sessionId }, data: { status: 'PAUSED' } })
        send({ type: 'step_failed', stepIndex: i, issues })
        send({ type: 'pipeline_paused', reason: `步骤 "${stepName}" 评分 ${score} 低于阈值 ${scoreThreshold}，请补充信息` })
        return
      }

      // Update step as completed
      await prisma.pipelineStep.update({
        where: { id: step.id },
        data: { status: 'COMPLETED', content, score }
      })
      previousOutputs[stepName] = content
      send({ type: 'step_complete', stepIndex: i })

    } catch (err) {
      const error = err as Error
      await prisma.pipelineStep.update({
        where: { id: step.id },
        data: { status: 'FAILED', content: error.message }
      })
      await prisma.session.update({ where: { id: sessionId }, data: { status: 'PAUSED' } })
      send({ type: 'step_failed', stepIndex: i, issues: [error.message] })
      return
    }
  }

  // All steps done - save template
  const htmlContent = previousOutputs['TEMPLATE_GENERATION'] || ''
  const template = await prisma.template.upsert({
    where: { sessionId },
    create: { sessionId, htmlContent, score: 85, components: [] },
    update: { htmlContent, score: 85 }
  })

  // Update session title from requirements
  const reqOutput = previousOutputs['REQUIREMENTS_ANALYSIS']
  if (reqOutput) {
    try {
      const req = JSON.parse(reqOutput)
      if (req.title) {
        await prisma.session.update({ where: { id: sessionId }, data: { title: req.title, status: 'COMPLETED' } })
      } else {
        await prisma.session.update({ where: { id: sessionId }, data: { status: 'COMPLETED' } })
      }
    } catch {
      await prisma.session.update({ where: { id: sessionId }, data: { status: 'COMPLETED' } })
    }
  } else {
    await prisma.session.update({ where: { id: sessionId }, data: { status: 'COMPLETED' } })
  }

  send({ type: 'template_ready', templateId: template.id })
  send({ type: 'pipeline_complete' })
}

function buildStepPrompts(
  stepName: StepName, userInput: string, history: string, previousOutputs: Record<string, string>
): { systemPrompt: string; userPrompt: string } {
  switch (stepName) {
    case 'REQUIREMENTS_ANALYSIS':
      return { systemPrompt: P.REQUIREMENTS_SYSTEM, userPrompt: P.REQUIREMENTS_USER(userInput, history) }
    case 'THOUGHT_BREAKDOWN':
      return { systemPrompt: PB.BREAKDOWN_SYSTEM, userPrompt: PB.BREAKDOWN_USER(previousOutputs['REQUIREMENTS_ANALYSIS'] || '', history) }
    case 'LAYOUT_PLANNING':
      return { systemPrompt: PL.LAYOUT_SYSTEM, userPrompt: PL.LAYOUT_USER(previousOutputs['REQUIREMENTS_ANALYSIS'] || '', previousOutputs['THOUGHT_BREAKDOWN'] || '') }
    case 'MOCK_DATA':
      return { systemPrompt: PM.MOCKDATA_SYSTEM, userPrompt: PM.MOCKDATA_USER(previousOutputs['LAYOUT_PLANNING'] || '', previousOutputs['REQUIREMENTS_ANALYSIS'] || '') }
    case 'TEMPLATE_GENERATION':
      return { systemPrompt: PT.TEMPLATE_SYSTEM, userPrompt: PT.TEMPLATE_USER(previousOutputs['REQUIREMENTS_ANALYSIS'] || '', previousOutputs['LAYOUT_PLANNING'] || '', previousOutputs['MOCK_DATA'] || '') }
  }
}
