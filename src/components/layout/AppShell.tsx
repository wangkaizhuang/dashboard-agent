'use client'
import { useState, useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { ChatPanel } from './ChatPanel'
import { ProgressPanel } from './ProgressPanel'
import { ConfigDrawer } from '@/components/settings/ConfigDrawer'
import type { Session } from '@/types'

export function AppShell({ sessionId }: { sessionId: string }) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [rightView, setRightView] = useState<'progress' | 'preview'>('progress')
  const [configOpen, setConfigOpen] = useState(false)
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/sessions').then(r => r.json()).then(setSessions).catch(console.error)
  }, [])

  const refreshSessions = () => {
    fetch('/api/sessions').then(r => r.json()).then(setSessions).catch(console.error)
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        sessions={sessions}
        currentSessionId={sessionId}
        onConfigOpen={() => setConfigOpen(true)}
        onSessionsChange={refreshSessions}
      />
      <main className="flex-1 flex min-w-0 overflow-hidden" style={{ background: 'var(--color-bg)' }}>
        <ChatPanel
          sessionId={sessionId}
          onTemplateReady={(templateId) => {
            setPreviewTemplateId(templateId)
            setRightView('preview')
          }}
          onSessionTitleChange={refreshSessions}
        />
        <ProgressPanel
          sessionId={sessionId}
          view={rightView}
          templateId={previewTemplateId}
          onViewChange={setRightView}
        />
      </main>
      <ConfigDrawer open={configOpen} onClose={() => setConfigOpen(false)} />
    </div>
  )
}
