'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Sidebar } from './Sidebar'
import { ChatPanel } from './ChatPanel'
import { ProgressPanel } from './ProgressPanel'
import { ConfigDrawer } from '@/components/settings/ConfigDrawer'
import type { Session, Annotation } from '@/types'

const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsed'
const PREVIEW_WIDTH_KEY = 'previewPanelWidth'
const MIN_CHAT_WIDTH = 300
const MIN_PREVIEW_WIDTH = 320
const DEFAULT_PREVIEW_WIDTH = 380

export function AppShell({ sessionId }: { sessionId: string }) {
  // Seed from localStorage so the sidebar is never empty on first render even
  // before the /api/sessions response arrives (avoids "还没有对话" flash).
  const [sessions, setSessions] = useState<Session[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const cached = localStorage.getItem('cachedSessions')
      return cached ? (JSON.parse(cached) as Session[]) : []
    } catch { return [] }
  })
  const [rightView, setRightView] = useState<'progress' | 'preview'>('progress')
  const [configOpen, setConfigOpen] = useState(false)
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null)
  // Monotonically-incrementing counter — passed to TemplatePreview so it can
  // force an iframe reload on each template_ready event, even when the templateId
  // doesn't change (e.g. partial updates to the same session template).
  const [previewVersion, setPreviewVersion] = useState(0)

  // Sidebar collapse — persisted in localStorage
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Preview panel width — persisted and resizable via drag
  const [previewWidth, setPreviewWidth] = useState(DEFAULT_PREVIEW_WIDTH)
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, width: DEFAULT_PREVIEW_WIDTH })

  // Annotation state — lifted so both ChatPanel (chips) and ProgressPanel (overlay) share it
  const [annotations, setAnnotations] = useState<Annotation[]>([])

  // ── Restore persisted layout on mount ──────────────────────────────────
  useEffect(() => {
    const collapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
    if (collapsed !== null) setSidebarCollapsed(collapsed === 'true')

    const savedWidth = localStorage.getItem(PREVIEW_WIDTH_KEY)
    if (savedWidth) {
      const w = parseInt(savedWidth, 10)
      if (!isNaN(w) && w >= MIN_PREVIEW_WIDTH) setPreviewWidth(w)
    }
  }, [])

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
      return next
    })
  }, [])

  const refreshSessions = useCallback(() => {
    fetch('/api/sessions')
      .then(r => r.json())
      .then((data: Session[]) => {
        setSessions(data)
        // Persist so the next AppShell mount has instant data
        try { localStorage.setItem('cachedSessions', JSON.stringify(data)) } catch { /* ignore */ }
      })
      .catch(console.error)
  }, [])

  useEffect(() => { refreshSessions() }, [refreshSessions])

  // Reset preview panel and annotations when the user navigates to a different session
  useEffect(() => {
    setPreviewTemplateId(null)
    setRightView('progress')
    setAnnotations([])
  }, [sessionId])

  // ── Annotation handlers ─────────────────────────────────────────────────
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

  // ── Draggable divider (pointer capture for reliable drag) ───────────────
  const handleDividerPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    isDragging.current = true
    dragStart.current = { x: e.clientX, width: previewWidth }
  }, [previewWidth])

  const handleDividerPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return
    // Dragging LEFT increases preview width; dragging RIGHT decreases it
    const delta = dragStart.current.x - e.clientX
    const sidebarW = sidebarCollapsed ? 48 : 240
    const maxPreview = window.innerWidth - sidebarW - MIN_CHAT_WIDTH - 6 // 6px = divider
    const next = Math.max(MIN_PREVIEW_WIDTH, Math.min(dragStart.current.width + delta, maxPreview))
    setPreviewWidth(next)
  }, [sidebarCollapsed])

  const handleDividerPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return
    isDragging.current = false
    const delta = dragStart.current.x - e.clientX
    const sidebarW = sidebarCollapsed ? 48 : 240
    const maxPreview = window.innerWidth - sidebarW - MIN_CHAT_WIDTH - 6
    const final = Math.max(MIN_PREVIEW_WIDTH, Math.min(dragStart.current.width + delta, maxPreview))
    localStorage.setItem(PREVIEW_WIDTH_KEY, String(Math.round(final)))
  }, [sidebarCollapsed])

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        sessions={sessions}
        currentSessionId={sessionId}
        onConfigOpen={() => setConfigOpen(true)}
        onSessionsChange={refreshSessions}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebar}
      />

      <main className="flex-1 flex min-w-0 overflow-hidden" style={{ background: 'var(--color-bg)' }}>
        {/* Chat panel — fills remaining space */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden" style={{ minWidth: MIN_CHAT_WIDTH }}>
          <ChatPanel
            sessionId={sessionId}
            onTemplateReady={(templateId) => {
              setPreviewTemplateId(templateId)
              setPreviewVersion(v => v + 1)  // always increment to force iframe reload
              setRightView('preview')
            }}
            onSessionTitleChange={refreshSessions}
            onSessionCreated={refreshSessions}
            annotations={annotations}
            onAnnotationRemove={handleAnnotationRemove}
            onAnnotationClear={handleAnnotationClear}
          />
        </div>

        {/* Draggable divider — xl+ only (mirrors ProgressPanel's hidden xl:flex) */}
        <div
          className="hidden xl:flex shrink-0 items-center justify-center cursor-col-resize select-none"
          style={{ width: '6px' }}
          onPointerDown={handleDividerPointerDown}
          onPointerMove={handleDividerPointerMove}
          onPointerUp={handleDividerPointerUp}
        >
          <div
            className="w-px h-8 rounded-full"
            style={{ background: 'var(--color-border)' }}
          />
        </div>

        <ProgressPanel
          sessionId={sessionId}
          view={rightView}
          templateId={previewTemplateId}
          previewVersion={previewVersion}
          onViewChange={setRightView}
          width={previewWidth}
          annotations={annotations}
          onAnnotationAdd={handleAnnotationAdd}
          onAnnotationRemove={handleAnnotationRemove}
        />
      </main>

      <ConfigDrawer open={configOpen} onClose={() => setConfigOpen(false)} />
    </div>
  )
}
