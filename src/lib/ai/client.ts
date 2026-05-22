import OpenAI from 'openai'

const globalForOpenAI = globalThis as unknown as {
  openai: OpenAI | undefined
}

export const openai =
  globalForOpenAI.openai ??
  new OpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  })

if (process.env.NODE_ENV !== 'production') globalForOpenAI.openai = openai

export const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

export default openai
