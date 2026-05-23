import { prisma } from '@/lib/db/prisma'
import { stripDcMarkers, injectDcTracker } from '@/lib/utils/dc-tracker'

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const template = await prisma.template.findUnique({ where: { id: params.id } })
  if (!template) return new Response('Not found', { status: 404 })

  // 1. Strip internal boundary markers (dc:id:start/end comments)
  // 2. Inject postMessage tracking script for annotation mode
  const html = injectDcTracker(stripDcMarkers(template.htmlContent))

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    }
  })
}
