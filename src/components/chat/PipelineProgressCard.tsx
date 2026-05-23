'use client'
import { useState } from 'react'
import { ChevronDown, ChevronRight, CheckCircle2, XCircle, Zap, Brain, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STEP_LABELS } from '@/types'
import type { StepName } from '@/types'

interface StepSnapshot {
  stepName: string
  status: string
  score: number | null
}

export interface PipelineProgressMetadata {
  pipelineProgress: true
  isPartialUpdate: boolean
  mode?: string
  steps: StepSnapshot[]
  templateScore?: number
  intent?: string
  targetComponents?: string[]
  changeType?: string
}

interface PipelineProgressCardProps {
  metadata: PipelineProgressMetadata
}

const MODE_ICON: Record<string, React.ReactNode> = {
  QUICK: <Zap size={11} />,
  THINK: <Brain size={11} />,
  EXPERT: <Users size={11} />,
}

const MODE_LABEL: Record<string, string> = {
  QUICK: '快速模式',
  THINK: '深度思考',
  EXPERT: '专家模式',
}

export function PipelineProgressCard({ metadata }: PipelineProgressCardProps) {
  const [expanded, setExpanded] = useState(false)

  const {
    isPartialUpdate,
    mode,
    steps,
    templateScore,
    intent,
    targetComponents,
  } = metadata

  const completedCount = steps.filter(s => s.status === 'COMPLETED').length
  const allOk = completedCount === steps.length

  const title = isPartialUpdate
    ? `局部更新 · ${
        targetComponents && targetComponents.length > 0
          ? targetComponents.slice(0, 2).join(', ') + (targetComponents.length > 2 ? '…' : '')
          : '组件修改'
      }`
    : `${MODE_LABEL[mode || ''] || mode || '生成模式'} · ${completedCount}/${steps.length} 步`

  return (
    <div
      className="rounded-xl border overflow-hidden text-xs"
      style={{
        maxWidth: '320px',
        background: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
      }}
    >
      {/* Header (always visible) */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-slate-50"
      >
        {expanded
          ? <ChevronDown size={12} className="shrink-0 text-slate-400" />
          : <ChevronRight size={12} className="shrink-0 text-slate-400" />}

        {mode && !isPartialUpdate && (
          <span className="shrink-0 text-slate-400">{MODE_ICON[mode]}</span>
        )}

        <span
          className="flex-1 font-medium truncate"
          style={{ color: 'var(--color-text-2)' }}
        >
          {title}
        </span>

        <span
          className={cn(
            'shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium',
            allOk
              ? 'bg-emerald-50 text-emerald-600'
              : 'bg-amber-50 text-amber-600'
          )}
        >
          {allOk ? '✓ 完成' : '⚠ 部分'}
        </span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
          {isPartialUpdate && intent && (
            <p className="pt-2 pb-1" style={{ color: 'var(--color-text-3)' }}>
              {intent}
            </p>
          )}

          <div className="pt-2 space-y-1.5">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                {step.status === 'COMPLETED'
                  ? <CheckCircle2 size={11} className="shrink-0 text-emerald-500" />
                  : <XCircle size={11} className="shrink-0 text-red-400" />}
                <span style={{ color: 'var(--color-text-2)' }}>
                  {STEP_LABELS[step.stepName as StepName] ?? step.stepName}
                </span>
                {typeof step.score === 'number' && (
                  <span
                    className={cn(
                      'ml-auto font-medium tabular-nums',
                      step.score >= 70 ? 'text-emerald-600' : 'text-amber-500'
                    )}
                  >
                    {step.score}分
                  </span>
                )}
              </div>
            ))}
          </div>

          {typeof templateScore === 'number' && (
            <div
              className="mt-2 pt-2 border-t flex items-center justify-between"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <span style={{ color: 'var(--color-text-3)' }}>模板综合得分</span>
              <span
                className={cn(
                  'font-semibold tabular-nums',
                  templateScore >= 70 ? 'text-emerald-600' : 'text-amber-500'
                )}
              >
                {templateScore}分
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
