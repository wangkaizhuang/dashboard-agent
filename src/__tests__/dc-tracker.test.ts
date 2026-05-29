import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { stripDcMarkers, injectDcTracker, patchTemplateGlobals, DC_TRACKER_SCRIPT } from '@/lib/utils/dc-tracker'

describe('stripDcMarkers', () => {
  it('removes start markers', () => {
    const html = '<!-- dc:foo:start -->\n<div>content</div>\n<!-- dc:foo:end -->'
    expect(stripDcMarkers(html)).toBe('<div>content</div>\n')
  })

  it('handles multiple components', () => {
    const html = '<!-- dc:a:start --><div>A</div><!-- dc:a:end --><!-- dc:b:start --><div>B</div><!-- dc:b:end -->'
    expect(stripDcMarkers(html)).toBe('<div>A</div><div>B</div>')
  })

  it('is no-op when no markers present', () => {
    const html = '<div class="card">no markers</div>'
    expect(stripDcMarkers(html)).toBe(html)
  })

  it('does not strip data-dc attributes', () => {
    const html = '<!-- dc:foo:start --><div data-dc="foo">x</div><!-- dc:foo:end -->'
    const result = stripDcMarkers(html)
    expect(result).toContain('data-dc="foo"')
    expect(result).not.toContain('<!-- dc:')
  })

  it('handles markers with newlines after them', () => {
    const html = '<!-- dc:bar:start -->\n<div>bar</div>\n<!-- dc:bar:end -->\n'
    const result = stripDcMarkers(html)
    expect(result).not.toContain('<!-- dc:bar:start -->')
    expect(result).not.toContain('<!-- dc:bar:end -->')
    expect(result).toContain('<div>bar</div>')
  })

  it('handles hyphenated component ids', () => {
    const html = '<!-- dc:total-spaces:start --><div>x</div><!-- dc:total-spaces:end -->'
    expect(stripDcMarkers(html)).toBe('<div>x</div>')
  })
})

describe('injectDcTracker', () => {
  it('injects script before </body>', () => {
    const html = '<html><body><div>hi</div></body></html>'
    const result = injectDcTracker(html)
    expect(result.indexOf('dc-tracker')).toBeLessThan(result.indexOf('</body>'))
    expect(result).toContain('</body>')
  })

  it('appends script when no </body> tag', () => {
    const html = '<div>fragment</div>'
    const result = injectDcTracker(html)
    expect(result).toContain('dc-tracker')
    expect(result.startsWith('<div>fragment</div>')).toBe(true)
  })

  it('only one script tag injected', () => {
    const html = '<body></body>'
    const once = injectDcTracker(html)
    const matches = once.match(/id="dc-tracker"/g) || []
    expect(matches.length).toBe(1)
  })

  it('tracking script contains postMessage call', () => {
    const html = '<body></body>'
    const result = injectDcTracker(html)
    expect(result).toContain('postMessage')
    expect(result).toContain('data-dc')
  })

  it('preserves content before </body>', () => {
    const html = '<html><head></head><body><main>content</main></body></html>'
    const result = injectDcTracker(html)
    expect(result).toContain('<main>content</main>')
  })
})

describe('patchTemplateGlobals', () => {
  it('injects chart globals into <head>', () => {
    const html = '<html><head><title>x</title></head><body></body></html>'
    const result = patchTemplateGlobals(html)
    expect(result).toContain('window.DC_CHARTS')
    expect(result).toContain('CHART_COLORS')
    expect(result).toContain('AXIS_STYLE')
    expect(result).toContain('TOOLTIP_STYLE')
    // Globals must appear before </head> so inline component scripts can use them
    expect(result.indexOf('window.DC_CHARTS')).toBeLessThan(result.indexOf('</head>'))
  })

  it('neutralizes a late `const DC_CHARTS = {}` to avoid redeclaration conflict', () => {
    const html = '<head></head><body><script>const DC_CHARTS = {}</script></body>'
    const result = patchTemplateGlobals(html)
    expect(result).not.toContain('const DC_CHARTS = {}')
  })

  it('prepends globals when no </head> tag exists', () => {
    const html = '<div>fragment</div>'
    const result = patchTemplateGlobals(html)
    expect(result).toContain('window.DC_CHARTS')
    expect(result.indexOf('window.DC_CHARTS')).toBeLessThan(result.indexOf('<div>fragment'))
  })
})

/**
 * Integration test for the dc-tracker postMessage mechanism.
 *
 * WHY THIS EXISTS:
 * Three rounds of browser-automation QA agents could NOT verify the annotation
 * hover/click highlight, because the preview iframe uses `sandbox="allow-scripts"`
 * WITHOUT `allow-same-origin` — making it an opaque origin the automation harness
 * cannot dispatch mouse events into (it navigates to the raw preview URL instead).
 *
 * That is a tooling limitation, not a product bug. To close the verification gap
 * with real evidence, this test evaluates the actual DC_TRACKER_SCRIPT inside a
 * jsdom document and drives the full round-trip:
 *   parent → dc:setAnnotationMode → tracker applies CSS + attaches listeners
 *   user hover/click → tracker → window.parent.postMessage(dc:hover / dc:click)
 */
