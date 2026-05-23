'use client'
import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from './Sidebar'
import { ChatPanel } from './ChatPanel'
import { ProgressPanel } from './ProgressPanel'
import { ConfigDrawer } from '@/components/settings/ConfigDrawer'
import type { Session, Annotation } from '@/types'

export function AppShell({ sessionId }: { sessionId: string }) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [rightView, setRightView] = useState<'progress' | 'preview'>('progress')
  const [configOpen, setConfigOpen] = useState(false)
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null)

  // Annotation state — lifted here so both ChatPanel (chips) and ProgressPanel (overlay) can share it
  const [annotations, setAnnotations] = useState<Annotation[]>([])

  const refreshSessions = useCallback(() => {
    fetch('/api/sessions').then(r => r.json()).then(setSessions).catch(console.error)
  }, [])

  useEffect(() => { refreshSessions() }, [refreshSessions])

  // Reset preview panel and annotations when the user navigates to a different session
  useEffect(() => {
    setPreviewTemplateId(null)
    setRightView('progress')
    setAnnotations([])
  }, [sessionId])

  const handleAnnotationAdd = useCallback((a: Annotation) => {
    setAnnotations(prev => {
      const exists = prev.find(x => x.componentId === a.componentId)
      if (exists) return prev.map(x => x.componentId === a.componentId ? a : x)
      return [...prev, a]
    })
  }, [])

  const handleAnnotationRemove = useCallback((componentId: string) => {
    setAnnotations(prev => prev.filter(a => a.componentId !== componentId))
  }, [])

  const handleAnnotationClear = useCallback(() => {
    setAnnotations([])
  }, [])

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
          onSessionCreated={refreshSessions}
          annotations={annotations}
          onAnnotationRemove={handleAnnotationRemove}
          onAnnotationClear={handleAnnotationClear}
        />
        <ProgressPanel
          sessionId={sessionId}
          view={rightView}
          templateId={previewTemplateId}
          onViewChange={setRightView}
          annotations={annotations}
          onAnnotationAdd={handleAnnotationAdd}
          onAnnotationRemove={handleAnnotationRemove}
        />
      </main>
      <ConfigDrawer open={configOpen} onClose={() => setConfigOpen(false)} />
    </div>
  )
}
