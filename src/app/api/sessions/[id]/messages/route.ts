import { prisma } from '@/lib/db/prisma'
import { createSSEStream } from '@/lib/utils/sse'
import { runPipeline } from '@/lib/ai/pipeline'

export const maxDuration = 300 // 5 minute timeout

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { content } = await request.json()
  const sessionId = params.id

  // Load session to get mode
  const session = await prisma.session.findUnique({ where: { id: sessionId } })
  if (!session) return new Response('Not found', { status: 404 })

  // Save user message
  await prisma.message.create({
    data: { sessionId, role: 'USER', content, type: 'TEXT' }
  })

  const scoreThreshold = parseInt(process.env.QUALITY_SCORE_THRESHOLD || '30')

  return createSSEStream(async (send, close) => {
    try {
      await runPipeline(sessionId, content, session.mode, scoreThreshold, send)
    } finally {
      // Save assistant summary message
      const steps = await prisma.pipelineStep.findMany({
        where: { sessionId }, orderBy: { stepIndex: 'asc' }
      })
      const summary = steps.map(s => `[${s.stepName}] ${s.content.slice(0, 200)}`).join('\n')
      if (summary) {
        await prisma.message.create({
          data: { sessionId, role: 'ASSISTANT', content: summary, type: 'TEXT' }
        })
      }
      close()
    }
  })
}
