import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const steps = await prisma.pipelineStep.findMany({
    where: { sessionId: params.id },
    orderBy: { stepIndex: 'asc' }
  })
  return NextResponse.json(steps)
}
