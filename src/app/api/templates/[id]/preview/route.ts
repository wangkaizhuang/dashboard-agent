import { prisma } from '@/lib/db/prisma'
import { stripDcMarkers, injectDcTracker, patchTemplateGlobals, injectLinkageFix, injectChartHeightFix } from '@/lib/utils/dc-tracker'

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const template = await prisma.template.findUnique({ where: { id: params.id } })
  if (!template) return new Response('Not found', { status: 404 })

  // 1. Strip internal boundary markers (dc:id:start/end comments)
  // 2. Ensure DC_CHARTS/CHART_COLORS/AXIS_STYLE/TOOLTIP_STYLE are declared in <head>
  //    (retroactive fix for templates generated before the prompt fix)
  // 3. Repair F3 linkage for pre-fix templates (alias data-dc -> id)
  // 4. Rescue collapsed (zero-height) chart mounts in low-quality templates
  // 5. Inject postMessage tracking script for annotation mode
  const html = injectDcTracker(injectChartHeightFix(injectLinkageFix(patchTemplateGlobals(stripDcMarkers(template.htmlContent)))))

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    }
  })
}
