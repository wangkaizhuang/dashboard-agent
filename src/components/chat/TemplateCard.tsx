'use client'
import { useState, useEffect } from 'react'
import { Eye, Maximize2, Download, LayoutDashboard } from 'lucide-react'

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

  useEffect(() => {
    fetch(`/api/templates/${templateId}`)
      .then(r => r.json())
      .then(setInfo)
      .catch(() => {})
  }, [templateId])

  const handleDownload = async () => {
    const res = await fetch(`/api/templates/${templateId}/preview`)
    const html = await res.text()
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dashboard-${templateId.slice(0, 8)}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const score = info?.score ?? 85
  const scoreColor = score >= 80 ? '#10B981' : score >= 60 ? '#F59E0B' : '#EF4444'

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
          src={`/api/templates/${templateId}/preview`}
          className="absolute inset-0 w-full pointer-events-none origin-top-left"
          style={{ transform: 'scale(0.35)', width: '285%', height: '285%', border: 'none' }}
          sandbox="allow-scripts"
          title="Dashboard preview"
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
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ background: `${scoreColor}20`, color: scoreColor }}
          >
            {score}分
          </span>
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
            onClick={handleDownload}
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
