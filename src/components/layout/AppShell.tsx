'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Sidebar } from './Sidebar'
import { ChatPanel } from './ChatPanel'
import { ProgressPanel } from './ProgressPanel'
import { ConfigDrawer } from '@/components/settings/ConfigDrawer'
import { cn } from '@/lib/utils'
import type { Session, Annotation } from '@/types'

const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsed'
const PREVIEW_WIDTH_KEY = 'previewPanelWidth'
const MIN_CHAT_WIDTH = 300
const MIN_PREVIEW_WIDTH = 320
const DEFAULT_PREVIEW_WIDTH = 380

export function AppShell({ sessionId }: { sessionId: string }) {
  // Always start with [] to avoid SSR/hydration mismatch.
  // Seed from localStorage in a useEffect (after hydration) so the sidebar
  // is never empty while the /api/sessions fetch is in-flight.
  const [sessions, setSessions] = useState<Session[]>([])
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

  // Mobile-only UI state (< md / < xl). Off-canvas sidebar + progress/preview sheet.
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false)

  // ── Restore persisted layout on mount ──────────────────────────────────
  useEffect(() => {
    // Seed session list from cache so sidebar isn't empty during API fetch
    try {
      const cached = localStorage.getItem('cachedSessions')
      if (cached) setSessions(JSON.parse(cached) as Session[])
    } catch { /* ignore */ }

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
    setMobileSidebarOpen(false)
    setMobilePanelOpen(false)
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
      {/* Sidebar — inline on desktop (md+) */}
      <div className="hidden md:flex h-full">
        <Sidebar
          sessions={sessions}
          currentSessionId={sessionId}
          onConfigOpen={() => setConfigOpen(true)}
          onSessionsChange={refreshSessions}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebar}
        />
      </div>

      {/* Sidebar — off-canvas drawer on mobile (< md) */}
      {mobileSidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
      <div
        className={cn(
          'md:hidden fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-out',
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <Sidebar
          sessions={sessions}
          currentSessionId={sessionId}
          onConfigOpen={() => { setMobileSidebarOpen(false); setConfigOpen(true) }}
          onSessionsChange={refreshSessions}
          collapsed={false}
          onToggleCollapse={() => setMobileSidebarOpen(false)}
          onNavigate={() => setMobileSidebarOpen(false)}
        />
      </div>

      <main className="flex-1 flex min-w-0 overflow-hidden" style={{ background: 'var(--color-bg)' }}>
        {/* Chat panel — fills remaining space. Its header carries the mobile
            hamburger (< md) and the 进度/预览 trigger (< xl). */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden" style={{ minWidth: MIN_CHAT_WIDTH }}>
          <ChatPanel
            sessionId={sessionId}
            onTemplateReady={(templateId, autoOpen) => {
              setPreviewTemplateId(templateId)
              setPreviewVersion(v => v + 1)  // always increment to force iframe reload
              setRightView('preview')
              if (autoOpen) setMobilePanelOpen(true)  // only on a fresh generation
            }}
            onSessionTitleChange={refreshSessions}
            onSessionCreated={refreshSessions}
            annotations={annotations}
            onAnnotationRemove={handleAnnotationRemove}
            onAnnotationClear={handleAnnotationClear}
            onOpenSidebar={() => setMobileSidebarOpen(true)}
            onOpenPanel={() => setMobilePanelOpen(true)}
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
          mobileSheetOpen={mobilePanelOpen}
          onCloseMobileSheet={() => setMobilePanelOpen(false)}
        />
      </main>

      <ConfigDrawer open={configOpen} onClose={() => setConfigOpen(false)} />
    </div>
  )
}
