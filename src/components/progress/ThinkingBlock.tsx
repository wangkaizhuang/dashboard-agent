'use client'
import { useState } from 'react'
import { ChevronDown, ChevronRight, Brain } from 'lucide-react'

interface ThinkingBlockProps {
  content: string
  isStreaming?: boolean
}

export function ThinkingBlock({ content, isStreaming = false }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false)
  if (!content && !isStreaming) return null

  return (
    <div className="mt-2 rounded-lg overflow-hidden" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-100 transition-colors"
      >
        <Brain size={12} className="text-slate-400 shrink-0" />
        <span className="text-xs text-slate-500 flex-1 font-medium">
          {isStreaming ? '思考中...' : '查看推理过程'}
        </span>
        {isStreaming && (
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
        )}
        {!isStreaming && (
          expanded ? <ChevronDown size={12} className="text-slate-400 shrink-0" /> : <ChevronRight size={12} className="text-slate-400 shrink-0" />
        )}
      </button>
      {(expanded || isStreaming) && content && (
        <div className="px-3 pb-3">
          <div
            className="text-xs leading-relaxed whitespace-pre-wrap font-mono"
            style={{ color: '#64748B', borderTop: '1px solid #E2E8F0', paddingTop: '8px', marginTop: '2px' }}
          >
            {content}
          </div>
        </div>
      )}
    </div>
  )
}
