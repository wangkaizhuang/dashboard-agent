'use client'
import { useState } from 'react'
import { LayoutDashboard, ListChecks, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { PipelineProgress } from '@/components/progress/PipelineProgress'
import { TemplatePreview } from '@/components/template/TemplatePreview'
import { usePipelineStore } from '@/store/pipeline'
import { cn } from '@/lib/utils'
import type { Annotation } from '@/types'

interface ProgressPanelProps {
  sessionId: string
  view: 'progress' | 'preview'
  templateId: string | null
  onViewChange: (view: 'progress' | 'preview') => void
  annotations?: Annotation[]
  onAnnotationAdd?: (a: Annotation) => void
  onAnnotationRemove?: (componentId: string) => void
}

export function ProgressPanel({
  view,
  templateId,
  onViewChange,
  annotations = [],
  onAnnotationAdd,
  onAnnotationRemove,
}: ProgressPanelProps) {
  const { isRunning, steps } = usePipelineStore()
  const [isFullscreen, setIsFullscreen] = useState(false)

  const completedSteps = steps.filter(s => s.status === 'COMPLETED').length
  const totalSteps = steps.length

  return (
    <>
      <aside
        className="hidden xl:flex flex-col h-full overflow-hidden"
        style={{
          width: '380px',
          minWidth: '380px',
          background: 'var(--color-surface)',
          borderLeft: '1px solid var(--color-border)'
        }}
      >
        {/* Header */}
        <div
          className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-b"
          style={{ borderColor: 'var(--color-border)' }}
        >
          {/* Progress indicator */}
          <div className="flex-1 min-w-0">
            {isRunning ? (
              <div className="flex items-center gap-2">
                <div className="flex gap-0.5">
                  {steps.map((s, i) => (
                    <div
                      key={i}
                      className={cn(
                        'h-1.5 rounded-full transition-all duration-500',
                        s.status === 'COMPLETED' ? 'bg-emerald-400' :
                        s.status === 'RUNNING' ? 'bg-indigo-400 animate-pulse' :
                        s.status === 'FAILED' ? 'bg-red-400' : 'bg-slate-200'
                      )}
                      style={{ width: s.status === 'RUNNING' ? '32px' : '16px' }}
                    />
                  ))}
                </div>
                <span className="text-xs text-slate-500">{completedSteps}/{totalSteps}</span>
              </div>
            ) : (
              <span className="text-sm font-semibold" style={{ color: 'var(--color-text-1)' }}>
                {templateId ? '生成结果' : '生成进度'}
              </span>
            )}
          </div>

          {/* View toggle */}
          {templateId && (
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100">
              <button
                onClick={() => onViewChange('progress')}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all',
                  view === 'progress' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                )}
              >
                <ListChecks size={11} /> 进度
              </button>
              <button
                onClick={() => onViewChange('preview')}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all',
                  view === 'preview' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                )}
              >
                <LayoutDashboard size={11} /> 预览
              </button>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden relative">
          <AnimatePresence mode="wait">
            {view === 'progress' ? (
              <motion.div
                key="progress"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0 overflow-y-auto"
              >
                {completedSteps === 0 && !isRunning ? (
                  <div className="h-full flex flex-col items-center justify-center text-center px-6">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mb-3 text-slate-400">
                      <ListChecks size={20} />
                    </div>
                    <p className="text-sm text-slate-400">发送消息后这里将显示生成进度</p>
                  </div>
                ) : (
                  <PipelineProgress />
                )}
              </motion.div>
            ) : templateId ? (
              <motion.div
                key="preview"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0"
              >
                <TemplatePreview
                  templateId={templateId}
                  showToolbar={true}
                  onFullscreen={() => setIsFullscreen(true)}
                  annotationsAdded={annotations}
                  onAnnotationAdd={onAnnotationAdd}
                  onAnnotationRemove={onAnnotationRemove}
                  className="h-full rounded-none border-0"
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </aside>

      {/* Fullscreen overlay */}
      <AnimatePresence>
        {isFullscreen && templateId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-white flex flex-col"
          >
            <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b bg-white" style={{ borderColor: 'var(--color-border)' }}>
              <span className="text-sm font-semibold text-slate-700">仪表板预览（全屏）</span>
              <button
                onClick={() => setIsFullscreen(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X size={14} /> 退出全屏
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <TemplatePreview
                templateId={templateId}
                showToolbar={false}
                annotationsAdded={annotations}
                onAnnotationAdd={onAnnotationAdd}
                onAnnotationRemove={onAnnotationRemove}
                className="h-full rounded-none border-0"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
