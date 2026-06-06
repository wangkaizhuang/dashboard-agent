import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'

/** Record the user's intent choice for an "unrelated request" prompt.
 *  The running pipeline polls the message's metadata.intentDecision. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { messageId, choice } = await request.json()
  if (!messageId || (choice !== 'continue' && choice !== 'regenerate')) {
    return NextResponse.json({ error: 'invalid choice' }, { status: 400 })
  }
  const msg = await prisma.message.findUnique({ where: { id: messageId } })
  if (!msg || msg.sessionId !== params.id) {
    return NextResponse.json({ error: 'message not found' }, { status: 404 })
  }
  const meta = (msg.metadata as Record<string, unknown>) || {}
  await prisma.message.update({
    where: { id: messageId },
    data: {
      metadata: {
        ...meta,
        intentDecision: choice,
        // "regenerate" opens a fresh context segment at this message.
        ...(choice === 'regenerate' ? { contextBoundary: true } : {}),
      } as never,
    },
  })
  return NextResponse.json({ ok: true })
}
