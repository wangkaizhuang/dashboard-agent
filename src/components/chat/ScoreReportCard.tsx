'use client'
import { AlertTriangle, MessageSquarePlus } from 'lucide-react'
import { STEP_LABELS, type StepName } from '@/types'

interface ScoreReportCardProps {
  stepName: string
  score: number
  issues: string[]
  threshold: number
}

export function ScoreReportCard({ stepName, score, issues, threshold }: ScoreReportCardProps) {
  return (
    <div
      className="rounded-xl border overflow-hidden max-w-sm"
      style={{ borderColor: '#FECACA', background: '#FFF5F5' }}
    >
      <div className="px-4 py-3 flex items-start gap-2">
        <div className="w-6 h-6 rounded-lg bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
          <AlertTriangle size={13} className="text-red-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-semibold text-red-700">生成质量不足</p>
            <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-mono">
              {score}/{threshold}
            </span>
          </div>
          <p className="text-xs text-red-600 mb-2">
            步骤「{STEP_LABELS[stepName as StepName] || stepName}」评分低于阈值，以下问题需要补充：
          </p>
          {issues.length > 0 && (
            <ul className="text-xs text-red-700 space-y-1 mb-3">
              {issues.map((issue, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="shrink-0 mt-0.5">•</span>
                  <span>{issue}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Recovery call-to-action */}
          <div
            className="flex items-start gap-2 p-2.5 rounded-lg"
            style={{ background: '#FEE2E2', border: '1px solid #FECACA' }}
          >
            <MessageSquarePlus size={13} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 leading-snug">
              <span className="font-semibold">如何继续：</span>
              在下方输入框中针对上述问题补充信息，发送后将从「{STEP_LABELS[stepName as StepName] || stepName}」步骤自动重新生成。
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
