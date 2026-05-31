import { getOpenAIClient, getReasoningModel } from '@/lib/ai/client'
import type { SSEEvent, StepName } from '@/types'

type SendFn = (event: SSEEvent) => void

// Per-step token budgets for THINK mode. These are larger than QUICK mode's
// because the <thinking> reasoning block is emitted BEFORE the final answer and
// consumes part of the budget. MOCK_DATA (JSON datasets) and TEMPLATE_GENERATION
// (full HTML) need ample headroom so the actual output isn't truncated by the
// preceding reasoning.
const STEP_MAX_TOKENS: Record<StepName, number> = {
  REQUIREMENTS_ANALYSIS: 4000,
  THOUGHT_BREAKDOWN: 4000,
  LAYOUT_PLANNING: 4000,
  MOCK_DATA: 8000,
  TEMPLATE_GENERATION: 12000,
}

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

  const stream = await getOpenAIClient().chat.completions.create({
    model: getReasoningModel(),
    messages: [
      { role: 'system', content: thinkSystemPrompt },
      { role: 'user', content: userPrompt }
    ],
    stream: true,
    max_tokens: STEP_MAX_TOKENS[stepName],
  })

  for await (const chunk of stream) {
    // Reasoning-capable models (deepseek-reasoner, o3, etc.) stream their
    // chain-of-thought in a dedicated `reasoning_content`/`reasoning` delta
    // field rather than inside <thinking> tags. Capture it natively when present.
    // (Note: plain chat models like gpt-5.4-mini expose neither — for those,
    // reasoning only appears if the model honors the <thinking> instruction.)
    const reasoningDelta =
      (chunk.choices[0]?.delta as { reasoning_content?: string; reasoning?: string })?.reasoning_content ??
      (chunk.choices[0]?.delta as { reasoning_content?: string; reasoning?: string })?.reasoning
    if (reasoningDelta) {
      fullThinking += reasoningDelta
      send({ type: 'step_thinking', stepIndex, delta: reasoningDelta })
    }

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
