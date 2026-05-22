'use client'
import { useRouter } from 'next/navigation'
import { PlusIcon, Settings2Icon, Zap, Brain, GraduationCap, Trash2 } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import type { Session, Mode } from '@/types'

interface SidebarProps {
  sessions: Session[]
  currentSessionId: string
  onConfigOpen: () => void
  onSessionsChange: () => void
}

const MODE_CONFIG = {
  QUICK: { label: 'Quick', icon: Zap, color: 'text-emerald-400' },
  THINK: { label: 'Think', icon: Brain, color: 'text-blue-400' },
  EXPERT: { label: 'Expert', icon: GraduationCap, color: 'text-purple-400' },
}

export function Sidebar({ sessions, currentSessionId, onConfigOpen, onSessionsChange }: SidebarProps) {
  const router = useRouter()

  const groupSessionsByDate = (sessions: Session[]) => {
    const groups: Record<string, Session[]> = {}
    sessions.forEach(s => {
      const label = formatDate(s.updatedAt)
      if (!groups[label]) groups[label] = []
      groups[label].push(s)
    })
    return groups
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    await fetch(`/api/sessions/${id}`, { method: 'DELETE' })
    onSessionsChange()
    if (id === currentSessionId) router.push('/chat/new')
  }

  const groups = groupSessionsByDate(sessions)
  const STATUS_DOT: Record<string, string> = {
    ACTIVE: 'bg-emerald-400', PAUSED: 'bg-amber-400',
    FAILED: 'bg-red-400', COMPLETED: 'bg-slate-400'
  }

  return (
    <aside className="flex flex-col h-full w-60 shrink-0 overflow-hidden" style={{ background: '#1E293B', borderRight: '1px solid #334155' }}>
      {/* Header */}
      <div className="px-4 pt-5 pb-3">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center text-white text-xs font-bold">D</div>
          <span className="text-white font-semibold text-sm">Dashboard Agent</span>
        </div>

        {/* Mode chips */}
        <div className="flex gap-1 mb-3">
          {(Object.entries(MODE_CONFIG) as [Mode, typeof MODE_CONFIG.QUICK][]).map(([mode, cfg]) => (
            <button
              key={mode}
              onClick={() => router.push(`/chat/new?mode=${mode}`)}
              className={cn('flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors', 'text-slate-400 hover:text-white hover:bg-slate-700')}
              title={`新建 ${cfg.label} 模式对话`}
            >
              <cfg.icon size={12} className={cfg.color} />
              {cfg.label}
            </button>
          ))}
        </div>

        {/* New chat button */}
        <button
          onClick={() => router.push('/chat/new')}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-700 transition-colors border border-slate-600 hover:border-slate-500"
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
              <div
                key={session.id}
                onClick={() => router.push(`/chat/${session.id}`)}
                className={cn(
                  'group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors text-sm relative',
                  session.id === currentSessionId
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                )}
              >
                <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', STATUS_DOT[session.status] || 'bg-slate-400')} />
                <span className="flex-1 truncate text-xs">{session.title}</span>
                <button
                  onClick={e => handleDelete(e, session.id)}
                  className={cn('opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 hover:text-red-400 transition-all shrink-0',
                    session.id === currentSessionId && 'text-white/60 hover:text-red-300'
                  )}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        ))}
        {sessions.length === 0 && (
          <div className="text-center text-slate-600 text-xs pt-8">还没有对话<br />点击上方开始</div>
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
