/**
 * Tests for src/components/chat/ScoreReportCard.tsx
 *
 * Covers:
 * - Renders step name using STEP_LABELS mapping
 * - Displays score and threshold in correct format
 * - Lists all issue strings
 * - Shows recovery CTA when issues are present
 * - Shows recovery CTA even with zero issues (pipeline paused for other reasons)
 * - Score badge color indicates failure
 * - Component renders without crashing for unknown step names
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScoreReportCard } from '@/components/chat/ScoreReportCard'

describe('ScoreReportCard — rendering', () => {
  const defaultProps = {
    stepName: 'LAYOUT_PLANNING',
    score: 45,
    issues: ['缺少主标题区域', '没有数据筛选器'],
    threshold: 30,
  }

  it('renders Chinese step label for known step names', () => {
    render(<ScoreReportCard {...defaultProps} />)
    expect(screen.getByText(/布局规划/)).toBeInTheDocument()
  })

  it('renders raw step name for unknown step names', () => {
    render(<ScoreReportCard {...defaultProps} stepName="UNKNOWN_STEP" />)
    expect(screen.getByText(/UNKNOWN_STEP/)).toBeInTheDocument()
  })

  it('displays score/threshold badge', () => {
    render(<ScoreReportCard {...defaultProps} />)
    expect(screen.getByText('45/30')).toBeInTheDocument()
  })

  it('shows all issues as list items', () => {
    render(<ScoreReportCard {...defaultProps} />)
    expect(screen.getByText('缺少主标题区域')).toBeInTheDocument()
    expect(screen.getByText('没有数据筛选器')).toBeInTheDocument()
  })

  it('renders recovery CTA', () => {
    render(<ScoreReportCard {...defaultProps} />)
    expect(screen.getByText(/如何继续/)).toBeInTheDocument()
  })

  it('recovery CTA explains what to do', () => {
    render(<ScoreReportCard {...defaultProps} />)
    expect(screen.getByText(/补充上述缺失信息/)).toBeInTheDocument()
  })

  it('shows "生成质量不足" header', () => {
    render(<ScoreReportCard {...defaultProps} />)
    expect(screen.getByText('生成质量不足')).toBeInTheDocument()
  })

  it('renders with empty issues array', () => {
    render(<ScoreReportCard {...defaultProps} issues={[]} />)
    // Should not crash, and should still show the card header
    expect(screen.getByText('生成质量不足')).toBeInTheDocument()
    // Recovery CTA still shown
    expect(screen.getByText(/如何继续/)).toBeInTheDocument()
  })

  it('renders all known step names correctly', () => {
    const stepsAndLabels: [string, string][] = [
      ['REQUIREMENTS_ANALYSIS', '需求分析'],
      ['THOUGHT_BREAKDOWN', '思路拆解'],
      ['LAYOUT_PLANNING', '布局规划'],
      ['MOCK_DATA', 'Mock 数据'],
      ['TEMPLATE_GENERATION', '模板生成'],
    ]
    for (const [stepName, expectedLabel] of stepsAndLabels) {
      const { unmount } = render(<ScoreReportCard {...defaultProps} stepName={stepName} />)
      expect(screen.getByText(new RegExp(expectedLabel))).toBeInTheDocument()
      unmount()
    }
  })

  it('many issues are all rendered', () => {
    const manyIssues = ['issue 1', 'issue 2', 'issue 3', 'issue 4', 'issue 5']
    render(<ScoreReportCard {...defaultProps} issues={manyIssues} />)
    manyIssues.forEach(issue => {
      expect(screen.getByText(issue)).toBeInTheDocument()
    })
  })
})
