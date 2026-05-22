import { openai, MODEL } from '@/lib/ai/client'
import type { SSEEvent, StepName } from '@/types'

type SendFn = (event: SSEEvent) => void

// Think mode wraps each step with explicit reasoning
export async function runThinkStep(
  stepIndex: number, stepName: StepName, systemPrompt: string, userPrompt: string, send: SendFn
): Promise<string> {
  send({ type: 'step_start', stepIndex, stepName })

  const thinkSystemPrompt = systemPrompt + `\n\n重要：请先在 <thinking> 标签内进行深度推理，分析所有可能性、边界情况和最优方案，然后在标签外输出最终结论。推理要充分，结论要精准。`

  let fullContent = ''
  let inThinking = false
  let thinkingBuffer = ''

  const stream = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: thinkSystemPrompt },
      { role: 'user', content: userPrompt }
    ],
    stream: true,
    max_tokens: 4000,
  })

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content || ''
    if (!delta) continue

    thinkingBuffer += delta

    // Parse thinking tags
    if (!inThinking && thinkingBuffer.includes('<thinking>')) {
      inThinking = true
      thinkingBuffer = ''
    } else if (inThinking && thinkingBuffer.includes('</thinking>')) {
      inThinking = false
      const thinkContent = thinkingBuffer.replace('</thinking>', '')
      send({ type: 'step_thinking', stepIndex, delta: thinkContent })
      thinkingBuffer = ''
    } else if (inThinking) {
      send({ type: 'step_thinking', stepIndex, delta })
      thinkingBuffer = ''
    } else {
      fullContent += delta
      send({ type: 'step_content', stepIndex, delta })
      thinkingBuffer = ''
    }
  }

  return fullContent
}
