'use client'

interface ProgressPanelProps {
  sessionId: string
  view: 'progress' | 'preview'
  templateId: string | null
  onViewChange: (view: 'progress' | 'preview') => void
}

export function ProgressPanel({ sessionId, view }: ProgressPanelProps) {
  return (
    <aside
      className="flex flex-col h-full overflow-hidden hidden xl:flex"
      style={{
        width: '380px',
        minWidth: '380px',
        background: 'var(--color-surface)',
        borderLeft: '1px solid var(--color-border)'
      }}
    >
      <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
        Progress panel — session: {sessionId}
      </div>
    </aside>
  )
}
