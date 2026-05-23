import { getOpenAIClient, getModel } from '@/lib/ai/client'
import { estimateMessagesTokens } from '@/lib/utils/tokens'
import type { Message } from '@/types'

interface ContextMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export async function buildCompressedContext(
  messages: Message[],
  maxTokens: number = 128000,
  keepRecent: number = 10
): Promise<ContextMessage[]> {
  const contextMessages: ContextMessage[] = messages.map(m => ({
    role: m.role.toLowerCase() as 'user' | 'assistant' | 'system',
    content: m.content,
  }))

  const totalTokens = estimateMessagesTokens(messages)
  if (totalTokens <= maxTokens) return contextMessages

  // Keep last N messages verbatim
  const recent = contextMessages.slice(-keepRecent)
  const older = contextMessages.slice(0, -keepRecent)

  if (older.length === 0) return recent

  // Summarize older messages
  try {
    const summaryResp = await getOpenAIClient().chat.completions.create({
      model: getModel(),
      messages: [
        {
          role: 'system',
          content: '将以下对话历史压缩为一段摘要（500字以内），保留所有关键决策、用户偏好、重要信息和具体数据需求。用中文输出。'
        },
        {
          role: 'user',
          content: older.map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`).join('\n\n')
        }
      ],
      max_tokens: 600,
    })

    const summary = summaryResp.choices[0]?.message?.content || ''
    return [
      { role: 'system', content: `[对话历史摘要]\n${summary}` },
      ...recent
    ]
  } catch {
    return recent
  }
}

export function buildStepContext(completedSteps: Array<{ stepName: string; content: string }>): string {
  if (completedSteps.length === 0) return ''
  return completedSteps
    .map(s => `### ${s.stepName}\n${s.content.slice(0, 2000)}`) // truncate each step
    .join('\n\n')
}
