'use client'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, XCircle, Circle, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { ScoreBadge } from './ScoreBadge'
import { ThinkingBlock } from './ThinkingBlock'
import { cn } from '@/lib/utils'
import type { StepStatus, StepName } from '@/types'
import { STEP_LABELS, STEP_DESCRIPTIONS } from '@/types'

interface StepCardProps {
  stepName: StepName
  stepIndex: number
  status: StepStatus
  content: string
  thinking: string
  score: number | null
  issues: string[]
}

export function StepCard({ stepName, stepIndex, status, content, thinking, score, issues }: StepCardProps) {
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null)

  // Auto-expand RUNNING, auto-collapse on COMPLETED
  const defaultExpanded = status === 'RUNNING' || status === 'FAILED'
  const isExpanded = manualExpanded !== null ? manualExpanded : defaultExpanded

  useEffect(() => {
    if (status === 'RUNNING' || status === 'COMPLETED') setManualExpanded(null)
  }, [status])

  const canExpand = status === 'COMPLETED' || status === 'FAILED'

  const StatusIcon = () => {
    if (status === 'COMPLETED') return <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
    if (status === 'FAILED') return <XCircle size={16} className="text-red-500 shrink-0" />
    if (status === 'RUNNING') return (
      <div className="relative shrink-0">
        <Loader2 size={16} className="text-indigo-500 animate-spin" />
      </div>
    )
    return <Circle size={16} className="text-slate-300 shrink-0" />
  }

  const headerBg = {
    PENDING: 'transparent',
    RUNNING: '#EFF6FF',
    COMPLETED: 'transparent',
    FAILED: '#FFF5F5',
    SKIPPED: 'transparent',
  }[status] || 'transparent'

  return (
    <div
      className={cn(
        'rounded-xl border overflow-hidden transition-all duration-200',
        status === 'RUNNING' && 'border-indigo-200 shadow-sm',
        status === 'COMPLETED' && 'border-emerald-100',
        status === 'FAILED' && 'border-red-200',
        status === 'PENDING' && 'border-slate-100 opacity-60',
      )}
      style={{ background: 'var(--color-surface)' }}
    >
      {/* Header */}
      <div
        className={cn('flex items-center gap-2.5 px-3 py-2.5', canExpand && 'cursor-pointer hover:bg-slate-50')}
        style={{ background: headerBg }}
        onClick={() => canExpand && setManualExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <span className="text-xs text-slate-400 font-mono w-4 shrink-0 text-center">{stepIndex + 1}</span>
          <StatusIcon />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={cn(
                  'text-sm font-medium',
                  status === 'PENDING' ? 'text-slate-400' : 'text-slate-800'
                )}
              >
                {STEP_LABELS[stepName]}
              </span>
              {status === 'RUNNING' && (
                <span className="text-xs text-indigo-500 animate-pulse">处理中</span>
              )}
              {status === 'COMPLETED' && score !== null && <ScoreBadge score={score} />}
            </div>
            {status === 'PENDING' && (
              <p className="text-xs text-slate-400 mt-0.5">{STEP_DESCRIPTIONS[stepName]}</p>
            )}
          </div>
        </div>
        {canExpand && (
          <div className="shrink-0 text-slate-400">
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        )}
      </div>

      {/* Body */}
      <AnimatePresence initial={false}>
        {(isExpanded || status === 'RUNNING') && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-3 pb-3 pt-1" style={{ borderTop: '1px solid var(--color-border)' }}>
              {/* Think mode reasoning */}
              {thinking && (
                <ThinkingBlock content={thinking} isStreaming={status === 'RUNNING'} />
              )}

              {/* Step content */}
              {content && (
                <div
                  className={cn(
                    'text-xs leading-relaxed whitespace-pre-wrap mt-2',
                    status === 'RUNNING' ? 'typewriter-cursor' : ''
                  )}
                  style={{ color: 'var(--color-text-2)', maxHeight: '200px', overflowY: 'auto' }}
                >
                  {content.slice(0, 1500)}{content.length > 1500 ? '...' : ''}
                </div>
              )}

              {/* Failure issues */}
              {status === 'FAILED' && issues.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-red-600 mb-1">存在问题：</p>
                  <ul className="space-y-1">
                    {issues.map((issue, i) => (
                      <li key={i} className="text-xs text-red-500 flex gap-1.5">
                        <span className="shrink-0">•</span>{issue}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
