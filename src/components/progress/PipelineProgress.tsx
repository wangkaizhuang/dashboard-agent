'use client'
import { usePipelineStore } from '@/store/pipeline'
import { StepCard } from './StepCard'
import { STEP_ORDER } from '@/types'

export function PipelineProgress() {
  const { steps } = usePipelineStore()

  return (
    <div className="space-y-2 p-3">
      {STEP_ORDER.map((stepName, index) => {
        const step = steps[index]
        if (!step) return null
        return (
          <StepCard
            key={stepName}
            stepName={stepName}
            stepIndex={index}
            status={step.status}
            content={step.content}
            thinking={step.thinking}
            score={step.score}
            issues={step.issues}
          />
        )
      })}
    </div>
  )
}
