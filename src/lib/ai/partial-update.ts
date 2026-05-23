import { prisma } from '@/lib/db/prisma'
import { getOpenAIClient, getModel } from '@/lib/ai/client'
import { INTENT_SYSTEM, INTENT_USER, PARTIAL_HTML_SYSTEM, PARTIAL_HTML_USER } from '@/lib/ai/prompts/partial-update'
import { MOCKDATA_SYSTEM, MOCKDATA_USER } from '@/lib/ai/prompts/mockdata'
import type { SSEEvent, Annotation } from '@/types'

type SendFn = (event: SSEEvent) => void

/** Extract component HTML between dc boundary markers */
export function extractComponentHtml(html: string, componentId: string): string | null {
  const startMarker = `<!-- dc:${componentId}:start -->`
  const endMarker = `<!-- dc:${componentId}:end -->`
  const startIdx = html.indexOf(startMarker)
  const endIdx = html.indexOf(endMarker)
  if (startIdx === -1 || endIdx === -1) return null
  // Return content between markers (exclusive)
  return html.slice(startIdx + startMarker.length, endIdx).trim()
}

/** Replace a component's HTML between its dc boundary markers */
export function replaceComponentHtml(
  html: string,
  componentId: string,
  newComponentHtml: string,
): { result: string; success: boolean } {
  const startMarker = `<!-- dc:${componentId}:start -->`
  const endMarker = `<!-- dc:${componentId}:end -->`
  const startIdx = html.indexOf(startMarker)
  const endIdx = html.indexOf(endMarker)
  if (startIdx === -1 || endIdx === -1) {
    return { result: html, success: false }
  }
  const before = html.slice(0, startIdx + startMarker.length)
  const after = html.slice(endIdx)
  return {
    result: `${before}\n${newComponentHtml}\n${after}`,
    success: true,
  }
}

