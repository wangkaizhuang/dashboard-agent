/**
 * Tests for src/lib/utils/sse.ts
 *
 * Covers:
 * - Stream returns correct Content-Type headers
 * - Events are encoded as SSE format (data: {...}\n\n)
 * - [DONE] sentinel is appended after handler completes
 * - Heartbeat fires at 15-second intervals
 * - Heartbeat is cleared after handler completes (no leak)
 * - Error events are sent when handler throws
 * - Stream closes cleanly after handler returns
 * - Sending after stream closed is a no-op (no throw)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSSEStream } from '@/lib/utils/sse'
import type { SSEEvent } from '@/types'

// Helper: collect all chunks from a Response body as a single string
async function drainResponse(response: Response): Promise<string> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let result = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    result += decoder.decode(value, { stream: true })
  }
  return result
}

// Helper: parse SSE lines into event objects (filters heartbeat and [DONE])
function parseSSEEvents(raw: string): SSEEvent[] {
  return raw
    .split('\n\n')
    .filter(block => block.startsWith('data: ') && !block.includes('[DONE]'))
    .map(block => JSON.parse(block.replace('data: ', '').trim()))
}

describe('createSSEStream — basic mechanics', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('returns a Response with text/event-stream content type', async () => {
    const res = createSSEStream(async () => {})
    expect(res.headers.get('Content-Type')).toBe('text/event-stream')
    expect(res.headers.get('Cache-Control')).toBe('no-cache')
  })

  it('encodes events in SSE format', async () => {
    const res = createSSEStream(async (send) => {
      send({ type: 'step_complete', stepIndex: 0 })
    })
    const raw = await drainResponse(res)
    expect(raw).toContain('data: {"type":"step_complete","stepIndex":0}')
  })

  it('appends [DONE] sentinel at the end', async () => {
    const res = createSSEStream(async () => {})
    const raw = await drainResponse(res)
    expect(raw).toContain('data: [DONE]')
  })

  it('sends multiple events in order', async () => {
    const events: SSEEvent[] = [
      { type: 'step_complete', stepIndex: 0 },
      { type: 'step_complete', stepIndex: 1 },
      { type: 'pipeline_complete' },
    ]
    const res = createSSEStream(async (send) => {
      for (const e of events) send(e)
    })
    const raw = await drainResponse(res)
    const parsed = parseSSEEvents(raw)
    expect(parsed).toEqual(events)
  })

  it('sends error event when handler throws', async () => {
    const res = createSSEStream(async () => {
      throw new Error('pipeline exploded')
    })
    const raw = await drainResponse(res)
    const parsed = parseSSEEvents(raw)
    expect(parsed.some(e => e.type === 'error' && (e as { message?: string }).message === 'pipeline exploded')).toBe(true)
  })
})

describe('createSSEStream — heartbeat', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('sends heartbeat events at 15-second intervals', async () => {
    let resolveDone!: () => void
    const done = new Promise<void>(r => { resolveDone = r })

    const chunks: string[] = []

    // Create stream that waits 45 seconds (3 heartbeats)
    const res = createSSEStream(async () => {
      await new Promise<void>(resolve => {
        setTimeout(resolve, 45_000)
      })
    })

    // Collect chunks in background
    const collect = async () => {
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done: d, value } = await reader.read()
        if (d) { resolveDone(); break }
        chunks.push(decoder.decode(value))
      }
    }
    const collecting = collect()

    // Advance time by 45s (triggers 3 heartbeats)
    vi.advanceTimersByTime(45_000)
    await collecting

    const allText = chunks.join('')
    const heartbeats = (allText.match(/"type":"heartbeat"/g) || []).length
    expect(heartbeats).toBeGreaterThanOrEqual(3)
  })

  it('does NOT send heartbeats after handler completes', async () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval')

    const res = createSSEStream(async () => {
      // Fast handler — completes immediately
    })
    await drainResponse(res)

    // clearInterval must have been called (heartbeat cleanup)
    expect(clearIntervalSpy).toHaveBeenCalled()
    clearIntervalSpy.mockRestore()
  })
})

describe('createSSEStream — edge cases', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('no error when handler never calls send', async () => {
    const res = createSSEStream(async () => { /* no sends */ })
    const raw = await drainResponse(res)
    expect(raw).toContain('[DONE]')
  })

  it('events after [DONE] are not sent (closed stream)', async () => {
    // Send is called once, then handler resolves — any later sends should be no-ops
    let capturedSend!: (e: SSEEvent) => void
    const res = createSSEStream(async (send) => {
      capturedSend = send
      send({ type: 'step_complete', stepIndex: 0 })
    })
    const raw = await drainResponse(res)

    // After draining, calling send on a closed stream should not throw
    expect(() => capturedSend({ type: 'pipeline_complete' })).not.toThrow()

    // And the post-close event is not in the stream
    expect(raw.match(/"type":"pipeline_complete"/g)?.length ?? 0).toBe(0)
  })

  it('two independent streams do not share state', async () => {
    const res1 = createSSEStream(async (send) => { send({ type: 'step_complete', stepIndex: 0 }) })
    const res2 = createSSEStream(async (send) => { send({ type: 'pipeline_complete' }) })

    const [raw1, raw2] = await Promise.all([drainResponse(res1), drainResponse(res2)])
    expect(raw1).toContain('step_complete')
    expect(raw1).not.toContain('pipeline_complete')
    expect(raw2).toContain('pipeline_complete')
    expect(raw2).not.toContain('step_complete')
  })
})
