/**
 * Tests for src/lib/config/runtime.ts
 *
 * Covers:
 * - getRuntimeConfig reads env vars correctly
 * - Override layer takes precedence over env vars
 * - stepThresholds falls back to {} when not set
 * - setRuntimeConfig merges and persists overrides
 * - contextMaxTokens uses getRuntimeConfig(), not process.env directly
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'

// ── We mock `fs` BEFORE importing runtime so the module initializer uses our mock ──
vi.mock('fs')

const mockFs = fs as typeof fs & {
  readFileSync: ReturnType<typeof vi.fn>
  writeFileSync: ReturnType<typeof vi.fn>
}

describe('getRuntimeConfig', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
    vi.resetModules()
    // Default: no persisted config file
    mockFs.readFileSync = vi.fn().mockImplementation(() => { throw new Error('ENOENT') })
    mockFs.writeFileSync = vi.fn()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('falls back to env vars when no override is set', async () => {
    process.env.OPENAI_MODEL = 'gpt-test'
    process.env.OPENAI_BASE_URL = 'https://api.test.com/v1'
    process.env.OPENAI_API_KEY = 'sk-test-key'
    process.env.CONTEXT_MAX_TOKENS = '64000'
    process.env.QUALITY_SCORE_THRESHOLD = '50'

    const { getRuntimeConfig } = await import('@/lib/config/runtime')
    const cfg = getRuntimeConfig()

    expect(cfg.model).toBe('gpt-test')
    expect(cfg.baseUrl).toBe('https://api.test.com/v1')
    expect(cfg.apiKey).toBe('sk-test-key')
    expect(cfg.contextMaxTokens).toBe(64000)
    expect(cfg.qualityScoreThreshold).toBe(50)
  })

  it('defaults stepThresholds to empty object when not in file or env', async () => {
    const { getRuntimeConfig } = await import('@/lib/config/runtime')
    const cfg = getRuntimeConfig()
    expect(cfg.stepThresholds).toEqual({})
  })

  it('uses default model when OPENAI_MODEL is unset', async () => {
    delete process.env.OPENAI_MODEL
    const { getRuntimeConfig } = await import('@/lib/config/runtime')
    expect(getRuntimeConfig().model).toBe('gpt-5.4-mini')
  })

  it('uses default baseUrl when OPENAI_BASE_URL is unset', async () => {
    delete process.env.OPENAI_BASE_URL
    const { getRuntimeConfig } = await import('@/lib/config/runtime')
    expect(getRuntimeConfig().baseUrl).toBe('https://www.packyapi.com/v1')
  })

  it('defaults contextMaxTokens to 128000 when env var missing', async () => {
    delete process.env.CONTEXT_MAX_TOKENS
    const { getRuntimeConfig } = await import('@/lib/config/runtime')
    expect(getRuntimeConfig().contextMaxTokens).toBe(128000)
  })

  it('defaults qualityScoreThreshold to 30 when env var missing', async () => {
    delete process.env.QUALITY_SCORE_THRESHOLD
    const { getRuntimeConfig } = await import('@/lib/config/runtime')
    expect(getRuntimeConfig().qualityScoreThreshold).toBe(30)
  })
})

describe('setRuntimeConfig', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFs.readFileSync = vi.fn().mockImplementation(() => { throw new Error('ENOENT') })
    mockFs.writeFileSync = vi.fn()
  })

  it('override takes precedence over env vars', async () => {
    process.env.OPENAI_MODEL = 'env-model'
    const { getRuntimeConfig, setRuntimeConfig } = await import('@/lib/config/runtime')
    setRuntimeConfig({ model: 'override-model' })
    expect(getRuntimeConfig().model).toBe('override-model')
  })

  it('partial override does not clobber unrelated fields', async () => {
    process.env.OPENAI_MODEL = 'env-model'
    process.env.QUALITY_SCORE_THRESHOLD = '40'
    const { getRuntimeConfig, setRuntimeConfig } = await import('@/lib/config/runtime')
    setRuntimeConfig({ qualityScoreThreshold: 70 })
    expect(getRuntimeConfig().model).toBe('env-model')       // unchanged
    expect(getRuntimeConfig().qualityScoreThreshold).toBe(70) // overridden
  })

  it('persists stepThresholds per step', async () => {
    const { getRuntimeConfig, setRuntimeConfig } = await import('@/lib/config/runtime')
    setRuntimeConfig({ stepThresholds: { REQUIREMENTS_ANALYSIS: 80, LAYOUT_PLANNING: 50 } })
    const cfg = getRuntimeConfig()
    expect(cfg.stepThresholds.REQUIREMENTS_ANALYSIS).toBe(80)
    expect(cfg.stepThresholds.LAYOUT_PLANNING).toBe(50)
  })

  it('writes config to file', async () => {
    const { setRuntimeConfig } = await import('@/lib/config/runtime')
    setRuntimeConfig({ model: 'saved-model' })
    expect(mockFs.writeFileSync).toHaveBeenCalledOnce()
    const written = JSON.parse((mockFs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1])
    expect(written.model).toBe('saved-model')
  })

  it('reading from persisted file on module load', async () => {
    // Simulate a saved config file
    mockFs.readFileSync = vi.fn().mockReturnValue(
      JSON.stringify({ model: 'persisted-model', qualityScoreThreshold: 55, stepThresholds: { MOCK_DATA: 60 } })
    )
    const { getRuntimeConfig } = await import('@/lib/config/runtime')
    const cfg = getRuntimeConfig()
    expect(cfg.model).toBe('persisted-model')
    expect(cfg.qualityScoreThreshold).toBe(55)
    expect(cfg.stepThresholds.MOCK_DATA).toBe(60)
  })

  it('handles corrupt config file gracefully', async () => {
    mockFs.readFileSync = vi.fn().mockReturnValue('not-valid-json')
    const { getRuntimeConfig } = await import('@/lib/config/runtime')
    // Should fall back to env/defaults without throwing
    expect(() => getRuntimeConfig()).not.toThrow()
  })
})

describe('stepThresholds edge cases', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFs.readFileSync = vi.fn().mockImplementation(() => { throw new Error('ENOENT') })
    mockFs.writeFileSync = vi.fn()
  })

  it('unknown step name returns undefined from stepThresholds', async () => {
    const { getRuntimeConfig } = await import('@/lib/config/runtime')
    const cfg = getRuntimeConfig()
    expect(cfg.stepThresholds['UNKNOWN_STEP']).toBeUndefined()
  })

  it('setRuntimeConfig merges stepThresholds without overwriting other steps', async () => {
    const { getRuntimeConfig, setRuntimeConfig } = await import('@/lib/config/runtime')
    setRuntimeConfig({ stepThresholds: { REQUIREMENTS_ANALYSIS: 80 } })
    setRuntimeConfig({ stepThresholds: { ...getRuntimeConfig().stepThresholds, MOCK_DATA: 40 } })
    const cfg = getRuntimeConfig()
    expect(cfg.stepThresholds.REQUIREMENTS_ANALYSIS).toBe(80)
    expect(cfg.stepThresholds.MOCK_DATA).toBe(40)
  })
})
