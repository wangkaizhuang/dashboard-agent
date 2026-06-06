'use client'
import { GitBranch } from 'lucide-react'
import { TemplateCard } from './TemplateCard'
import { ExpertQuestionCard } from './ExpertQuestionCard'
import { ScoreReportCard } from './ScoreReportCard'
import { IntentChoiceCard } from './IntentChoiceCard'
import { PipelineProgressCard } from './PipelineProgressCard'
import type { PipelineProgressMetadata } from './PipelineProgressCard'
import type { Message, ExpertQuestion } from '@/types'

interface MessageItemProps {
  message: Message
  onTemplatePreview: (templateId: string) => void
  onExpertAnswered: () => void
  expertIndex?: number
  expertTotal?: number
  /** Fork a new session from this turn's node. */
  onFork?: (fromMessageId: string) => void
  /** Submit the continue/regenerate choice for an unrelated request. */
  onIntentChoose?: (messageId: string, choice: 'continue' | 'regenerate') => Promise<void>
}

export function MessageItem({ message, onTemplatePreview, onExpertAnswered, expertIndex, expertTotal, onFork, onIntentChoose }: MessageItemProps) {
  const isUser = message.role === 'USER'

  if (message.type === 'TEMPLATE_CARD' && message.metadata?.templateId) {
    return (
      <div className="flex justify-start px-4 py-1">
        <TemplateCard
          templateId={message.metadata.templateId as string}
          onPreview={() => onTemplatePreview(message.metadata!.templateId as string)}
        />
      </div>
    )
  }

  if (message.type === 'EXPERT_QUESTION' && message.metadata) {
    const meta = message.metadata as unknown as ExpertQuestion
    return (
      <div className="flex justify-start px-4 py-1" data-eqid={meta.id}>
        <ExpertQuestionCard
          questionId={meta.id}
          question={meta.question}
          options={meta.options as { label: string; value: string }[]}
          onAnswered={onExpertAnswered}
          initialAnswered={meta.answered}
          initialAnswer={meta.answer ?? meta.customText ?? undefined}
          index={expertIndex}
          total={expertTotal}
        />
      </div>
    )
  }

  if (message.type === 'INTENT_CHOICE' && message.metadata && onIntentChoose) {
    const m = message.metadata as { messageId: string; reason?: string }
    return (
      <div className="flex justify-start px-4 py-1">
        <IntentChoiceCard reason={m.reason} onChoose={choice => onIntentChoose(m.messageId, choice)} />
      </div>
    )
  }

  // Pipeline progress card — stored as TEXT with metadata.pipelineProgress = true.
  // This is the persisted per-turn node; the fork button anchors here.
  if (message.type === 'TEXT' && message.metadata?.pipelineProgress === true) {
    return (
      <div className="flex flex-col items-start px-4 py-1">
        <PipelineProgressCard metadata={message.metadata as unknown as PipelineProgressMetadata} />
        {onFork && !message.id.startsWith('temp') && (
          <button
            onClick={() => onFork(message.id)}
            className="mt-1 ml-1 flex items-center gap-1 text-[11px] text-slate-400 hover:text-indigo-600 transition-colors"
            title="基于此处分叉一个新会话（带当前及之前的历史）"
          >
            <GitBranch size={11} /> 从此分叉新会话
          </button>
        )}
      </div>
    )
  }

  if (message.type === 'SCORE_REPORT' && message.metadata) {
    const meta = message.metadata as { stepName: string; score: number; issues: string[]; threshold: number }
    return (
      <div className="flex justify-start px-4 py-1">
        <ScoreReportCard
          stepName={meta.stepName}
          score={meta.score}
          issues={meta.issues || []}
          threshold={meta.threshold || 30}
        />
      </div>
    )
  }

  // Normal text message bubble
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} px-4 py-1`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'rounded-tr-sm text-white'
            : 'rounded-tl-sm'
        }`}
        style={
          isUser
            ? { background: '#4F46E5' }
            : { background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-1)' }
        }
      >
        {message.content}
      </div>
    </div>
  )
}
