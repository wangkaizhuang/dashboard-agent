'use client'
interface ScoreBadgeProps {
  score: number | null
}
export function ScoreBadge({ score }: ScoreBadgeProps) {
  if (score === null) return null
  const color = score >= 80 ? '#10B981' : score >= 60 ? '#F59E0B' : '#EF4444'
  const bg = score >= 80 ? '#D1FAE5' : score >= 60 ? '#FEF3C7' : '#FEE2E2'
  const tip = score >= 80 ? '质量评分 0-100：优秀（≥80）' : score >= 60 ? '质量评分 0-100：合格（60-79），可继续优化' : '质量评分 0-100：偏低（<60），建议补充需求细节后重新生成'
  return (
    <span
      className="inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full cursor-help"
      style={{ background: bg, color }}
      title={`${tip}（满分 100）`}
    >
      {score}分
    </span>
  )
}
