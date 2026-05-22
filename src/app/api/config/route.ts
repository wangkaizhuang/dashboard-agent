import { NextResponse } from 'next/server'

export async function GET() {
  // Return server-side config (from env vars)
  // Client-side config overrides are handled in localStorage via UIStore
  return NextResponse.json({
    model: process.env.OPENAI_MODEL || 'gpt-5.4-mini',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://www.packyapi.com/v1',
    contextMaxTokens: parseInt(process.env.CONTEXT_MAX_TOKENS || '128000'),
    qualityScoreThreshold: parseInt(process.env.QUALITY_SCORE_THRESHOLD || '30'),
  })
}
