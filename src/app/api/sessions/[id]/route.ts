import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await prisma.session.findUnique({
    where: { id: params.id },
    include: { messages: { orderBy: { createdAt: 'asc' } }, steps: { orderBy: { stepIndex: 'asc' } }, template: true }
  })
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(session)
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  await prisma.session.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
