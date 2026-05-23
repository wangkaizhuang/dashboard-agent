'use client'
import { useState, useRef } from 'react'
import { Maximize2, RefreshCw, ExternalLink, Download, Monitor, Smartphone } from 'lucide-react'
import { cn, downloadTemplateHtml } from '@/lib/utils'

interface TemplatePreviewProps {
  templateId: string
  onFullscreen?: () => void
  className?: string
  showToolbar?: boolean
}

export function TemplatePreview({
  templateId,
  onFullscreen,
  className = '',
  showToolbar = true
}: TemplatePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop')
  const [refreshKey, setRefreshKey] = useState(0)

  const previewUrl = `/api/templates/${templateId}/preview`

  const handleRefresh = () => setRefreshKey(k => k + 1)

  const handleDownload = () => downloadTemplateHtml(templateId)

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
              className={cn(
                'p-1.5 rounded-md transition-colors',
                viewMode === 'desktop' ? 'bg-white shadow-sm text-slate-700' : 'text-slate-400 hover:text-slate-600'
              )}
              title="桌面端"
            >
              <Monitor size={13} />
            </button>
            <button
              onClick={() => setViewMode('mobile')}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                viewMode === 'mobile' ? 'bg-white shadow-sm text-slate-700' : 'text-slate-400 hover:text-slate-600'
              )}
              title="移动端"
            >
              <Smartphone size={13} />
            </button>
          </div>

          {/* Actions */}
          <button onClick={handleRefresh} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors" title="刷新">
            <RefreshCw size={13} />
          </button>
          <button
            onClick={() => window.open(previewUrl, '_blank')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="新标签页"
          >
            <ExternalLink size={13} />
          </button>
          <button onClick={handleDownload} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors" title="下载 HTML">
            <Download size={13} />
          </button>
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
      <div className="flex-1 overflow-hidden flex items-center justify-center" style={{ background: '#F8FAFC' }}>
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
      </div>
    </div>
  )
}
