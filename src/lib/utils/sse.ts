import type { SSEEvent } from '@/types'

export function createSSEStream(
  handler: (send: (event: SSEEvent) => void) => Promise<void>
): Response {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false

      const send = (event: SSEEvent) => {
        if (closed) return
        try {
          const data = `data: ${JSON.stringify(event)}\n\n`
          controller.enqueue(encoder.encode(data))
        } catch {
          closed = true
        }
      }

      const closeStream = () => {
        if (closed) return
        closed = true
        try {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch { /* already closed */ }
      }

      try {
        await handler(send)
      } catch (err) {
        send({ type: 'error', message: (err as Error).message })
      } finally {
        closeStream()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
