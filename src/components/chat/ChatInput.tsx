'use client'
import { useState, useRef, KeyboardEvent } from 'react'
import { SendHorizonal, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChatInputProps {
  onSend: (content: string) => void
  disabled?: boolean
  placeholder?: string
}

export function ChatInput({ onSend, disabled = false, placeholder = '描述您想要的仪表板...' }: ChatInputProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = () => {
    const content = value.trim()
    if (!content || disabled) return
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
      className="px-4 py-3 border-t"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
    >
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
      <p className="text-xs text-slate-400 mt-1.5 text-center">
        Enter 发送 · Shift+Enter 换行
      </p>
    </div>
  )
}
