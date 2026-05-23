import { NextResponse } from 'next/server'
import { getRuntimeConfig, setRuntimeConfig } from '@/lib/config/runtime'
import type { RuntimeConfig } from '@/lib/config/runtime'

export async function GET() {
  const cfg = getRuntimeConfig()
  return NextResponse.json({
    model: cfg.model,
    baseUrl: cfg.baseUrl,
    // Never expose apiKey in GET — return masked version
    apiKeyMasked: cfg.apiKey ? `${cfg.apiKey.slice(0, 8)}...${cfg.apiKey.slice(-4)}` : '',
    contextMaxTokens: cfg.contextMaxTokens,
    qualityScoreThreshold: cfg.qualityScoreThreshold,
    stepThresholds: cfg.stepThresholds ?? {},
  })
}

export async function POST(request: Request) {
  const body = await request.json() as Partial<RuntimeConfig>
  // Only update fields that are present and non-empty
  const updates: Partial<RuntimeConfig> = {}
  if (body.model) updates.model = body.model
  if (body.baseUrl) updates.baseUrl = body.baseUrl
  if (body.apiKey && body.apiKey !== '***masked***') updates.apiKey = body.apiKey
  if (typeof body.contextMaxTokens === 'number') updates.contextMaxTokens = body.contextMaxTokens
  if (typeof body.qualityScoreThreshold === 'number') updates.qualityScoreThreshold = body.qualityScoreThreshold
  if (body.stepThresholds && typeof body.stepThresholds === 'object') updates.stepThresholds = body.stepThresholds
  setRuntimeConfig(updates)
  return NextResponse.json({ ok: true })
}
