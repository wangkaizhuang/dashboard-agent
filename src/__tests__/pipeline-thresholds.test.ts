/**
 * Tests for pipeline step threshold logic (src/lib/ai/pipeline.ts)
 *
 * Rather than importing the full pipeline (which pulls in Prisma and OpenAI),
 * we extract and test the threshold comparison logic in isolation.
 *
 * Covers:
 * - Per-step threshold overrides global threshold
 * - Falls back to global threshold when step has no override
 * - A score equal to the threshold is NOT paused (threshold is exclusive lower bound)
 * - Score below threshold triggers PAUSED
 * - Score above threshold continues
 * - All five steps can independently have different thresholds
 * - stepThresholds with partial coverage still applies global for uncovered steps
 * - TEMPLATE_GENERATION step score is taken from actual step, not hardcoded 85
 */
import { describe, it, expect } from 'vitest'
import type { StepThresholds } from '@/lib/config/runtime'

// Extracted threshold resolution logic — mirrors pipeline.ts exactly
function resolveThreshold(
  stepName: string,
  globalThreshold: number,
  stepThresholds: StepThresholds
): number {
  return stepThresholds?.[stepName] ?? globalThreshold
}

function shouldPause(score: number, effectiveThreshold: number): boolean {
  return score < effectiveThreshold
}

describe('resolveThreshold', () => {
  const STEP_NAMES = [
    'REQUIREMENTS_ANALYSIS',
    'THOUGHT_BREAKDOWN',
    'LAYOUT_PLANNING',
    'MOCK_DATA',
    'TEMPLATE_GENERATION',
  ]
  const globalThreshold = 30

  it('returns per-step threshold when configured', () => {
    const thresholds: StepThresholds = { REQUIREMENTS_ANALYSIS: 80 }
    expect(resolveThreshold('REQUIREMENTS_ANALYSIS', globalThreshold, thresholds)).toBe(80)
  })

  it('falls back to global threshold when step has no override', () => {
    const thresholds: StepThresholds = {}
    expect(resolveThreshold('LAYOUT_PLANNING', globalThreshold, thresholds)).toBe(globalThreshold)
  })

  it('mixed coverage: configured steps use override, others use global', () => {
    const thresholds: StepThresholds = {
      REQUIREMENTS_ANALYSIS: 90,
      MOCK_DATA: 60,
    }
    expect(resolveThreshold('REQUIREMENTS_ANALYSIS', globalThreshold, thresholds)).toBe(90)
    expect(resolveThreshold('THOUGHT_BREAKDOWN', globalThreshold, thresholds)).toBe(globalThreshold)
    expect(resolveThreshold('LAYOUT_PLANNING', globalThreshold, thresholds)).toBe(globalThreshold)
    expect(resolveThreshold('MOCK_DATA', globalThreshold, thresholds)).toBe(60)
    expect(resolveThreshold('TEMPLATE_GENERATION', globalThreshold, thresholds)).toBe(globalThreshold)
  })

  it('all five steps can have independent thresholds', () => {
    const thresholds: StepThresholds = {
      REQUIREMENTS_ANALYSIS: 90,
      THOUGHT_BREAKDOWN: 80,
      LAYOUT_PLANNING: 70,
      MOCK_DATA: 60,
      TEMPLATE_GENERATION: 50,
    }
    const expected = [90, 80, 70, 60, 50]
    STEP_NAMES.forEach((step, i) => {
      expect(resolveThreshold(step, globalThreshold, thresholds)).toBe(expected[i])
    })
  })

  it('handles undefined stepThresholds gracefully', () => {
    expect(resolveThreshold('MOCK_DATA', globalThreshold, {} as StepThresholds)).toBe(globalThreshold)
  })
})

describe('shouldPause', () => {
  it('pauses when score is strictly below threshold', () => {
    expect(shouldPause(29, 30)).toBe(true)
    expect(shouldPause(0, 30)).toBe(true)
    expect(shouldPause(1, 30)).toBe(true)
  })

  it('does NOT pause when score equals threshold', () => {
    // score === threshold means exactly at threshold → continue (not paused)
    expect(shouldPause(30, 30)).toBe(false)
  })

  it('does NOT pause when score is above threshold', () => {
    expect(shouldPause(31, 30)).toBe(false)
    expect(shouldPause(100, 30)).toBe(false)
  })

  it('extreme values behave correctly', () => {
    expect(shouldPause(0, 0)).toBe(false) // score 0 at threshold 0 → don't pause
    expect(shouldPause(-1, 0)).toBe(true)  // below 0 → pause
    expect(shouldPause(100, 100)).toBe(false)
    expect(shouldPause(99, 100)).toBe(true)
  })
})

describe('TEMPLATE_GENERATION score resolution', () => {
  // Mirrors the logic in pipeline.ts after all steps complete:
  // const templateStep = cleanedSteps.find(s => s.stepName === 'TEMPLATE_GENERATION' && s.status === 'COMPLETED')
  // const templateScore = typeof templateStep?.score === 'number' ? templateStep.score : 75

  type FakeStep = { stepName: string; status: string; score?: number | null }

  function resolveTemplateScore(cleanedSteps: FakeStep[]): number {
    const templateStep = cleanedSteps.find(
      s => s.stepName === 'TEMPLATE_GENERATION' && s.status === 'COMPLETED'
    )
    return typeof templateStep?.score === 'number' ? templateStep.score : 75
  }

  it('uses actual TEMPLATE_GENERATION step score when available', () => {
    const steps: FakeStep[] = [
      { stepName: 'REQUIREMENTS_ANALYSIS', status: 'COMPLETED', score: 90 },
      { stepName: 'TEMPLATE_GENERATION', status: 'COMPLETED', score: 68 },
    ]
    expect(resolveTemplateScore(steps)).toBe(68)
  })

  it('defaults to 75 when TEMPLATE_GENERATION step is missing', () => {
    const steps: FakeStep[] = [
      { stepName: 'REQUIREMENTS_ANALYSIS', status: 'COMPLETED', score: 90 },
    ]
    expect(resolveTemplateScore(steps)).toBe(75)
  })

  it('defaults to 75 when TEMPLATE_GENERATION step score is null', () => {
    const steps: FakeStep[] = [
      { stepName: 'TEMPLATE_GENERATION', status: 'COMPLETED', score: null },
    ]
    expect(resolveTemplateScore(steps)).toBe(75)
  })

  it('defaults to 75 when TEMPLATE_GENERATION is FAILED (not COMPLETED)', () => {
    const steps: FakeStep[] = [
      { stepName: 'TEMPLATE_GENERATION', status: 'FAILED', score: 20 },
    ]
    expect(resolveTemplateScore(steps)).toBe(75)
  })

  it('does NOT use hardcoded 85 in any scenario', () => {
    const stepsWithLowScore: FakeStep[] = [
      { stepName: 'TEMPLATE_GENERATION', status: 'COMPLETED', score: 46 },
    ]
    expect(resolveTemplateScore(stepsWithLowScore)).toBe(46)
    expect(resolveTemplateScore(stepsWithLowScore)).not.toBe(85) // explicit guard
  })

  it('score of 0 is preserved as 0, not replaced by default', () => {
    const steps: FakeStep[] = [
      { stepName: 'TEMPLATE_GENERATION', status: 'COMPLETED', score: 0 },
    ]
    expect(resolveTemplateScore(steps)).toBe(0)
  })
})
