import { prisma } from '@/lib/db/prisma'
import { getOpenAIClient, getModel } from '@/lib/ai/client'
import { buildCompressedContext } from './context'
import { runQuickStep, buildStepPrompts } from './modes/quick'
import { runThinkStep } from './modes/think'
import { analyzeGaps, waitForExpertAnswers } from './modes/expert'
import { SCORING_SYSTEM, SCORING_USER } from './prompts/scoring'
import { SUMMARY_SYSTEM, SUMMARY_USER } from './prompts/summary'
import { runPartialUpdate } from './partial-update'
import { getRuntimeConfig } from '@/lib/config/runtime'
import type { SSEEvent, StepName, Mode, Annotation, ComponentRegistryItem } from '@/types'
import { STEP_ORDER } from '@/types'

type SendFn = (event: SSEEvent) => void

export async function runPipeline(
  sessionId: string,
  userInput: string,
  mode: Mode,
  scoreThreshold: number,
  send: SendFn,
  annotations: Annotation[] = [],
): Promise<void> {
  // Route to partial update when annotations are present and a template already exists
  if (annotations.length > 0) {
    const existingTemplate = await prisma.template.findUnique({ where: { sessionId } })
    if (existingTemplate) {
      try {
        await runPartialUpdate(sessionId, userInput, annotations, send)
        return  // partial update succeeded
      } catch (err) {
        const msg = (err as Error).message
        if (msg !== 'FULL_REGEN_REQUIRED') throw err  // unexpected error — propagate
        // else: fall through to full 5-step pipeline below
      }
    }
  }

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
  const runtimeCfg = getRuntimeConfig()
  const contextMessages = await buildCompressedContext(
    mappedMessages,
    runtimeCfg.contextMaxTokens,
    runtimeCfg.contextKeepRecent
  )
  const history = contextMessages.map(m => `${m.role}: ${m.content}`).join('\n')

  const previousOutputs: Record<string, string> = {}
  cleanedSteps.filter(s => s.status === 'COMPLETED').forEach(s => {
    previousOutputs[s.stepName] = s.content
  })

  // Track the TEMPLATE_GENERATION score from this run so the template upsert
  // records the actual score instead of falling back to 75 every time.
  let liveTemplateScore = 75

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
        // A reasoning model can occasionally spend its entire token budget on the
        // <thinking>/reasoning stream and emit an EMPTY answer (observed on large
        // steps like MOCK_DATA). That empty output would score 0 and wrongly stall
        // the pipeline. Fall back to a plain (non-reasoning) call so the step still
        // produces real content instead of failing.
        if (!content.trim()) {
          content = await runQuickStep({ stepIndex: i, stepName, userInput, history, previousOutputs }, send)
        }
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
        // Use a strict number check (not `|| 75`) so a legitimate low score isn't
        // silently turned into 75 — and clamp to 0-100 against malformed values.
        score = typeof scored.score === 'number' ? Math.max(0, Math.min(100, scored.score)) : 75
        issues = Array.isArray(scored.issues) ? scored.issues : []
      } catch { /* use defaults */ }

      send({ type: 'step_score', stepIndex: i, score })

      // Use per-step threshold if configured; fall back to global threshold
      const cfg = getRuntimeConfig()
      const effectiveThreshold = cfg.stepThresholds?.[stepName] ?? scoreThreshold

      if (score < effectiveThreshold) {
        await prisma.pipelineStep.update({
          where: { id: step.id },
          data: { status: 'FAILED', content, score, issues: issues as never }
        })
        await prisma.session.update({ where: { id: sessionId }, data: { status: 'PAUSED' } })
        send({ type: 'step_failed', stepIndex: i, issues })
        send({ type: 'pipeline_paused', reason: `步骤 "${stepName}" 评分 ${score} 低于阈值 ${effectiveThreshold}，请补充信息` })
        return
      }

      await prisma.pipelineStep.update({
        where: { id: step.id },
        data: { status: 'COMPLETED', content, score, ...(reasoning ? { reasoning } : {}) }
      })
      previousOutputs[stepName] = content
      if (stepName === 'TEMPLATE_GENERATION') liveTemplateScore = score
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
  // Use the score captured live during this run; fall back to any previously-
  // completed step score for resumed pipelines where this run didn't re-run
  // TEMPLATE_GENERATION (i.e. it was already COMPLETED from a prior attempt).
  const resumedStep = cleanedSteps.find(s => s.stepName === 'TEMPLATE_GENERATION' && s.status === 'COMPLETED')
  const templateScore = liveTemplateScore !== 75
    ? liveTemplateScore
    : (typeof resumedStep?.score === 'number' ? resumedStep.score : 75)

  // Build component registry from layout planning output
  let componentRegistry: ComponentRegistryItem[] = []
  try {
    const layoutParsed = JSON.parse(previousOutputs['LAYOUT_PLANNING'] || '{}')
    const areas: Array<{ components?: Array<{ id?: string; title?: string; type?: string; controlledBy?: string }> }> = layoutParsed.areas || []
    componentRegistry = areas
      .flatMap(a => a.components || [])
      .filter(c => c.id)
      .map(c => ({
        id: c.id!,
        label: c.title || c.id!,
        type: c.type || 'card',
        ...(c.controlledBy ? { controlledBy: c.controlledBy } : {}),
      }))
  } catch { /* ignore */ }

  const template = await prisma.template.upsert({
    where: { sessionId },
    create: { sessionId, htmlContent, score: templateScore, components: componentRegistry as never },
    update: { htmlContent, score: templateScore, components: componentRegistry as never }
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

  // ── Persist pipeline progress snapshot ───────────────────────────────────
  // Fetch fresh step states (the in-memory cleanedSteps has stale status for
  // steps completed during this run, since we update DB in the loop but not
  // the local array).
  const finalSteps = await prisma.pipelineStep.findMany({
    where: { sessionId },
    orderBy: { stepIndex: 'asc' }
  })
  await prisma.message.create({
    data: {
      sessionId,
      role: 'ASSISTANT',
      content: '',
      type: 'TEXT',
      metadata: {
        pipelineProgress: true,
        isPartialUpdate: false,
        mode,
        steps: finalSteps.map(s => ({
          stepName: s.stepName,
          status: s.status,
          score: s.score ?? null,
        })),
        templateScore,
      },
    }
  })

  // ── F1: Generate and persist AI summary ───────────────────────────────────
  try {
    const reqJson = JSON.parse(previousOutputs['REQUIREMENTS_ANALYSIS'] || '{}')
    const reqSummary: string = reqJson.summary || reqJson.businessGoal || ''
    const componentLabels = componentRegistry.map(c => c.label).slice(0, 8)
    if (reqSummary && componentLabels.length > 0) {
      const summaryResp = await getOpenAIClient().chat.completions.create({
        model: getModel(),
        messages: [
          { role: 'system', content: SUMMARY_SYSTEM },
          { role: 'user', content: SUMMARY_USER(reqSummary, componentLabels, templateScore) },
        ],
        max_tokens: 200,
      })
      const summaryText = summaryResp.choices[0]?.message?.content?.trim() || ''
      if (summaryText) {
        // Persist to DB so it survives loadSession() calls
        await prisma.message.create({
          data: { sessionId, role: 'ASSISTANT', content: summaryText, type: 'TEXT' }
        })
        send({ type: 'template_summary', summaryText })
      }
    }
  } catch { /* summary is best-effort, never fail the pipeline */ }

  // Notify client to switch preview panel to the generated template
  send({ type: 'template_ready', templateId: template.id })

  // ── Persist TEMPLATE_CARD (at most one per session) ──────────────────────
  // Must be saved BEFORE pipeline_complete because that event triggers
  // loadSession() which reads messages from DB.
  // On repeated full-regen runs for the same session the template is upserted
  // (same ID) so we only need one TEMPLATE_CARD message; skip creation if it
  // already exists.
  const existingCard = await prisma.message.findFirst({
    where: { sessionId, type: 'TEMPLATE_CARD' },
  })
  if (!existingCard) {
    await prisma.message.create({
      data: {
        sessionId,
        role: 'ASSISTANT',
        content: '',
        type: 'TEMPLATE_CARD',
        metadata: { templateId: template.id },
      }
    })
  }

  send({ type: 'pipeline_complete' })
}

