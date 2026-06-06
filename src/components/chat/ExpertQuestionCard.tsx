'use client'
import { useState } from 'react'
import { GraduationCap, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Option { label: string; value: string }
interface ExpertQuestionCardProps {
  questionId: string
  question: string
  options: Option[]
  onAnswered: () => void
  initialAnswered?: boolean
  initialAnswer?: string
}

export function ExpertQuestionCard({ questionId, question, options, onAnswered, initialAnswered, initialAnswer }: ExpertQuestionCardProps) {
  const [selected, setSelected] = useState<string | null>(initialAnswer ?? null)
  const [customText, setCustomText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(initialAnswered ?? false)

  const handleSubmit = async () => {
    if (!selected) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/expert/${questionId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answer: selected,
          customText: selected === '__custom__' ? customText : undefined
        })
      })
      if (res.ok) {
        setDone(true)
        onAnswered()
        toast.success('回答已提交')
      } else {
        toast.error('提交失败，请重试')
      }
    } catch {
      toast.error('提交失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    const chosenLabel = options.find(o => o.value === selected)?.label || customText
    return (
      <div className="rounded-xl border p-3 max-w-sm opacity-60" style={{ borderColor: 'var(--color-border)' }}>
        <p className="text-xs text-slate-500 mb-1">已回答</p>
        <p className="text-sm" style={{ color: 'var(--color-text-1)' }}>{chosenLabel}</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border overflow-hidden max-w-sm" style={{ borderColor: '#E0E7FF', background: '#FAFAFE', boxShadow: 'var(--shadow-card)' }}>
      <div className="px-4 pt-3 pb-2 flex items-start gap-2">
        <div className="w-6 h-6 rounded-lg bg-purple-100 flex items-center justify-center shrink-0 mt-0.5">
          <GraduationCap size={13} className="text-purple-600" />
        </div>
        <div>
          <p className="text-xs text-purple-600 font-medium mb-0.5">专家模式 — 信息补充</p>
          <p className="text-sm font-medium" style={{ color: 'var(--color-text-1)' }}>{question}</p>
        </div>
      </div>

      <div className="px-4 pb-3 space-y-1.5">
        {options.map(opt => (
          <label
            key={opt.value}
            className={cn(
              'flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all text-sm',
              selected === opt.value
                ? 'border-purple-400 bg-purple-50 text-purple-700'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            )}
          >
            <input
              type="radio"
              name={questionId}
              value={opt.value}
              checked={selected === opt.value}
              onChange={() => setSelected(opt.value)}
              className="accent-purple-600"
            />
            {opt.label}
          </label>
        ))}

        {selected === '__custom__' && (
          <input
            type="text"
            value={customText}
            onChange={e => setCustomText(e.target.value)}
            placeholder="请描述您的需求..."
            className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-purple-300"
            style={{ borderColor: '#C4B5FD' }}
            autoFocus
          />
        )}

        <button
          onClick={handleSubmit}
          disabled={!selected || submitting || (selected === '__custom__' && !customText.trim())}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium mt-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: '#7C3AED', color: 'white' }}
        >
          确认提交 <ChevronRight size={14} />
        </button>
        <p className="text-[11px] text-slate-400 text-center mt-1.5">
          回答全部问题后，将自动继续生成
        </p>
      </div>
    </div>
  )
}
