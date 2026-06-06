import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'
import { getOpenAIClient, getModel } from '@/lib/ai/client'
import { sliceToActiveContext } from '@/lib/ai/context'
import { FORK_TITLE_SYSTEM, FORK_TITLE_USER } from '@/lib/ai/prompts/fork-title'

/**
 * Fork a new session from a node: copies the conversation history up to (and
 * including) the given message — preserving context-boundary markers — plus the
 * current template and completed steps, and titles the new session with an
 * LLM summary of the effective (since-last-boundary) context.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { fromMessageId } = await request.json().catch(() => ({}))

  const source = await prisma.session.findUnique({
    where: { id: params.id },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
      steps: { orderBy: { stepIndex: 'asc' } },
      template: true,
    },
  })
  if (!source) return NextResponse.json({ error: 'session not found' }, { status: 404 })

  const fromMsg = fromMessageId
    ? source.messages.find(m => m.id === fromMessageId)
    : source.messages[source.messages.length - 1]
  if (!fromMsg) return NextResponse.json({ error: 'message not found' }, { status: 404 })

  // History up to (and including) the fork node.
  const copied = source.messages.filter(m => m.createdAt <= fromMsg.createdAt)

  // Effective context = since the last boundary within the copied range.
  const active = sliceToActiveContext(
    copied.map(m => ({ ...m, metadata: m.metadata as Record<string, unknown> | null })),
  )

  // Title from the effective context (fail soft → derive from source title).
  let title = `${source.title}（分叉）`
  try {
    const ctx = active.map(m => `${m.role === 'USER' ? '用户' : 'AI'}: ${m.content}`).join('\n').slice(0, 2000)
    if (ctx.trim()) {
      const resp = await getOpenAIClient().chat.completions.create({
        model: getModel(),
        messages: [
          { role: 'system', content: FORK_TITLE_SYSTEM },
          { role: 'user', content: FORK_TITLE_USER(ctx) },
        ],
        max_tokens: 40,
      })
      const t = resp.choices[0]?.message?.content?.trim().replace(/[「」"'。.\n]/g, '')
      if (t) title = t.slice(0, 24)
    }
  } catch { /* keep fallback title */ }

  const newSession = await prisma.session.create({
    data: { title, mode: source.mode, status: source.status },
  })

  // Copy the template first so we can remap TEMPLATE_CARD references.
  let newTemplateId: string | null = null
  if (source.template) {
    const t = await prisma.template.create({
      data: {
        sessionId: newSession.id,
        htmlContent: source.template.htmlContent,
        score: source.template.score,
        components: source.template.components as never,
      },
    })
    newTemplateId = t.id
  }

  // Copy messages (preserve order + metadata incl. contextBoundary; remap the
  // template-card id to the forked template so the preview is self-contained).
  for (const m of copied) {
    let metadata = m.metadata as Record<string, unknown> | null
    if (m.type === 'TEMPLATE_CARD' && newTemplateId && metadata?.templateId === source.template?.id) {
      metadata = { ...metadata, templateId: newTemplateId }
    }
    await prisma.message.create({
      data: {
        sessionId: newSession.id,
        role: m.role,
        content: m.content,
        type: m.type,
        metadata: metadata as never,
        createdAt: m.createdAt, // preserve relative order
      },
    })
  }

  // Copy completed step snapshot so the fork can keep editing the dashboard.
  for (const s of source.steps) {
    await prisma.pipelineStep.create({
      data: {
        sessionId: newSession.id,
        stepIndex: s.stepIndex,
        stepName: s.stepName,
        status: s.status,
        content: s.content,
        score: s.score,
        reasoning: s.reasoning,
      },
    })
  }

  return NextResponse.json({ id: newSession.id, title })
}
