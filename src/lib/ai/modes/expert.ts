import { openai, MODEL } from '@/lib/ai/client'
import { prisma } from '@/lib/db/prisma'
import * as EG from '@/lib/ai/prompts/expert-gap'
import type { SSEEvent, StepName, ExpertQuestion } from '@/types'

type SendFn = (event: SSEEvent) => void

export async function analyzeGaps(
  sessionId: string, stepIndex: number, stepName: StepName, userInput: string, history: string, send: SendFn
): Promise<boolean> {
  const resp = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: EG.EXPERT_GAP_SYSTEM },
      { role: 'user', content: EG.EXPERT_GAP_USER(stepName, userInput, history) }
    ],
    response_format: { type: 'json_object' },
    max_tokens: 1000,
  })

  let gapData: { hasGaps: boolean; questions: Array<{ question: string; type: string; options: Array<{ label: string; value: string }> }> }
  try {
    gapData = JSON.parse(resp.choices[0]?.message?.content || '{"hasGaps":false,"questions":[]}')
  } catch {
    return false
  }

  if (!gapData.hasGaps || gapData.questions.length === 0) return false

  // Save questions to DB and send to client
  for (const q of gapData.questions) {
    // Remove LLM-generated "other" entries before adding our canonical __custom__ entry
    const filtered = q.options.filter(o => o.value !== 'other' && o.label !== '其他')
    const optionsWithOther = [...filtered, { label: '其他', value: '__custom__' }]
    const question = await prisma.expertQuestion.create({
      data: {
        sessionId, stepIndex,
        question: q.question,
        options: optionsWithOther as never,
      }
    })

    send({
      type: 'expert_question',
      question: {
        id: question.id,
        sessionId,
        stepIndex,
        question: q.question,
        options: optionsWithOther,
        answered: false,
        createdAt: question.createdAt.toISOString(),
      } as ExpertQuestion
    })
  }

  return true
}

export async function waitForExpertAnswers(sessionId: string, stepIndex: number, timeoutMs = 300000): Promise<string> {
  const start = Date.now()
  let lastAnsweredCount = -1

  while (Date.now() - start < timeoutMs) {
    const questions = await prisma.expertQuestion.findMany({
      where: { sessionId, stepIndex },
      select: { answered: true, question: true, answer: true, customText: true }
    })

    const answeredCount = questions.filter(q => q.answered).length

    // Only process when something changed
    if (answeredCount !== lastAnsweredCount) {
      lastAnsweredCount = answeredCount
      if (questions.length > 0 && answeredCount === questions.length) {
        return questions.map(q => {
          const answer = q.customText || q.answer || ''
          return `问题: ${q.question}\n回答: ${answer}`
        }).join('\n\n')
      }
    }

    await new Promise(r => setTimeout(r, 2000))
  }

  return '' // timeout — continue without answers
}
