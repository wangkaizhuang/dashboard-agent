/**
 * Tests for src/app/api/sessions/route.ts
 *
 * Covers:
 * - GET /api/sessions filters out sessions with no messages
 * - GET /api/sessions returns sessions with messages
 * - POST /api/sessions creates a session with correct mode
 * - POST /api/sessions defaults to QUICK mode
 * - Mode in the body is persisted to the new session
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Prisma
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    session: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}))

// Mock next/server to avoid Next.js internals
vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => ({
      json: async () => data,
      status: init?.status ?? 200,
    }),
  },
}))

import { prisma } from '@/lib/db/prisma'

const mockPrisma = prisma as typeof prisma & {
  session: {
    findMany: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/sessions — session filtering', () => {
  it('calls prisma.session.findMany with messages: { some: {} } filter', async () => {
    mockPrisma.session.findMany.mockResolvedValue([])

    const { GET } = await import('@/app/api/sessions/route')
    await GET()

    expect(mockPrisma.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { messages: { some: {} } },
      })
    )
  })

  it('orders sessions by updatedAt desc', async () => {
    mockPrisma.session.findMany.mockResolvedValue([])

    const { GET } = await import('@/app/api/sessions/route')
    await GET()

    expect(mockPrisma.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { updatedAt: 'desc' },
      })
    )
  })

  it('returns the sessions from prisma', async () => {
    const fakeSessions = [
      { id: 'sess-1', title: '对话一', mode: 'QUICK', status: 'ACTIVE' },
      { id: 'sess-2', title: '对话二', mode: 'THINK', status: 'COMPLETED' },
    ]
    mockPrisma.session.findMany.mockResolvedValue(fakeSessions)

    const { GET } = await import('@/app/api/sessions/route')
    const res = await GET()
    const data = await res.json()

    expect(data).toEqual(fakeSessions)
  })

  it('returns empty array when all sessions have no messages', async () => {
    // Prisma WHERE clause handles this — route just returns what prisma gives
    mockPrisma.session.findMany.mockResolvedValue([])

    const { GET } = await import('@/app/api/sessions/route')
    const res = await GET()
    const data = await res.json()

    expect(data).toEqual([])
  })
})

describe('POST /api/sessions — session creation', () => {
  it('creates session with specified mode', async () => {
    mockPrisma.session.create.mockResolvedValue({ id: 'new-sess', title: '新对话', mode: 'THINK' })

    const { POST } = await import('@/app/api/sessions/route')
    const request = new Request('http://localhost/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'THINK' }),
    })
    await POST(request)

    expect(mockPrisma.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ mode: 'THINK' }),
    })
  })

  it('defaults to QUICK mode when mode is not specified', async () => {
    mockPrisma.session.create.mockResolvedValue({ id: 'new-sess', title: '新对话', mode: 'QUICK' })

    const { POST } = await import('@/app/api/sessions/route')
    const request = new Request('http://localhost/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    await POST(request)

    expect(mockPrisma.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ mode: 'QUICK' }),
    })
  })

  it('creates session with title "新对话"', async () => {
    mockPrisma.session.create.mockResolvedValue({ id: 'new-sess', title: '新对话', mode: 'QUICK' })

    const { POST } = await import('@/app/api/sessions/route')
    const request = new Request('http://localhost/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ mode: 'QUICK' }),
    })
    await POST(request)

    expect(mockPrisma.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ title: '新对话', status: 'ACTIVE' }),
    })
  })

  it('handles malformed request body gracefully', async () => {
    mockPrisma.session.create.mockResolvedValue({ id: 'new-sess', title: '新对话', mode: 'QUICK' })

    const { POST } = await import('@/app/api/sessions/route')
    const request = new Request('http://localhost/api/sessions', {
      method: 'POST',
      body: 'not-json',
    })
    // Should not throw
    await expect(POST(request)).resolves.toBeDefined()
    // Defaults to QUICK
    expect(mockPrisma.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ mode: 'QUICK' }),
    })
  })
})
