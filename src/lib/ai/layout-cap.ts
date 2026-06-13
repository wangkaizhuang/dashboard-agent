interface LayoutComponent {
  id?: string
  controlledBy?: string
  controls?: string[]
  [k: string]: unknown
}
interface LayoutArea {
  components?: LayoutComponent[]
  [k: string]: unknown
}
interface Layout {
  areas?: LayoutArea[]
  [k: string]: unknown
}

/**
 * Hard-cap layout complexity, since the LLM doesn't reliably honor the prompt
 * caps (observed 16-18 components / 9 controlled). Complexity is the main driver
 * of TEMPLATE_GENERATION time → timeouts.
 *
 *  1. Total components ≤ maxComponents — keep the first N (filters/KPIs come
 *     first), drop the rest from their areas (empty areas removed).
 *  2. Controlled (controlledBy) components ≤ maxControlled — excess become static.
 *  3. Clean dangling references: strip controlledBy that points to a dropped
 *     component, and remove dropped/over-cap ids from every `controls` array.
 *
 * On any parse error the input is returned unchanged (no-op).
 */
export function capLayout(layoutJson: string, maxComponents = 14, maxControlled = 6): string {
  try {
    const layout = JSON.parse(layoutJson) as Layout
    const areas = layout.areas || []

    // 1. Cap total components — keep the first maxComponents in document order.
    const flat = areas.flatMap(a => a.components || [])
    const dropped = new Set(
      flat.slice(maxComponents).map(c => c.id).filter(Boolean) as string[],
    )
    if (dropped.size > 0) {
      areas.forEach(a => { a.components = (a.components || []).filter(c => !(c.id && dropped.has(c.id))) })
      layout.areas = areas.filter(a => (a.components || []).length > 0)
    }

    // 2. Cap controlled components among those that remain.
    const comps = (layout.areas || []).flatMap(a => a.components || [])
    const controlledDrop = new Set(
      comps.filter(c => c.controlledBy).slice(maxControlled).map(c => c.id).filter(Boolean) as string[],
    )

    // 3. Clean references.
    comps.forEach(c => {
      if (c.id && controlledDrop.has(c.id)) delete c.controlledBy
      if (c.controlledBy && dropped.has(c.controlledBy)) delete c.controlledBy // controller was dropped
      if (Array.isArray(c.controls)) {
        c.controls = c.controls.filter(id => !dropped.has(id) && !controlledDrop.has(id))
      }
    })

    return JSON.stringify(layout)
  } catch {
    return layoutJson
  }
}
