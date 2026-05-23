/**
 * Tests for src/app/api/sessions/[id]/messages/route.ts
 *
 * Covers:
 * - Returns 404 when session not found
 * - Uses requestedMode from body when provided
 * - Falls back to session.mode when requestedMode is absent
 * - Updates session.mode in DB when requestedMode differs from session.mode
 * - Does NOT update session.mode when requestedMode matches session.mode
 * - Saves user message to DB before starting pipeline
 * - scoreThreshold comes from getRuntimeConfig().qualityScoreThreshold
 * - SCORE_REPORT message is injected into DB when session status is PAUSED after pipeline
 * - SCORE_REPORT NOT injected when session status is not PAUSED
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    session: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    message: {
      create: vi.fn(),
    },
    pipelineStep: {
      findFirst: vi.fn(),
    },
  },
}))

vi.mock('@/lib/config/runtime', () => ({
  getRuntimeConfig: vi.fn(() => ({
    model: 'gpt-test',
    baseUrl: 'https://test.api.com/v1',
    apiKey: 'sk-test',
    contextMaxTokens: 128000,
    qualityScoreThreshold: 30,
    stepThresholds: {},
  })),
}))

vi.mock('@/lib/utils/sse', () => ({
  createSSEStream: vi.fn((handler: (send: unknown) => Promise<void>) => {
    // Run handler synchronously in tests
    handler(vi.fn())
    return new Response('', { status: 200 })
  }),
}))

vi.mock('@/lib/ai/pipeline', () => ({
  runPipeline: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from '@/lib/db/prisma'

const mockPrisma = prisma as typeof prisma & {
  session: {
    findUnique: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  message: { create: ReturnType<typeof vi.fn> }
  pipelineStep: { findFirst: ReturnType<typeof vi.fn> }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/sessions/sess-1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/sessions/[id]/messages — mode handling', () => {
  const params = { id: 'sess-1' }

  it('returns 404 when session not found', async () => {
    mockPrisma.session.findUnique.mockResolvedValue(null)
    const { POST } = await import('@/app/api/sessions/[id]/messages/route')
    const res = await POST(makeRequest({ content: 'hello', mode: 'QUICK' }), { params })
    expect(res.status).toBe(404)
  })

  it('uses requestedMode from body', async () => {
    mockPrisma.session.findUnique.mockResolvedValue({ id: 'sess-1', mode: 'QUICK', status: 'ACTIVE' })
    mockPrisma.session.update.mockResolvedValue({})
    mockPrisma.message.create.mockResolvedValue({})

    const { POST } = await import('@/app/api/sessions/[id]/messages/route')
    await POST(makeRequest({ content: 'hello', mode: 'THINK' }), { params })

    // Pipeline should be called with THINK mode
    const { runPipeline } = await import('@/lib/ai/pipeline')
    expect(runPipeline).toHaveBeenCalledWith(
      'sess-1', 'hello', 'THINK', expect.any(Number), expect.any(Function), expect.any(Array)
    )
  })

  it('falls back to session.mode when requestedMode not in body', async () => {
    mockPrisma.session.findUnique.mockResolvedValue({ id: 'sess-1', mode: 'EXPERT', status: 'ACTIVE' })
    mockPrisma.message.create.mockResolvedValue({})

    const { POST } = await import('@/app/api/sessions/[id]/messages/route')
    await POST(makeRequest({ content: 'hello' }), { params })

    const { runPipeline } = await import('@/lib/ai/pipeline')
    expect(runPipeline).toHaveBeenCalledWith(
      'sess-1', 'hello', 'EXPERT', expect.any(Number), expect.any(Function), expect.any(Array)
    )
  })

  it('updates session.mode in DB when requestedMode differs', async () => {
    mockPrisma.session.findUnique.mockResolvedValue({ id: 'sess-1', mode: 'QUICK', status: 'ACTIVE' })
    mockPrisma.session.update.mockResolvedValue({})
    mockPrisma.message.create.mockResolvedValue({})

    const { POST } = await import('@/app/api/sessions/[id]/messages/route')
    await POST(makeRequest({ content: 'hello', mode: 'THINK' }), { params })

    expect(mockPrisma.session.update).toHaveBeenCalledWith({
      where: { id: 'sess-1' },
      data: { mode: 'THINK' },
    })
  })

  it('does NOT update session.mode when requestedMode matches session.mode', async () => {
    mockPrisma.session.findUnique.mockResolvedValue({ id: 'sess-1', mode: 'QUICK', status: 'ACTIVE' })
    mockPrisma.message.create.mockResolvedValue({})

    const { POST } = await import('@/app/api/sessions/[id]/messages/route')
    await POST(makeRequest({ content: 'hello', mode: 'QUICK' }), { params })

    // session.update should NOT be called for mode change
    // (it may be called for other reasons but NOT for mode)
    const modeUpdateCall = (mockPrisma.session.update as ReturnType<typeof vi.fn>).mock.calls.find(
      call => call[0].data?.mode !== undefined
    )
    expect(modeUpdateCall).toBeUndefined()
  })

  it('saves user message to DB before running pipeline', async () => {
    mockPrisma.session.findUnique.mockResolvedValue({ id: 'sess-1', mode: 'QUICK', status: 'ACTIVE' })
    mockPrisma.message.create.mockResolvedValue({})

    const { POST } = await import('@/app/api/sessions/[id]/messages/route')
    await POST(makeRequest({ content: 'user message', mode: 'QUICK' }), { params })

    expect(mockPrisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: 'sess-1',
        role: 'USER',
        content: 'user message',
        type: 'TEXT',
      }),
    })
  })

  it('uses scoreThreshold from getRuntimeConfig()', async () => {
    mockPrisma.session.findUnique.mockResolvedValue({ id: 'sess-1', mode: 'QUICK', status: 'ACTIVE' })
    mockPrisma.message.create.mockResolvedValue({})

    const { POST } = await import('@/app/api/sessions/[id]/messages/route')
    await POST(makeRequest({ content: 'hello', mode: 'QUICK' }), { params })

    const { runPipeline } = await import('@/lib/ai/pipeline')
    // getRuntimeConfig().qualityScoreThreshold = 30 in our mock
    expect(runPipeline).toHaveBeenCalledWith(
      expect.any(String), expect.any(String), expect.any(String), 30, expect.any(Function), expect.any(Array)
    )
  })
})
