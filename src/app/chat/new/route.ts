import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const mode = (url.searchParams.get('mode') || 'QUICK') as 'QUICK' | 'THINK' | 'EXPERT'

  const session = await prisma.session.create({
    data: { title: '新对话', mode, status: 'ACTIVE' }
  })

  return NextResponse.redirect(new URL(`/chat/${session.id}`, request.url))
}
