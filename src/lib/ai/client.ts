import OpenAI from 'openai'
import { getRuntimeConfig } from '@/lib/config/runtime'

/** Creates a fresh OpenAI-compatible client using current runtime config */
export function getOpenAIClient(): OpenAI {
  const cfg = getRuntimeConfig()
  return new OpenAI({
    apiKey: cfg.apiKey || process.env.OPENAI_API_KEY || '',
    baseURL: cfg.baseUrl,
  })
}

/** Returns current model name from runtime config */
export function getModel(): string {
  return getRuntimeConfig().model
}
