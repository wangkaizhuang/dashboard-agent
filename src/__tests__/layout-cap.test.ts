/**
 * Tests for capLayoutLinkage (src/lib/ai/layout-cap.ts): bounds the number of
 * controlled (controlledBy) components, syncing any filter's `controls` array,
 * to keep MOCK_DATA / TEMPLATE_GENERATION within the time budget.
 */
import { describe, it, expect } from 'vitest'
import { capLayoutLinkage } from '@/lib/ai/layout-cap'

const layout = (controlledIds: string[]) => JSON.stringify({
  areas: [{
    components: [
      { id: 'flt', type: 'date_filter', controls: [...controlledIds] },
      ...controlledIds.map(id => ({ id, type: 'metric_card', controlledBy: 'flt' })),
    ],
  }],
})

describe('capLayoutLinkage', () => {
  it('leaves the layout unchanged when controlled count <= max', () => {
    const s = layout(['a', 'b', 'c'])
    expect(capLayoutLinkage(s, 6)).toBe(s)
  })

  it('caps controlled components and syncs the filter controls', () => {
    const out = JSON.parse(capLayoutLinkage(layout(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']), 6))
    const comps = out.areas[0].components as Array<{ type: string; controlledBy?: string; controls?: string[] }>
    expect(comps.filter(c => c.controlledBy).length).toBe(6)        // only 6 stay controlled
    expect(comps.find(c => c.type === 'date_filter')!.controls!.length).toBe(6) // controls synced
    expect(comps.length).toBe(9)                                    // nothing dropped (1 filter + 8 cards)
  })

  it('returns input unchanged on parse error', () => {
    expect(capLayoutLinkage('not json', 6)).toBe('not json')
  })
})