export async function runPartialUpdate(
  sessionId: string,
  userMessage: string,
  annotations: Annotation[],
  send: SendFn,
): Promise<void> {
  const client = getOpenAIClient()
  const model = getModel()

  // Load current template and session requirements
  const [template, session] = await Promise.all([
    prisma.template.findUnique({ where: { sessionId } }),
    prisma.session.findUnique({
      where: { id: sessionId },
      include: { steps: { orderBy: { stepIndex: 'asc' } } },
    }),
  ])

  if (!template || !session) throw new Error('Session or template not found for partial update')

  const requirementsStep = session.steps.find(s => s.stepName === 'REQUIREMENTS_ANALYSIS' && s.status === 'COMPLETED')
  const layoutStep = session.steps.find(s => s.stepName === 'LAYOUT_PLANNING' && s.status === 'COMPLETED')
  let requirementsSummary = 'Unknown dashboard'
  try {
    const req = JSON.parse(requirementsStep?.content || '{}')
    requirementsSummary = req.summary || req.businessGoal || requirementsSummary
  } catch { /* ignore */ }

  send({ type: 'step_start', stepIndex: 0, stepName: 'REQUIREMENTS_ANALYSIS' })

  // Step 1: Intent recognition
  const intentResp = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: INTENT_SYSTEM },
      { role: 'user', content: INTENT_USER(userMessage, annotations, requirementsSummary) },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 300,
  })

  let intent: {
    isPartialUpdate: boolean
    targetComponents?: string[]
    changeType?: 'style' | 'data' | 'structure'
    needsMockDataUpdate?: boolean
    intent?: string
  } = { isPartialUpdate: false }

  try {
    intent = JSON.parse(intentResp.choices[0]?.message?.content || '{}')
  } catch { /* fallback to full regen */ }

  send({ type: 'step_complete', stepIndex: 0 })

  // If not a partial update, signal caller to run full pipeline
  if (!intent.isPartialUpdate || !intent.targetComponents?.length) {
    throw new Error('FULL_REGEN_REQUIRED')
  }

  // Step 2 (optional): regenerate mock data for data-type changes
  const updatedMockByComponent: Record<string, string> = {}
  if (intent.needsMockDataUpdate && layoutStep?.content) {
    send({ type: 'step_start', stepIndex: 3, stepName: 'MOCK_DATA' })
    try {
      const mockResp = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: MOCKDATA_SYSTEM },
          { role: 'user', content: MOCKDATA_USER(layoutStep.content, requirementsSummary) +
            `\n\n只需要为以下组件重新生成数据: ${intent.targetComponents.join(', ')}` },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2000,
      })
      const newMock = JSON.parse(mockResp.choices[0]?.message?.content || '{}')
      intent.targetComponents.forEach(id => {
        try {
          const layout = JSON.parse(layoutStep.content)
          const areas: Array<{ components?: Array<{ id: string; dataKey?: string }> }> = layout.areas || []
          const compDef = areas.flatMap(a => a.components || []).find(c => c.id === id)
          if (compDef?.dataKey && newMock[compDef.dataKey]) {
            updatedMockByComponent[id] = JSON.stringify(newMock[compDef.dataKey])
          }
        } catch { /* ignore */ }
      })
    } catch { /* mock update failed, continue without it */ }
    send({ type: 'step_complete', stepIndex: 3 })
  }

  // Step 3: Generate replacement HTML for each target component
  send({ type: 'step_start', stepIndex: 4, stepName: 'TEMPLATE_GENERATION' })

  let currentHtml = template.htmlContent
  const failedComponents: string[] = []

  for (const componentId of intent.targetComponents) {
    const originalHtml = extractComponentHtml(currentHtml, componentId)
    if (!originalHtml) {
      failedComponents.push(componentId)
      continue
    }

    const ann = annotations.find(a => a.componentId === componentId)
    const componentLabel = ann?.componentLabel || componentId

    try {
      const htmlResp = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: PARTIAL_HTML_SYSTEM },
          { role: 'user', content: PARTIAL_HTML_USER(
              componentId,
              componentLabel,
              originalHtml,
              intent.intent || userMessage,
              updatedMockByComponent[componentId],
          )},
        ],
        max_tokens: 3000,
      })

      const newHtml = htmlResp.choices[0]?.message?.content?.trim() || ''
      if (!newHtml) { failedComponents.push(componentId); continue }

      // Strip any markdown code fences the AI may have added
      const cleaned = newHtml.replace(/^```html?\n?/i, '').replace(/\n?```$/, '')
      const { result, success } = replaceComponentHtml(currentHtml, componentId, cleaned)
      if (!success) { failedComponents.push(componentId); continue }
      currentHtml = result
    } catch {
      failedComponents.push(componentId)
    }
  }

  // If ALL components failed surgical replacement, signal full regen
  if (failedComponents.length > 0 && failedComponents.length === intent.targetComponents.length) {
    throw new Error('FULL_REGEN_REQUIRED')
  }

  // Persist updated HTML
  await prisma.template.update({
    where: { sessionId },
    data: { htmlContent: currentHtml },
  })

  // Save partial-update progress to DB so it persists across loadSession() calls
  await prisma.message.create({
    data: {
      sessionId,
      role: 'ASSISTANT',
      content: '',
      type: 'TEXT',
      metadata: {
        pipelineProgress: true,
        isPartialUpdate: true,
        intent: intent.intent,
        targetComponents: intent.targetComponents,
        changeType: intent.changeType,
        steps: [
          { stepName: 'REQUIREMENTS_ANALYSIS', status: 'COMPLETED', score: null },
          ...(intent.needsMockDataUpdate
            ? [{ stepName: 'MOCK_DATA', status: 'COMPLETED', score: null }]
            : []),
          { stepName: 'TEMPLATE_GENERATION', status: 'COMPLETED', score: null },
        ],
      },
    }
  })

  send({ type: 'step_complete', stepIndex: 4 })
  send({ type: 'template_ready', templateId: template.id })
  send({ type: 'pipeline_complete' })
}
