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
 * Hard-cap the number of controlled (controlledBy) components in a LAYOUT_PLANNING
 * JSON string. Each controlled component multiplies MOCK_DATA size and
 * TEMPLATE_GENERATION time/length — the main driver of generation timeouts on
 * complex dashboards. The LLM doesn't reliably honor a prompt cap, so we enforce
 * it here: excess components keep rendering but lose their linkage (become static),
 * and any filter's `controls` array is synced to drop the removed ids.
 *
 * On any parse error the input is returned unchanged (no-op).
 */
export function capLayoutLinkage(layoutJson: string, max = 6): string {
  try {
    const layout = JSON.parse(layoutJson) as Layout
    const comps = (layout.areas || []).flatMap(a => a.components || [])
    const controlled = comps.filter(c => c.controlledBy)
    if (controlled.length <= max) return layoutJson

    const dropped = new Set(controlled.slice(max).map(c => c.id).filter(Boolean) as string[])
    comps.forEach(c => {
      if (c.id && dropped.has(c.id)) delete c.controlledBy
      if (Array.isArray(c.controls)) c.controls = c.controls.filter(id => !dropped.has(id))
    })
    return JSON.stringify(layout)
  } catch {
    return layoutJson
  }
}
