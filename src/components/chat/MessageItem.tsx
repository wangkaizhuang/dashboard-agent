'use client'
import { TemplateCard } from './TemplateCard'
import { ExpertQuestionCard } from './ExpertQuestionCard'
import { ScoreReportCard } from './ScoreReportCard'
import { PipelineProgressCard } from './PipelineProgressCard'
import type { PipelineProgressMetadata } from './PipelineProgressCard'
import type { Message, ExpertQuestion } from '@/types'

interface MessageItemProps {
  message: Message
  onTemplatePreview: (templateId: string) => void
  onExpertAnswered: () => void
}

export function MessageItem({ message, onTemplatePreview, onExpertAnswered }: MessageItemProps) {
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
      <div className="flex justify-start px-4 py-1">
        <ExpertQuestionCard
          questionId={meta.id}
          question={meta.question}
          options={meta.options as { label: string; value: string }[]}
          onAnswered={onExpertAnswered}
          initialAnswered={meta.answered}
          initialAnswer={meta.answer ?? meta.customText ?? undefined}
        />
      </div>
    )
  }

  // Pipeline progress card — stored as TEXT with metadata.pipelineProgress = true
  if (message.type === 'TEXT' && message.metadata?.pipelineProgress === true) {
    return (
      <div className="flex justify-start px-4 py-1">
        <PipelineProgressCard metadata={message.metadata as unknown as PipelineProgressMetadata} />
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
