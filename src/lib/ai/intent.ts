import { prisma } from '@/lib/db/prisma'
import { getOpenAIClient, getModel } from '@/lib/ai/client'
import { INTENT_DETECT_SYSTEM, INTENT_DETECT_USER } from './prompts/intent-detection'

/**
 * Judge whether the new message is related to the current dashboard topic.
 * Fails OPEN (returns related=true) on any error — a flaky relatedness check
 * must never block the user or pop a spurious choice.
 */
export async function detectRelated(
  currentTopic: string,
  newMessage: string,
): Promise<{ related: boolean; reason: string }> {
  try {
    const resp = await getOpenAIClient().chat.completions.create({
      model: getModel(),
      messages: [
        { role: 'system', content: INTENT_DETECT_SYSTEM },
        { role: 'user', content: INTENT_DETECT_USER(currentTopic, newMessage) },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 200,
    })
    const parsed = JSON.parse(resp.choices[0]?.message?.content || '{"related":true}')
    return { related: parsed.related !== false, reason: String(parsed.reason || '') }
  } catch {
    return { related: true, reason: '' }
  }
}

/**
 * Wait for the user's intent choice by polling the triggering message's
 * metadata.intentDecision. Times out to 'continue' so the pipeline never hangs.
 */
export async function waitForIntentChoice(
  messageId: string,
  timeoutMs = 180_000,
): Promise<'continue' | 'regenerate'> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const msg = await prisma.message.findUnique({ where: { id: messageId } })
    const decision = (msg?.metadata as { intentDecision?: string } | null)?.intentDecision
    if (decision === 'continue' || decision === 'regenerate') return decision
    await new Promise(r => setTimeout(r, 1000))
  }
  return 'continue'
}
