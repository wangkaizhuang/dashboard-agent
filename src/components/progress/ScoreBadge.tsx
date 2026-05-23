'use client'
interface ScoreBadgeProps {
  score: number | null
}
export function ScoreBadge({ score }: ScoreBadgeProps) {
  if (score === null) return null
  const color = score >= 80 ? '#10B981' : score >= 60 ? '#F59E0B' : '#EF4444'
  const bg = score >= 80 ? '#D1FAE5' : score >= 60 ? '#FEF3C7' : '#FEE2E2'
  return (
    <span
      className="inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full"
      style={{ background: bg, color }}
    >
      {score}分
    </span>
  )
}
