import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function GET() {
  // Only return sessions that have at least one message — sessions with no messages
  // are draft sessions that were never used (e.g. created by an accidental click and
  // never had any conversation). We hide them so the sidebar stays clean.
  const sessions = await prisma.session.findMany({
    where: { messages: { some: {} } },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true, title: true, mode: true, status: true,
      createdAt: true, updatedAt: true,
      _count: { select: { messages: true } }
    }
  })
  return NextResponse.json(sessions)
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const mode = body.mode || 'QUICK'
  const session = await prisma.session.create({
    data: { title: '新对话', mode, status: 'ACTIVE' }
  })
  return NextResponse.json(session, { status: 201 })
}
