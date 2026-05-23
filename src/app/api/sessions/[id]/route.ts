import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await prisma.session.findUnique({
    where: { id: params.id },
    include: { messages: { orderBy: { createdAt: 'asc' } }, steps: { orderBy: { stepIndex: 'asc' } }, template: true }
  })
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Include unanswered expert questions as synthetic EXPERT_QUESTION messages
  const expertQuestions = await prisma.expertQuestion.findMany({
    where: { sessionId: params.id },
    orderBy: { createdAt: 'asc' }
  })

  const expertMessages = expertQuestions.map(q => ({
    id: `eq-${q.id}`,
    sessionId: q.sessionId,
    role: 'ASSISTANT' as const,
    content: '',
    type: 'EXPERT_QUESTION' as const,
    metadata: {
      id: q.id,
      sessionId: q.sessionId,
      stepIndex: q.stepIndex,
      question: q.question,
      options: q.options,
      answered: q.answered,
      answer: q.answer,
      customText: q.customText,
      createdAt: q.createdAt.toISOString(),
    },
    createdAt: q.createdAt.toISOString(),
  }))

  // Merge expert question messages into the message list (sorted by createdAt)
  const allMessages = [...session.messages, ...expertMessages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )

  return NextResponse.json({ ...session, messages: allMessages })
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  await prisma.session.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
