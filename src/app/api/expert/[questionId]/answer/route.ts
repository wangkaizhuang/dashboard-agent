import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function POST(request: Request, { params }: { params: { questionId: string } }) {
  const { answer, customText } = await request.json()

  const question = await prisma.expertQuestion.update({
    where: { id: params.questionId },
    data: { answer, customText, answered: true }
  })

  return NextResponse.json(question)
}
