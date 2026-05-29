'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, RefreshCw, ExternalLink, Download, Monitor, Smartphone, Pencil, X as XIcon } from 'lucide-react'
import { cn, downloadTemplateHtml } from '@/lib/utils'
import type { Annotation } from '@/types'

interface ComponentBounds {
  top: number
  left: number
  width: number
  height: number
}

interface HoveredComponent {
  id: string
  label: string
  bounds: ComponentBounds
}

interface TemplatePreviewProps {
  templateId: string
  onFullscreen?: () => void
  className?: string
  showToolbar?: boolean
  /** Increment from outside to force the iframe to reload (e.g. after partial update) */
  refreshTrigger?: number
  // Annotation state — controlled by parent (ProgressPanel) so it persists
  // across fullscreen toggles. Falls back to internal state if not provided.
  annotationMode?: boolean
  onAnnotationModeChange?: (mode: boolean) => void
  annotationsAdded?: Annotation[]
  onAnnotationAdd?: (a: Annotation) => void
  onAnnotationRemove?: (componentId: string) => void
}

export function TemplatePreview({
  templateId,
  onFullscreen,
  className = '',
  showToolbar = true,
  refreshTrigger,
  annotationMode: annotationModeProp,
  onAnnotationModeChange,
  annotationsAdded = [],
  onAnnotationAdd,
}: TemplatePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop')
  const [refreshKey, setRefreshKey] = useState(0)
  const prevRefreshTrigger = useRef(refreshTrigger)
  // Portal requires the DOM to exist — wait for mount
  const [mounted, setMounted] = useState(false)

  // Support both controlled (from ProgressPanel) and uncontrolled annotation mode
  const isControlled = annotationModeProp !== undefined
  const [annotationModeInternal, setAnnotationModeInternal] = useState(false)
  const annotationMode = isControlled ? annotationModeProp! : annotationModeInternal

  const setAnnotationMode = useCallback((next: boolean) => {
    if (isControlled) {
      onAnnotationModeChange?.(next)
    } else {
      setAnnotationModeInternal(next)
    }
  }, [isControlled, onAnnotationModeChange])

  const [hovered, setHovered] = useState<HoveredComponent | null>(null)
  const [locked, setLocked] = useState<HoveredComponent | null>(null)
  const [lockNote, setLockNote] = useState('')

  const previewUrl = `/api/templates/${templateId}/preview`

  useEffect(() => { setMounted(true) }, [])

  // When the parent signals a new template version (e.g. after partial update),
  // force the iframe to reload by incrementing the key.
  useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger !== prevRefreshTrigger.current) {
      prevRefreshTrigger.current = refreshTrigger
      setRefreshKey(k => k + 1)
    }
  }, [refreshTrigger])

  // ── Push annotation mode into the iframe via postMessage ──────────────────
  // Must fire both immediately (if iframe already loaded) and on iframe load
  // (in case the user toggles before the iframe finishes).
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const send = () => {
      iframe.contentWindow?.postMessage(
        { type: 'dc:setAnnotationMode', active: annotationMode },
        '*'
      )
    }

    // If already loaded, send now
    send()
    iframe.addEventListener('load', send)
    return () => iframe.removeEventListener('load', send)
  }, [annotationMode, refreshKey])

  // Clear overlays when annotation mode turns off
  useEffect(() => {
    if (!annotationMode) {
      setHovered(null)
      setLocked(null)
    }
  }, [annotationMode])

  // ── Receive postMessage events from iframe tracker ────────────────────────
  useEffect(() => {
    if (!annotationMode) return

    const handler = (e: MessageEvent) => {
      const iframe = iframeRef.current
      if (!iframe) return
      // Only handle messages originating from THIS specific iframe — prevents the
      // normal and fullscreen TemplatePreview instances from cross-firing each
      // other's events when both are mounted simultaneously (e.g. fullscreen mode).
      if (e.source !== iframe.contentWindow) return
      const r = iframe.getBoundingClientRect()

      if (e.data?.type === 'dc:hover' && !locked) {
        const b = e.data.bounds as ComponentBounds
        setHovered({
          id: e.data.componentId,
          label: e.data.componentLabel || e.data.componentId,
          bounds: { top: r.top + b.top, left: r.left + b.left, width: b.width, height: b.height },
        })
      }

      if (e.data?.type === 'dc:hover-end' && !locked) {
        setHovered(null)
      }

      if (e.data?.type === 'dc:click') {
        const b = e.data.bounds as ComponentBounds
        setLocked({
          id: e.data.componentId,
          label: e.data.componentLabel || e.data.componentId,
          bounds: { top: r.top + b.top, left: r.left + b.left, width: b.width, height: b.height },
        })
        setLockNote('')
        setHovered(null)
      }
    }

    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [annotationMode, locked])

  const submitAnnotation = useCallback(() => {
    if (!locked) return
    onAnnotationAdd?.({ componentId: locked.id, componentLabel: locked.label, note: lockNote.trim() })
    setLocked(null)
    setLockNote('')
  }, [locked, lockNote, onAnnotationAdd])

  const handleRefresh = () => setRefreshKey(k => k + 1)

  // ── Portal overlays ───────────────────────────────────────────────────────
  // Rendered at document.body to bypass Framer Motion's transform stacking context,
  // which would otherwise offset position:fixed descendants.
  const hoverOverlay = mounted && annotationMode && hovered && !locked
    ? createPortal(
        <div
          className="fixed pointer-events-none border-2 border-indigo-500 rounded-lg z-[9999] transition-all duration-100"
          style={{ top: hovered.bounds.top, left: hovered.bounds.left, width: hovered.bounds.width, height: hovered.bounds.height }}
        >
          <span className="absolute -top-6 left-0 bg-indigo-500 text-white text-xs px-2 py-0.5 rounded-md whitespace-nowrap shadow-md">
            {hovered.label}
          </span>
        </div>,
        document.body
      )
    : null

  const lockOverlay = mounted && annotationMode && locked
    ? createPortal(
        <>
          {/* Orange selection border */}
          <div
            className="fixed pointer-events-none border-2 border-orange-400 rounded-lg z-[9999]"
            style={{ top: locked.bounds.top, left: locked.bounds.left, width: locked.bounds.width, height: locked.bounds.height }}
          />
          {/* Floating note input */}
          <div
            className="fixed z-[9999] bg-white rounded-xl shadow-2xl border border-orange-200 p-3 w-64"
            style={{
              top: locked.bounds.top,
              left: Math.min(locked.bounds.left + locked.bounds.width + 8, window.innerWidth - 272),
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-orange-700 truncate max-w-[180px]">{locked.label}</span>
              <button onClick={() => setLocked(null)} className="text-slate-400 hover:text-slate-600 ml-2 shrink-0">
                <XIcon size={12} />
              </button>
            </div>
            <input
              autoFocus
              value={lockNote}
              onChange={e => setLockNote(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitAnnotation() }
                if (e.key === 'Escape') setLocked(null)
              }}
              placeholder="补充注释（可选）…"
              className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 mb-2"
            />
            <button
              onClick={submitAnnotation}
              className="w-full text-xs font-medium bg-orange-500 hover:bg-orange-600 text-white rounded-lg py-1.5 transition-colors"
            >
              添加注释 →
            </button>
          </div>
        </>,
        document.body
      )
    : null

  const annotationBtn = (
    <button
      onClick={() => setAnnotationMode(!annotationMode)}
      className={cn(
        'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
        annotationMode
          ? 'bg-indigo-100 text-indigo-700'
          : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
      )}
      title={annotationMode ? '退出注释模式' : '进入注释模式（悬停组件添加注释）'}
    >
      <Pencil size={11} />
      <span>{annotationMode ? '退出注释' : '注释'}</span>
      {annotationsAdded.length > 0 && (
        <span className="ml-0.5 px-1 py-0.5 rounded-full bg-indigo-500 text-white text-[10px] leading-none">
          {annotationsAdded.length}
        </span>
      )}
    </button>
  )

  return (
    <div className={cn('flex flex-col h-full overflow-hidden rounded-xl border', className)} style={{ borderColor: 'var(--color-border)' }}>
      {showToolbar && (
        <div
          className="shrink-0 flex items-center gap-2 px-3 py-2 border-b"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
        >
          {/* URL bar */}
          <div
            className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono truncate"
            style={{ background: '#F1F5F9', color: 'var(--color-text-2)' }}
          >
            <div className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
            <span className="truncate">/api/templates/{templateId.slice(0, 8)}…/preview</span>
          </div>

          {/* View mode toggle */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg" style={{ background: '#F1F5F9' }}>
            <button
              onClick={() => setViewMode('desktop')}
              className={cn('p-1.5 rounded-md transition-colors', viewMode === 'desktop' ? 'bg-white shadow-sm text-slate-700' : 'text-slate-400 hover:text-slate-600')}
              title="桌面端"
            >
              <Monitor size={13} />
            </button>
            <button
              onClick={() => setViewMode('mobile')}
              className={cn('p-1.5 rounded-md transition-colors', viewMode === 'mobile' ? 'bg-white shadow-sm text-slate-700' : 'text-slate-400 hover:text-slate-600')}
              title="移动端"
            >
              <Smartphone size={13} />
            </button>
          </div>

          <button onClick={handleRefresh} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors" title="刷新">
            <RefreshCw size={13} />
          </button>
          <button onClick={() => window.open(previewUrl, '_blank')} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors" title="新标签页">
            <ExternalLink size={13} />
          </button>
          <button onClick={() => downloadTemplateHtml(templateId)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors" title="下载 HTML">
            <Download size={13} />
          </button>

          {annotationBtn}

          {onFullscreen && (
            <button
              onClick={onFullscreen}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
            >
              <Maximize2 size={11} /> 全屏
            </button>
          )}
        </div>
      )}

      {/* iframe container */}
      <div className="flex-1 overflow-hidden flex items-center justify-center relative" style={{ background: '#F8FAFC' }}>
        <div
          className="h-full transition-all duration-300 overflow-hidden shadow-md"
          style={{
            width: viewMode === 'mobile' ? '390px' : '100%',
            borderRadius: viewMode === 'mobile' ? '24px' : '0',
            border: viewMode === 'mobile' ? '8px solid #1E293B' : 'none',
          }}
        >
          <iframe
            key={refreshKey}
            ref={iframeRef}
            src={previewUrl}
            className="w-full h-full border-0"
            sandbox="allow-scripts"
            title="Dashboard template preview"
            loading="lazy"
          />
        </div>

        {/* Hint banner — shown when annotation mode is on but no component is focused */}
        {annotationMode && !hovered && !locked && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-slate-800/80 text-white text-xs pointer-events-none whitespace-nowrap">
            悬停组件查看高亮，点击选中并添加注释
          </div>
        )}
      </div>

      {/* Portal overlays — rendered at body level to escape Framer Motion transform stacking context */}
      {hoverOverlay}
      {lockOverlay}
    </div>
  )
}
