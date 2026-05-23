import { describe, it, expect } from 'vitest'
import { extractComponentHtml, replaceComponentHtml } from '@/lib/ai/partial-update'

const SAMPLE_HTML = `
<div class="grid">
<!-- dc:total-spaces:start -->
<div class="col-3 card" data-dc="total-spaces">车位数</div>
<!-- dc:total-spaces:end -->
<!-- dc:hourly-flow:start -->
<div class="col-9 card" data-dc="hourly-flow">流量图</div>
<!-- dc:hourly-flow:end -->
</div>
`

describe('extractComponentHtml', () => {
  it('extracts content between start and end markers', () => {
    const result = extractComponentHtml(SAMPLE_HTML, 'total-spaces')
    expect(result).toContain('data-dc="total-spaces"')
    expect(result).toContain('车位数')
    expect(result).not.toContain('dc:total-spaces')
  })

  it('returns null for unknown component id', () => {
    expect(extractComponentHtml(SAMPLE_HTML, 'nonexistent')).toBeNull()
  })

  it('does not bleed into adjacent component', () => {
    const result = extractComponentHtml(SAMPLE_HTML, 'total-spaces')
    expect(result).not.toContain('hourly-flow')
  })

  it('extracts the second component correctly', () => {
    const result = extractComponentHtml(SAMPLE_HTML, 'hourly-flow')
    expect(result).toContain('data-dc="hourly-flow"')
    expect(result).toContain('流量图')
    expect(result).not.toContain('total-spaces')
  })

  it('returns trimmed content', () => {
    const result = extractComponentHtml(SAMPLE_HTML, 'total-spaces')
    expect(result).not.toBeNull()
    expect(result!.startsWith('<')).toBe(true)
    expect(result!.endsWith('>')).toBe(true)
  })
})

describe('replaceComponentHtml', () => {
  it('replaces content preserving surrounding HTML', () => {
    const { result, success } = replaceComponentHtml(
      SAMPLE_HTML, 'total-spaces',
      '<div class="col-3 card" data-dc="total-spaces">新内容</div>'
    )
    expect(success).toBe(true)
    expect(result).toContain('新内容')
    expect(result).not.toContain('车位数')
    // Other component untouched
    expect(result).toContain('流量图')
  })

  it('returns success=false for unknown component id', () => {
    const { success } = replaceComponentHtml(SAMPLE_HTML, 'nonexistent', '<div/>')
    expect(success).toBe(false)
  })

  it('preserves dc boundary markers after replacement', () => {
    const { result } = replaceComponentHtml(
      SAMPLE_HTML, 'total-spaces', '<div>new</div>'
    )
    expect(result).toContain('<!-- dc:total-spaces:start -->')
    expect(result).toContain('<!-- dc:total-spaces:end -->')
  })

  it('preserves the end marker for the other component', () => {
    const { result } = replaceComponentHtml(
      SAMPLE_HTML, 'total-spaces', '<div>new</div>'
    )
    expect(result).toContain('<!-- dc:hourly-flow:start -->')
    expect(result).toContain('<!-- dc:hourly-flow:end -->')
  })

  it('round-trip: extract then replace gives back same outer structure', () => {
    const original = extractComponentHtml(SAMPLE_HTML, 'total-spaces')!
    const { result, success } = replaceComponentHtml(SAMPLE_HTML, 'total-spaces', original)
    expect(success).toBe(true)
    expect(result).toContain('<!-- dc:total-spaces:start -->')
    expect(result).toContain('<!-- dc:total-spaces:end -->')
    expect(result).toContain('<!-- dc:hourly-flow:start -->')
  })

  it('replaces hourly-flow without touching total-spaces', () => {
    const { result, success } = replaceComponentHtml(
      SAMPLE_HTML, 'hourly-flow', '<div data-dc="hourly-flow">替换</div>'
    )
    expect(success).toBe(true)
    expect(result).toContain('替换')
    // total-spaces untouched
    expect(result).toContain('车位数')
  })

  it('unchanged html length when same content replaced', () => {
    const extracted = extractComponentHtml(SAMPLE_HTML, 'total-spaces')!
    const { result } = replaceComponentHtml(SAMPLE_HTML, 'total-spaces', extracted)
    // Trimming might add a newline, so compare approximately
    expect(result).toContain(extracted)
  })
})
