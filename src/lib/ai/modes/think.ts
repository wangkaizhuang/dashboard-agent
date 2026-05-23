import { openai, MODEL } from '@/lib/ai/client'
import type { SSEEvent, StepName } from '@/types'

type SendFn = (event: SSEEvent) => void

// Think mode wraps each step with explicit reasoning
// Returns [content, reasoning]
export async function runThinkStep(
  stepIndex: number, stepName: StepName, systemPrompt: string, userPrompt: string, send: SendFn
): Promise<[string, string]> {
  send({ type: 'step_start', stepIndex, stepName })

  const thinkSystemPrompt = systemPrompt + `\n\n重要：请先在 <thinking> 标签内进行深度推理，分析所有可能性、边界情况和最优方案，然后在标签外输出最终结论。推理要充分，结论要精准。`

  let fullContent = ''
  let fullThinking = ''
  let inThinking = false
  let rawBuffer = ''

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

    rawBuffer += delta

    // Process rawBuffer looking for tag boundaries
    while (rawBuffer.length > 0) {
      if (!inThinking) {
        const openIdx = rawBuffer.indexOf('<thinking>')
        if (openIdx === -1) {
          // No opening tag — emit all as content (keep last 10 chars as safety buffer)
          const safe = rawBuffer.length > 10 ? rawBuffer.slice(0, -10) : ''
          if (safe) {
            fullContent += safe
            send({ type: 'step_content', stepIndex, delta: safe })
            rawBuffer = rawBuffer.slice(safe.length)
          }
          break
        } else {
          // Emit content before the tag
          const before = rawBuffer.slice(0, openIdx)
          if (before) {
            fullContent += before
            send({ type: 'step_content', stepIndex, delta: before })
          }
          rawBuffer = rawBuffer.slice(openIdx + '<thinking>'.length)
          inThinking = true
        }
      } else {
        const closeIdx = rawBuffer.indexOf('</thinking>')
        if (closeIdx === -1) {
          // Still inside thinking — emit all except safety buffer
          const safe = rawBuffer.length > 11 ? rawBuffer.slice(0, -11) : ''
          if (safe) {
            fullThinking += safe
            send({ type: 'step_thinking', stepIndex, delta: safe })
            rawBuffer = rawBuffer.slice(safe.length)
          }
          break
        } else {
          // Emit thinking content up to close tag
          const thinkPart = rawBuffer.slice(0, closeIdx)
          if (thinkPart) {
            fullThinking += thinkPart
            send({ type: 'step_thinking', stepIndex, delta: thinkPart })
          }
          rawBuffer = rawBuffer.slice(closeIdx + '</thinking>'.length)
          inThinking = false
        }
      }
    }
  }

  // Flush remaining buffer
  if (rawBuffer) {
    if (inThinking) {
      fullThinking += rawBuffer
      send({ type: 'step_thinking', stepIndex, delta: rawBuffer })
    } else {
      fullContent += rawBuffer
      send({ type: 'step_content', stepIndex, delta: rawBuffer })
    }
  }

  return [fullContent, fullThinking]
}
