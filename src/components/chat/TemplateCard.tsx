'use client'
import { useState, useEffect, useRef } from 'react'
import { Eye, Maximize2, Download, LayoutDashboard } from 'lucide-react'
import { ScoreBadge } from '@/components/progress/ScoreBadge'
import { downloadTemplateHtml } from '@/lib/utils'

interface TemplateCardProps {
  templateId: string
  onPreview: () => void
}

interface TemplateInfo {
  id: string
  score: number
  session?: { title?: string }
}

export function TemplateCard({ templateId, onPreview }: TemplateCardProps) {
  const [info, setInfo] = useState<TemplateInfo | null>(null)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    fetch(`/api/templates/${templateId}`)
      .then(r => r.json())
      .then(setInfo)
      .catch(() => {})
    // Reset loaded state when templateId changes
    setIframeLoaded(false)
  }, [templateId])

  const score = info?.score ?? 85

  return (
    <div
      className="rounded-xl border overflow-hidden max-w-sm"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)', boxShadow: 'var(--shadow-card)' }}
    >
      {/* Preview thumbnail */}
      <div
        className="relative overflow-hidden cursor-pointer"
        style={{ height: '140px', background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)' }}
        onClick={onPreview}
      >
        <iframe
          ref={iframeRef}
          src={`/api/templates/${templateId}/preview`}
          className="absolute inset-0 w-full pointer-events-none origin-top-left"
          style={{
            transform: 'scale(0.35)',
            width: '285%',
            height: '285%',
            border: 'none',
            opacity: iframeLoaded ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}
          sandbox="allow-scripts"
          title="Dashboard preview"
          onLoad={() => setIframeLoaded(true)}
        />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/20">
          <span className="bg-white/90 text-gray-800 text-xs font-medium px-3 py-1.5 rounded-full">点击预览</span>
        </div>
      </div>

      {/* Card body */}
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <LayoutDashboard size={14} style={{ color: 'var(--color-primary)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--color-text-1)' }}>
              仪表板模板已生成
            </span>
          </div>
          <ScoreBadge score={score} />
        </div>

        <div className="flex gap-2">
          <button
            onClick={onPreview}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:bg-indigo-50"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-primary)' }}
          >
            <Eye size={12} /> 预览
          </button>
          <button
            onClick={() => window.open(`/api/templates/${templateId}/preview`, '_blank')}
            className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg text-xs border transition-colors hover:bg-gray-50"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-2)' }}
          >
            <Maximize2 size={12} />
          </button>
          <button
            onClick={() => downloadTemplateHtml(templateId)}
            className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg text-xs border transition-colors hover:bg-gray-50"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-2)' }}
          >
            <Download size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}
