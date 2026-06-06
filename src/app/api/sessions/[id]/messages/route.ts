import { prisma } from '@/lib/db/prisma'
import { createSSEStream } from '@/lib/utils/sse'
import { runPipeline } from '@/lib/ai/pipeline'
import { getRuntimeConfig } from '@/lib/config/runtime'
import type { Mode, Annotation } from '@/types'

export const maxDuration = 800 // TEMPLATE_GENERATION can stream for minutes; give headroom.
                               // (Enforced only on Vercel; self-hosted Node has no function timeout.)

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { content, mode: requestedMode, annotations } = await request.json()
  const sessionId = params.id

  // Load session to get stored mode
  const session = await prisma.session.findUnique({ where: { id: sessionId } })
  if (!session) return new Response('Not found', { status: 404 })

  // If the client sends a mode (from the mode selector), honour it and persist it.
  // This lets the user switch modes mid-session and have the new mode take effect
  // immediately on the next pipeline run.
  const effectiveMode: Mode = (requestedMode as Mode) || session.mode
  if (requestedMode && requestedMode !== session.mode) {
    await prisma.session.update({ where: { id: sessionId }, data: { mode: requestedMode as Mode } })
  }

  // Save user message
  await prisma.message.create({
    data: { sessionId, role: 'USER', content, type: 'TEXT' }
  })

  const scoreThreshold = getRuntimeConfig().qualityScoreThreshold

  return createSSEStream(async (send) => {
    try {
      await runPipeline(sessionId, content, effectiveMode, scoreThreshold, send, (annotations ?? []) as Annotation[])
    } finally {
      // Only inject a SCORE_REPORT card if the pipeline paused due to quality failure.
      // Successful completion shows the TEMPLATE_CARD via loadSession() on the frontend.
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
