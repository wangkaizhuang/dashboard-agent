'use client'
import { useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { MessageItem } from './MessageItem'
import type { Message } from '@/types'

interface MessageListProps {
  messages: Message[]
  isLoading: boolean
  /** True only for the 'new' draft session — gates the "start designing" CTA. */
  isNewSession?: boolean
  /** True while a real session's initial history fetch is still in flight. */
  sessionLoading?: boolean
  onTemplatePreview: (templateId: string) => void
  onExpertAnswered: () => void
}

export function MessageList({ messages, isLoading, isNewSession = true, sessionLoading = false, onTemplatePreview, onExpertAnswered }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  return (
    <div className="flex-1 overflow-y-auto py-4 space-y-1">
      {/* Real session whose history is still loading — show a loading indicator,
          NOT the new-session CTA (which would be misleading on a hard reload). */}
      {messages.length === 0 && !isLoading && sessionLoading && (
        <div className="h-full flex flex-col items-center justify-center text-center px-8">
          <Loader2 size={20} className="animate-spin mb-2" style={{ color: 'var(--color-text-3)' }} />
          <p className="text-sm" style={{ color: 'var(--color-text-2)' }}>加载中…</p>
        </div>
      )}

      {/* New draft session with nothing yet — the "start designing" prompt. */}
      {messages.length === 0 && !isLoading && !sessionLoading && isNewSession && (
        <div className="h-full flex flex-col items-center justify-center text-center px-8">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 text-2xl"
            style={{ background: '#EEF2FF' }}
          >
            📊
          </div>
          <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--color-text-1)' }}>
            开始设计您的仪表板
          </h3>
          <p className="text-sm max-w-xs" style={{ color: 'var(--color-text-2)' }}>
            描述您需要的仪表板内容，例如：「销售数据分析仪表板，包含月度趋势、区域分布和TOP产品排行」
          </p>
        </div>
      )}

      {messages.map(msg => (
        <MessageItem
          key={msg.id}
          message={msg}
          onTemplatePreview={onTemplatePreview}
          onExpertAnswered={onExpertAnswered}
        />
      ))}

      {isLoading && (
        <div className="flex justify-start px-4 py-1">
          <div
            className="flex items-center gap-2 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-2)' }}
          >
            <Loader2 size={13} className="animate-spin" />
            正在生成仪表板…
            {/* On phones the step-by-step progress lives in the hidden panel — point there. */}
            <span className="xl:hidden text-xs text-slate-400">（点右上「进度/预览」看步骤）</span>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}
