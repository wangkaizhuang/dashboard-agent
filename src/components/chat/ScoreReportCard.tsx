'use client'
import { AlertTriangle } from 'lucide-react'

interface ScoreReportCardProps {
  stepName: string
  score: number
  issues: string[]
  threshold: number
}

export function ScoreReportCard({ stepName, score, issues, threshold }: ScoreReportCardProps) {
  const stepLabels: Record<string, string> = {
    REQUIREMENTS_ANALYSIS: '需求分析', THOUGHT_BREAKDOWN: '思路拆解',
    LAYOUT_PLANNING: '布局规划', MOCK_DATA: 'Mock 数据', TEMPLATE_GENERATION: '模板生成'
  }

  return (
    <div className="rounded-xl border overflow-hidden max-w-sm" style={{ borderColor: '#FECACA', background: '#FFF5F5' }}>
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
            步骤「{stepLabels[stepName] || stepName}」评分低于阈值，请补充以下信息后继续：
          </p>
          {issues.length > 0 && (
            <ul className="text-xs text-red-700 space-y-1">
              {issues.map((issue, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="shrink-0 mt-0.5">•</span>
                  <span>{issue}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-red-500 mt-2">
            在输入框中补充详细信息后，对话将从当前步骤继续。
          </p>
        </div>
      </div>
    </div>
  )
}
