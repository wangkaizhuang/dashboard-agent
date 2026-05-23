import { prisma } from '@/lib/db/prisma'
import { getOpenAIClient, getModel } from '@/lib/ai/client'
import { buildCompressedContext } from './context'
import { runQuickStep, buildStepPrompts } from './modes/quick'
import { runThinkStep } from './modes/think'
import { analyzeGaps, waitForExpertAnswers } from './modes/expert'
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
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { messages: { orderBy: { createdAt: 'asc' } }, steps: { orderBy: { stepIndex: 'asc' } } }
  })

  if (!session) throw new Error('Session not found')

  // Reset any stuck RUNNING steps (e.g. from a previous server restart) to FAILED
  const stuckRunning = session.steps.filter(s => s.status === 'RUNNING')
  for (const stuck of stuckRunning) {
    await prisma.pipelineStep.update({
      where: { id: stuck.id },
      data: { status: 'FAILED', content: '服务重启导致步骤中断，请重新发送消息继续。' }
    })
  }
  if (stuckRunning.length > 0) {
    await prisma.session.update({ where: { id: sessionId }, data: { status: 'PAUSED' } })
  }

  // Re-fetch steps after cleanup
  const cleanedSteps = await prisma.pipelineStep.findMany({
    where: { sessionId }, orderBy: { stepIndex: 'asc' }
  })

  const failedStep = cleanedSteps.find(s => s.status === 'FAILED')
  const startIndex = failedStep ? failedStep.stepIndex : 0

  // Prisma returns Date for createdAt; map to string to satisfy our Message type
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

  const previousOutputs: Record<string, string> = {}
  cleanedSteps.filter(s => s.status === 'COMPLETED').forEach(s => {
    previousOutputs[s.stepName] = s.content
  })

  for (let i = startIndex; i < STEP_ORDER.length; i++) {
    const stepName = STEP_ORDER[i]
    const existingStep = cleanedSteps.find(s => s.stepName === stepName)
    const step = existingStep
      ? await prisma.pipelineStep.update({ where: { id: existingStep.id }, data: { status: 'RUNNING', content: '' } })
      : await prisma.pipelineStep.create({ data: { sessionId, stepIndex: i, stepName, status: 'RUNNING', content: '' } })

    let content = ''

    try {
      // EXPERT mode: only gather expert input for REQUIREMENTS_ANALYSIS.
      // Asking questions for every step creates a confusing UX and causes long 5-min waits
      // on each subsequent step while the user is unaware new questions have appeared.
      if (mode === 'EXPERT' && stepName === 'REQUIREMENTS_ANALYSIS') {
        const hasGaps = await analyzeGaps(sessionId, i, stepName, userInput, history, send)
        if (hasGaps) {
          const answers = await waitForExpertAnswers(sessionId, i)
          if (answers) userInput = userInput + '\n\n[专家补充信息]\n' + answers
        }
      }

      let reasoning = ''
      if (mode === 'QUICK' || mode === 'EXPERT') {
        content = await runQuickStep({ stepIndex: i, stepName, userInput, history, previousOutputs }, send)
      } else if (mode === 'THINK') {
        const { systemPrompt, userPrompt } = buildStepPrompts(stepName, userInput, history, previousOutputs)
        ;[content, reasoning] = await runThinkStep(i, stepName, systemPrompt, userPrompt, send)
      }

      const scoreResp = await getOpenAIClient().chat.completions.create({
        model: getModel(),
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

      await prisma.pipelineStep.update({
        where: { id: step.id },
        data: { status: 'COMPLETED', content, score, ...(reasoning ? { reasoning } : {}) }
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

  const htmlContent = previousOutputs['TEMPLATE_GENERATION'] || ''
  const template = await prisma.template.upsert({
    where: { sessionId },
    create: { sessionId, htmlContent, score: 85, components: [] },
    update: { htmlContent, score: 85 }
  })

  let sessionTitle: string | undefined
  try {
    const req = JSON.parse(previousOutputs['REQUIREMENTS_ANALYSIS'] || '{}')
    if (req.title) sessionTitle = req.title
  } catch { /* keep title undefined */ }
  await prisma.session.update({
    where: { id: sessionId },
    data: { status: 'COMPLETED', ...(sessionTitle ? { title: sessionTitle } : {}) }
  })

  send({ type: 'template_ready', templateId: template.id })
  send({ type: 'pipeline_complete' })
}

