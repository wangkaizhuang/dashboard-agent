'use client'
import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ExternalLink, Download } from 'lucide-react'
import { downloadTemplateHtml } from '@/lib/utils'

interface FullscreenPreviewProps {
  templateId: string | null
  onClose: () => void
}

export function FullscreenPreview({ templateId, onClose }: FullscreenPreviewProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (templateId) {
      document.addEventListener('keydown', handleEsc)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleEsc)
      document.body.style.overflow = ''
    }
  }, [templateId, onClose])

  const handleDownload = () => { if (templateId) downloadTemplateHtml(templateId) }

  return (
    <AnimatePresence>
      {templateId && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 bg-white flex flex-col"
        >
          {/* Top bar */}
          <div
            className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
          >
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <button onClick={onClose} className="w-3 h-3 rounded-full bg-red-400 hover:bg-red-500 transition-colors" />
                <div className="w-3 h-3 rounded-full bg-amber-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              <span className="text-sm font-medium" style={{ color: 'var(--color-text-1)' }}>
                仪表板预览
              </span>
              <span className="text-xs text-slate-400 font-mono hidden sm:block">
                ESC 关闭
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => window.open(`/api/templates/${templateId}/preview`, '_blank')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <ExternalLink size={12} /> 新标签
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <Download size={12} /> 下载
              </button>
              <button
                onClick={onClose}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X size={14} /> 关闭
              </button>
            </div>
          </div>

          {/* iframe */}
          <iframe
            src={`/api/templates/${templateId}/preview`}
            className="flex-1 border-0"
            sandbox="allow-scripts"
            title="Dashboard fullscreen preview"
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
