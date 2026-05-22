import { openai, MODEL } from '@/lib/ai/client'
import * as P from '@/lib/ai/prompts/requirements'
import * as PB from '@/lib/ai/prompts/breakdown'
import * as PL from '@/lib/ai/prompts/layout'
import * as PM from '@/lib/ai/prompts/mockdata'
import * as PT from '@/lib/ai/prompts/template'
import type { SSEEvent, StepName } from '@/types'

type SendFn = (event: SSEEvent) => void

interface StepInput {
  stepIndex: number
  stepName: StepName
  userInput: string
  history: string
  previousOutputs: Record<string, string>
}

export async function runQuickStep(input: StepInput, send: SendFn): Promise<string> {
  const { stepIndex, stepName, userInput, history, previousOutputs } = input

  send({ type: 'step_start', stepIndex, stepName })

  let systemPrompt = ''
  let userPrompt = ''

  switch (stepName) {
    case 'REQUIREMENTS_ANALYSIS':
      systemPrompt = P.REQUIREMENTS_SYSTEM
      userPrompt = P.REQUIREMENTS_USER(userInput, history)
      break
    case 'THOUGHT_BREAKDOWN':
      systemPrompt = PB.BREAKDOWN_SYSTEM
      userPrompt = PB.BREAKDOWN_USER(previousOutputs['REQUIREMENTS_ANALYSIS'] || '', history)
      break
    case 'LAYOUT_PLANNING':
      systemPrompt = PL.LAYOUT_SYSTEM
      userPrompt = PL.LAYOUT_USER(previousOutputs['REQUIREMENTS_ANALYSIS'] || '', previousOutputs['THOUGHT_BREAKDOWN'] || '')
      break
    case 'MOCK_DATA':
      systemPrompt = PM.MOCKDATA_SYSTEM
      userPrompt = PM.MOCKDATA_USER(previousOutputs['LAYOUT_PLANNING'] || '', previousOutputs['REQUIREMENTS_ANALYSIS'] || '')
      break
    case 'TEMPLATE_GENERATION':
      systemPrompt = PT.TEMPLATE_SYSTEM
      userPrompt = PT.TEMPLATE_USER(
        previousOutputs['REQUIREMENTS_ANALYSIS'] || '',
        previousOutputs['LAYOUT_PLANNING'] || '',
        previousOutputs['MOCK_DATA'] || ''
      )
      break
  }

  let fullContent = ''

  const stream = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    stream: true,
    max_tokens: stepName === 'TEMPLATE_GENERATION' ? 8000 : 2000,
  })

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content || ''
    if (delta) {
      fullContent += delta
      send({ type: 'step_content', stepIndex, delta })
    }
  }

  return fullContent
}