describe('dc-tracker — annotation postMessage round-trip', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let postSpy: any

  /** Extract the executable JS body from the `<script>…</script>` wrapper string. */
  function extractTrackerJs(): string {
    const withoutOpen = DC_TRACKER_SCRIPT.replace(/^\s*<script[^>]*>/, '')
    return withoutOpen.replace(/<\/script>\s*$/, '')
  }

  function runTracker() {
    // eslint-disable-next-line no-new-func
    new Function(extractTrackerJs())()
  }

  function getStyleText(): string {
    return document.getElementById('_dc_style')?.textContent ?? ''
  }

  function setAnnotationMode(active: boolean) {
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'dc:setAnnotationMode', active } }))
  }

  beforeEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
    // In jsdom window.parent === window; spy on the channel the tracker posts to.
    postSpy = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {})
  })

  afterEach(() => {
    postSpy.mockRestore()
    vi.clearAllMocks()
  })

  it('injects hover-highlight CSS when annotation mode activates', () => {
    document.body.innerHTML = `<div data-dc="kpi-1" data-dc-label="总销售额">card</div>`
    runTracker()

    expect(getStyleText()).toBe('') // inactive by default
    setAnnotationMode(true)

    const css = getStyleText()
    expect(css).toContain('[data-dc]')
    expect(css).toContain(':hover')
    expect(css).toContain('#6366f1') // indigo ring color
  })

  it('clears the CSS when annotation mode deactivates', () => {
    document.body.innerHTML = `<div data-dc="kpi-1">card</div>`
    runTracker()
    setAnnotationMode(true)
    expect(getStyleText()).not.toBe('')

    setAnnotationMode(false)
    expect(getStyleText()).toBe('')
  })

  it('posts dc:hover with id + label on mouseenter (when active)', () => {
    document.body.innerHTML = `<div data-dc="kpi-1" data-dc-label="总销售额">card</div>`
    runTracker()
    setAnnotationMode(true)

    const el = document.querySelector('[data-dc]') as HTMLElement
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))

    const hoverCall = postSpy.mock.calls.find((c: unknown[]) => (c[0] as { type?: string })?.type === 'dc:hover')
    expect(hoverCall).toBeTruthy()
    const payload = hoverCall[0] as { componentId: string; componentLabel: string; bounds: unknown }
    expect(payload.componentId).toBe('kpi-1')
    expect(payload.componentLabel).toBe('总销售额')
    expect(payload.bounds).toBeDefined()
  })

  it('posts dc:hover-end on mouseleave (when active)', () => {
    document.body.innerHTML = `<div data-dc="kpi-1">card</div>`
    runTracker()
    setAnnotationMode(true)

    const el = document.querySelector('[data-dc]') as HTMLElement
    el.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }))

    const endCall = postSpy.mock.calls.find((c: unknown[]) => (c[0] as { type?: string })?.type === 'dc:hover-end')
    expect(endCall).toBeTruthy()
  })

  it('posts dc:click with id + label on click (when active)', () => {
    document.body.innerHTML = `<div data-dc="chart-7" data-dc-label="月度趋势">chart</div>`
    runTracker()
    setAnnotationMode(true)

    const el = document.querySelector('[data-dc]') as HTMLElement
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    const clickCall = postSpy.mock.calls.find((c: unknown[]) => (c[0] as { type?: string })?.type === 'dc:click')
    expect(clickCall).toBeTruthy()
    const payload = clickCall[0] as { componentId: string; componentLabel: string }
    expect(payload.componentId).toBe('chart-7')
    expect(payload.componentLabel).toBe('月度趋势')
  })

  it('does NOT post any hover/click message while annotation mode is inactive', () => {
    document.body.innerHTML = `<div data-dc="kpi-1">card</div>`
    runTracker()
    // annotation mode never activated

    const el = document.querySelector('[data-dc]') as HTMLElement
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    const dcCalls = postSpy.mock.calls.filter((c: unknown[]) => {
      const t = (c[0] as { type?: string })?.type
      return t === 'dc:hover' || t === 'dc:click'
    })
    expect(dcCalls).toHaveLength(0)
  })

  it('falls back to .card elements when no [data-dc] is present (legacy templates)', () => {
    document.body.innerHTML = `<div class="card"><div class="card-title">旧卡片</div></div>`
    runTracker()
    setAnnotationMode(true)

    const el = document.querySelector('.card') as HTMLElement
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))

    const hoverCall = postSpy.mock.calls.find((c: unknown[]) => (c[0] as { type?: string })?.type === 'dc:hover')
    expect(hoverCall).toBeTruthy()
    const payload = hoverCall[0] as { componentLabel: string }
    expect(payload.componentLabel).toBe('旧卡片') // label derived from .card-title text
  })
})
