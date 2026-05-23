import { describe, it, expect } from 'vitest'
import { stripDcMarkers, injectDcTracker } from '@/lib/utils/dc-tracker'

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
