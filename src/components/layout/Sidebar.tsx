'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon, Settings2Icon, Trash2, Check, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import type { Session, SessionStatus } from '@/types'

interface SidebarProps {
  sessions: Session[]
  currentSessionId: string
  onConfigOpen: () => void
  onSessionsChange: () => void
  collapsed: boolean
  onToggleCollapse: () => void
}

export function Sidebar({
  sessions,
  currentSessionId,
  onConfigOpen,
  onSessionsChange,
  collapsed,
  onToggleCollapse,
}: SidebarProps) {
  const router = useRouter()
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const confirmRef = useRef<HTMLDivElement>(null)

  // Close confirmation popover on outside click
  useEffect(() => {
    if (!pendingDeleteId) return
    const handler = (e: MouseEvent) => {
      if (confirmRef.current && !confirmRef.current.contains(e.target as Node)) {
        setPendingDeleteId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pendingDeleteId])

  const handleNewChat = () => {
    if (currentSessionId === 'new') return
    router.push('/chat/new')
  }

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    setPendingDeleteId(id)
  }

  const handleDeleteConfirm = async (id: string) => {
    setPendingDeleteId(null)
    await fetch(`/api/sessions/${id}`, { method: 'DELETE' })
    onSessionsChange()
    if (id === currentSessionId) {
      const remaining = sessions.filter(s => s.id !== id)
      router.push(remaining.length > 0 ? `/chat/${remaining[0].id}` : '/chat/new')
    }
  }

  const groupSessionsByDate = (sessions: Session[]) => {
    const groups: Record<string, Session[]> = {}
    sessions.forEach(s => {
      const label = formatDate(s.updatedAt)
      if (!groups[label]) groups[label] = []
      groups[label].push(s)
    })
    return groups
  }

  const groups = groupSessionsByDate(sessions)

  const STATUS_DOT: Record<SessionStatus, string> = {
    ACTIVE: 'bg-emerald-400',
    PAUSED: 'bg-amber-400',
    FAILED: 'bg-red-400',
    COMPLETED: 'bg-slate-400',
  }

  // ── Collapsed sidebar — icon-only strip ───────────────────────────────────
  if (collapsed) {
    return (
      <aside
        className="flex flex-col h-full shrink-0 overflow-hidden"
        style={{
          width: '48px',
          background: '#1E293B',
          borderRight: '1px solid #334155',
          transition: 'width 200ms ease',
        }}
      >
        {/* Logo — click to expand */}
        <div className="flex flex-col items-center pt-4 pb-2 gap-2 px-2">
          <button
            onClick={onToggleCollapse}
            className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center text-white text-xs font-bold hover:bg-indigo-400 transition-colors"
            title="展开侧边栏"
          >
            D
          </button>
          <button
            onClick={handleNewChat}
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
              currentSessionId === 'new'
                ? 'bg-indigo-700 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            )}
            title="新对话"
          >
            <PlusIcon size={14} />
          </button>
        </div>

        <div className="flex-1" />

        {/* Bottom icons */}
        <div className="flex flex-col items-center gap-2 px-2 py-3 border-t border-slate-700">
          <button
            onClick={onConfigOpen}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 flex items-center justify-center transition-colors"
            title="系统配置"
          >
            <Settings2Icon size={14} />
          </button>
          <button
            onClick={onToggleCollapse}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 flex items-center justify-center transition-colors"
            title="展开侧边栏"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </aside>
    )
  }

  // ── Expanded sidebar ──────────────────────────────────────────────────────
  return (
    <aside
      className="flex flex-col h-full shrink-0 overflow-hidden"
      style={{
        width: '240px',
        background: '#1E293B',
        borderRight: '1px solid #334155',
        transition: 'width 200ms ease',
      }}
    >
      {/* Header */}
      <div className="px-4 pt-5 pb-3">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
            D
          </div>
          <span className="text-white font-semibold text-sm flex-1 truncate">Dashboard Agent</span>
          {/* Collapse toggle */}
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition-colors shrink-0"
            title="收起侧边栏"
          >
            <ChevronLeft size={14} />
          </button>
        </div>

        <button
          onClick={handleNewChat}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors border',
            currentSessionId === 'new'
              ? 'bg-indigo-700 text-white border-indigo-500'
              : 'text-slate-300 hover:text-white hover:bg-slate-700 border-slate-600 hover:border-slate-500'
          )}
        >
          <PlusIcon size={14} />
          新对话
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {Object.entries(groups).map(([date, dateSessions]) => (
          <div key={date} className="mb-2">
            <div className="px-2 py-1 text-xs text-slate-500 font-medium">{date}</div>
            {dateSessions.map(session => (
              <div key={session.id} className="relative">
                <div
                  onClick={() => router.push(`/chat/${session.id}`)}
                  className={cn(
                    'group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors text-sm',
                    session.id === currentSessionId
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                  )}
                >
                  <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', STATUS_DOT[session.status])} />
                  <span className="flex-1 truncate text-xs">{session.title}</span>
                  <button
                    onClick={e => handleDeleteClick(e, session.id)}
                    className={cn(
                      'opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 hover:text-red-400 transition-all shrink-0',
                      session.id === currentSessionId && 'text-white/60 hover:text-red-300'
                    )}
                    title="删除对话"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>

                {/* Delete confirmation popover */}
                {pendingDeleteId === session.id && (
                  <div
                    ref={confirmRef}
                    className="absolute right-0 top-full mt-0.5 z-50 bg-slate-800 border border-slate-600 rounded-lg p-2.5 shadow-xl"
                    style={{ minWidth: '148px' }}
                  >
                    <p className="text-xs text-slate-300 mb-2 leading-snug">确认删除此对话？</p>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setPendingDeleteId(null)}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-xs text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                      >
                        <X size={10} /> 取消
                      </button>
                      <button
                        onClick={() => handleDeleteConfirm(session.id)}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-xs font-medium text-red-400 hover:text-white hover:bg-red-600 transition-colors"
                      >
                        <Check size={10} /> 删除
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}

        {sessions.length === 0 && (
          <div className="text-center text-slate-600 text-xs pt-8">
            还没有对话
            <br />
            点击上方开始
          </div>
        )}
      </div>

      {/* Bottom */}
      <div className="px-3 py-3 border-t border-slate-700">
        <button
          onClick={onConfigOpen}
          className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors text-xs"
        >
          <Settings2Icon size={14} />
          系统配置
        </button>
      </div>
    </aside>
  )
}
