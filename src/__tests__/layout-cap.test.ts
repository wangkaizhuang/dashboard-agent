/**
 * Tests for capLayout (src/lib/ai/layout-cap.ts): hard-bounds total components
 * and controlled (controlledBy) components, cleaning dangling references — to keep
 * MOCK_DATA / TEMPLATE_GENERATION within the time budget.
 */
import { describe, it, expect } from 'vitest'
import { capLayout } from '@/lib/ai/layout-cap'

type Comp = { id: string; type?: string; controlledBy?: string; controls?: string[] }
const layout = (controlledIds: string[], extra: Comp[] = []) => JSON.stringify({
  areas: [{
    components: [
      { id: 'flt', type: 'date_filter', controls: [...controlledIds] },
      ...controlledIds.map(id => ({ id, type: 'metric_card', controlledBy: 'flt' })),
      ...extra,
    ],
  }],
})

const comps = (json: string): Comp[] =>
  (JSON.parse(json).areas as Array<{ components: Comp[] }>).flatMap(a => a.components)

describe('capLayout', () => {
  it('leaves a small layout unchanged', () => {
    const s = layout(['a', 'b', 'c'])
    expect(capLayout(s, 14, 6)).toBe(s)
  })

  it('caps controlled components to max and syncs the filter controls', () => {
    const out = comps(capLayout(layout(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']), 14, 6))
    expect(out.filter(c => c.controlledBy).length).toBe(6)
    expect(out.find(c => c.type === 'date_filter')!.controls!.length).toBe(6)
    expect(out.length).toBe(9) // nothing dropped by the component cap (only 9 total)
  })

  it('caps total components, dropping the excess', () => {
    const extras: Comp[] = Array.from({ length: 20 }, (_, i) => ({ id: `x${i}`, type: 'card' }))
    const out = comps(capLayout(layout([], extras), 14, 6))
    expect(out.length).toBe(14)
  })

  it('removes dropped ids from controls arrays', () => {
    // 16 controlled cards → total 17 (filter + 16); cap to 14 keeps filter + first 13 cards
    const ids = Array.from({ length: 16 }, (_, i) => `c${i}`)
    const out = comps(capLayout(layout(ids), 14, 6))
    expect(out.length).toBe(14)
    const ctrl = out.find(c => c.type === 'date_filter')!.controls!
    // controls must only reference still-present, still-controlled ids
    const present = new Set(out.map(c => c.id))
    expect(ctrl.every(id => present.has(id))).toBe(true)
    expect(ctrl.length).toBeLessThanOrEqual(6)
  })

  it('returns input unchanged on parse error', () => {
    expect(capLayout('not json', 14, 6)).toBe('not json')
  })
})
