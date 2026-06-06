'use client'
import { useState } from 'react'
import { GitBranch, RefreshCw, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface IntentChoiceCardProps {
  reason?: string
  /** Submit the choice; returns when the POST resolves. */
  onChoose: (choice: 'continue' | 'regenerate') => Promise<void>
}

export function IntentChoiceCard({ reason, onChoose }: IntentChoiceCardProps) {
  const [submitting, setSubmitting] = useState<'continue' | 'regenerate' | null>(null)
  const [done, setDone] = useState<'continue' | 'regenerate' | null>(null)

  const choose = async (choice: 'continue' | 'regenerate') => {
    if (submitting || done) return
    setSubmitting(choice)
    try {
      await onChoose(choice)
      setDone(choice)
    } finally {
      setSubmitting(null)
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border p-3 max-w-sm opacity-60" style={{ borderColor: 'var(--color-border)' }}>
        <p className="text-xs text-slate-500">
          已选择：{done === 'regenerate' ? '重新生成（忽略旧上下文）' : '基于现有继续'}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border overflow-hidden max-w-sm" style={{ borderColor: '#FDE68A', background: '#FFFBEB' }}>
      <div className="px-4 pt-3 pb-2">
        <p className="text-sm font-semibold text-amber-700 mb-0.5">本次需求似乎与当前看板无关</p>
        <p className="text-xs text-amber-600">
          {reason ? reason : '检测到这是一个新主题。'}你想要：
        </p>
      </div>
      <div className="px-4 pb-3 space-y-1.5">
        <button
          onClick={() => choose('regenerate')}
          disabled={!!submitting}
          className={cn(
            'w-full flex items-center gap-2 p-2.5 rounded-lg border text-sm text-left transition-colors disabled:opacity-50',
            'border-amber-300 hover:bg-amber-100 text-amber-800'
          )}
        >
          <RefreshCw size={14} className="shrink-0" />
          <span className="flex-1"><b>重新生成</b>一个新看板（忽略之前的上下文）</span>
          {submitting === 'regenerate' && <span className="text-xs">…</span>}
        </button>
        <button
          onClick={() => choose('continue')}
          disabled={!!submitting}
          className="w-full flex items-center gap-2 p-2.5 rounded-lg border text-sm text-left transition-colors disabled:opacity-50 border-gray-200 hover:bg-gray-50 text-slate-700"
        >
          <ArrowRight size={14} className="shrink-0" />
          <span className="flex-1">基于现有看板<b>继续</b>调整</span>
          {submitting === 'continue' && <span className="text-xs">…</span>}
        </button>
        <p className="text-[11px] text-slate-400 flex items-center gap-1 pt-0.5">
          <GitBranch size={10} /> 选"重新生成"后，旧记录仍保留在本会话中显示
        </p>
      </div>
    </div>
  )
}
