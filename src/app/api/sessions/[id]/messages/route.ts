import { prisma } from '@/lib/db/prisma'
import { createSSEStream } from '@/lib/utils/sse'
import { runPipeline } from '@/lib/ai/pipeline'
import { getRuntimeConfig } from '@/lib/config/runtime'

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

  const scoreThreshold = getRuntimeConfig().qualityScoreThreshold

  return createSSEStream(async (send) => {
    try {
      await runPipeline(sessionId, content, session.mode, scoreThreshold, send)
    } finally {
      // Only show a SCORE_REPORT card if the pipeline was paused due to quality failure.
      // For successful completion, the TEMPLATE_CARD is injected by the frontend via loadSession().
      const finalSession = await prisma.session.findUnique({ where: { id: sessionId } })
      if (finalSession?.status === 'PAUSED') {
        const failedStep = await prisma.pipelineStep.findFirst({
          where: { sessionId, status: 'FAILED' },
          orderBy: { stepIndex: 'asc' }
        })
        if (failedStep) {
          const issuesArr = Array.isArray(failedStep.issues) ? (failedStep.issues as string[]) : []
          await prisma.message.create({
            data: {
              sessionId,
              role: 'ASSISTANT',
              content: '',
              type: 'SCORE_REPORT',
              metadata: {
                stepName: failedStep.stepName,
                score: failedStep.score ?? 0,
                issues: issuesArr,
                threshold: scoreThreshold,
              }
            }
          })
        }
      }
    }
  })
}
