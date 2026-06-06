'use client'
import { useState, useRef, KeyboardEvent } from 'react'
import { SendHorizonal, Loader2, Zap, Brain, GraduationCap, X as XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Mode, Annotation } from '@/types'

interface ModeOption {
  label: string
  desc: string
  icon: React.ElementType
  color: string
  activeColor: string
}

const MODE_OPTIONS: Record<Mode, ModeOption> = {
  QUICK: {
    label: '快速',
    desc: '直接生成，速度最快',
    icon: Zap,
    color: 'text-emerald-500',
    activeColor: 'bg-emerald-50 text-emerald-700 border-emerald-300',
  },
  THINK: {
    label: '深思',
    desc: '推理链 · 质量更高',
    icon: Brain,
    color: 'text-blue-500',
    activeColor: 'bg-blue-50 text-blue-700 border-blue-300',
  },
  EXPERT: {
    label: '专家',
    desc: '交互式需求补全',
    icon: GraduationCap,
    color: 'text-purple-500',
    activeColor: 'bg-purple-50 text-purple-700 border-purple-300',
  },
}

interface ChatInputProps {
  onSend: (content: string) => void
  disabled?: boolean
  placeholder?: string
  selectedMode: Mode
  onModeChange: (mode: Mode) => void
  annotations?: Annotation[]
  onAnnotationRemove?: (componentId: string) => void
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = '描述您想要的仪表板…',
  selectedMode,
  onModeChange,
  annotations = [],
  onAnnotationRemove,
}: ChatInputProps) {
  const [value, setValue] = useState('')
  const [hint, setHint] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = () => {
    const content = value.trim()
    if (!content || disabled) return
    // Soft validation: first-time messages (no annotations) that are extremely
    // short are almost certainly not real dashboard requests.
    if (content.length < 8 && annotations.length === 0) {
      setHint('请描述您需要什么样的仪表板，例如："创建一个电商销售数据仪表板，包含销售额、订单量等指标"')
      setTimeout(() => setHint(''), 4000)
      return
    }
    setHint('')
    onSend(content)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = () => {
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
    }
  }

  return (
    <div
      className="px-4 pt-3 pb-2 border-t"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
    >
      {/* Input box */}
      <div
        className={cn(
          'flex items-end gap-2 rounded-xl border px-3 py-2 transition-colors',
          disabled
            ? 'opacity-60 bg-gray-50'
            : 'bg-white focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100'
        )}
        style={{ borderColor: 'var(--color-border)' }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-slate-400"
          style={{ maxHeight: '160px', color: 'var(--color-text-1)' }}
        />
        <button
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          className={cn(
            'shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
            disabled || !value.trim()
              ? 'text-slate-300 cursor-not-allowed'
              : 'bg-indigo-600 text-white hover:bg-indigo-700'
          )}
        >
          {disabled ? <Loader2 size={15} className="animate-spin" /> : <SendHorizonal size={15} />}
        </button>
      </div>

      {/* Input hint (shown when message is too short) */}
      {hint && (
        <p className="mt-1 text-xs text-amber-600 px-1">{hint}</p>
      )}

      {/* Annotation chips — shown when at least one component is annotated */}
      {annotations.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5 mb-0.5">
          {annotations.map(ann => (
            <div
              key={ann.componentId}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border"
              style={{ background: '#F3F0FF', borderColor: '#C4B5FD', color: '#6D28D9' }}
            >
              <span className="text-[10px]">🔲</span>
              <span className="max-w-[120px] truncate">
                {ann.componentLabel}{ann.note ? `：${ann.note}` : ''}
              </span>
              <button
                onClick={() => onAnnotationRemove?.(ann.componentId)}
                className="hover:text-red-500 transition-colors ml-0.5"
              >
                <XIcon size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Mode selector + hint */}
      <div className="flex items-center gap-1 mt-2">
        {(Object.entries(MODE_OPTIONS) as [Mode, ModeOption][]).map(([mode, cfg]) => {
          const Icon = cfg.icon
          const isActive = selectedMode === mode
          return (
            <button
              key={mode}
              onClick={() => onModeChange(mode)}
              disabled={disabled}
              title={cfg.desc}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all border disabled:opacity-50',
                isActive
                  ? cfg.activeColor
                  : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-100'
              )}
            >
              <Icon size={11} className={isActive ? undefined : cfg.color} />
              {cfg.label}
            </button>
          )
        })}
        <span className="hidden sm:inline ml-auto text-xs text-slate-400">
          Enter 发送 · Shift+Enter 换行
        </span>
      </div>
    </div>
  )
}
