'use client'

interface ChatPanelProps {
  sessionId: string
  onTemplateReady: (templateId: string) => void
  onSessionTitleChange: () => void
}

export function ChatPanel({ sessionId }: ChatPanelProps) {
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
      {/* This component will be fully implemented by the Chat Engine agent */}
      <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
        Chat panel — session: {sessionId}
      </div>
    </div>
  )
}
