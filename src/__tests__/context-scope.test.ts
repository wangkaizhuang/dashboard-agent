/**
 * Tests for sliceToActiveContext (src/lib/ai/context.ts):
 * the model context is scoped to messages since the last context-boundary marker,
 * while display history (the input array) is never mutated.
 */
import { describe, it, expect } from 'vitest'
import { sliceToActiveContext } from '@/lib/ai/context'

type M = { id: string; metadata?: Record<string, unknown> | null }
const msg = (id: string, boundary = false): M => ({ id, metadata: boundary ? { contextBoundary: true } : null })

describe('sliceToActiveContext', () => {
  it('returns all messages when there is no boundary', () => {
    const m = [msg('a'), msg('b'), msg('c')]
    expect(sliceToActiveContext(m).map(x => x.id)).toEqual(['a', 'b', 'c'])
  })

  it('slices from the last boundary (inclusive)', () => {
    const m = [msg('a'), msg('b', true), msg('c')]
    expect(sliceToActiveContext(m).map(x => x.id)).toEqual(['b', 'c'])
  })

  it('uses the LAST boundary when several exist', () => {
    const m = [msg('a', true), msg('b'), msg('c', true), msg('d')]
    expect(sliceToActiveContext(m).map(x => x.id)).toEqual(['c', 'd'])
  })

  it('does not mutate the input array', () => {
    const m = [msg('a'), msg('b', true)]
    sliceToActiveContext(m)
    expect(m.length).toBe(2)
  })
})
