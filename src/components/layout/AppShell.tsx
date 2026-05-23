'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from './Sidebar'
import { ChatPanel } from './ChatPanel'
import { ProgressPanel } from './ProgressPanel'
import { ConfigDrawer } from '@/components/settings/ConfigDrawer'
import type { Session } from '@/types'

export function AppShell({ sessionId }: { sessionId: string }) {
  const router = useRouter()
  const [sessions, setSessions] = useState<Session[]>([])
  const [rightView, setRightView] = useState<'progress' | 'preview'>('progress')
  const [configOpen, setConfigOpen] = useState(false)
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null)

  const refreshSessions = useCallback(() => {
    fetch('/api/sessions').then(r => r.json()).then(setSessions).catch(console.error)
  }, [])

  useEffect(() => { refreshSessions() }, [refreshSessions])

  // Redirect /chat/new → create a real session and navigate to it
  useEffect(() => {
    if (sessionId !== 'new') return
    const params = new URLSearchParams(window.location.search)
    const mode = params.get('mode') || 'QUICK'
    fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode })
    })
      .then(r => r.json())
      .then(session => {
        refreshSessions()
        router.replace(`/chat/${session.id}`)
      })
      .catch(console.error)
  }, [sessionId, router, refreshSessions])

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
