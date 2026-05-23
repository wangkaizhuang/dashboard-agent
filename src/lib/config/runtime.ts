import fs from 'fs'
import path from 'path'

export type StepThresholds = Partial<Record<string, number>>

export interface RuntimeConfig {
  model: string
  baseUrl: string
  apiKey: string
  contextMaxTokens: number
  qualityScoreThreshold: number
  stepThresholds: StepThresholds
}

const CONFIG_FILE = path.join(process.cwd(), '.runtime-config.json')

function readConfigFile(): Partial<RuntimeConfig> {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
  } catch {
    return {}
  }
}

function writeConfigFile(config: Partial<RuntimeConfig>): void {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
  } catch { /* no-op in read-only environments */ }
}

// In-memory override layer, initialized from persisted file
let _override: Partial<RuntimeConfig> = readConfigFile()

export function getRuntimeConfig(): RuntimeConfig {
  return {
    model: _override.model || process.env.OPENAI_MODEL || 'gpt-5.4-mini',
    baseUrl: _override.baseUrl || process.env.OPENAI_BASE_URL || 'https://www.packyapi.com/v1',
    apiKey: _override.apiKey || process.env.OPENAI_API_KEY || '',
    contextMaxTokens: _override.contextMaxTokens ?? parseInt(process.env.CONTEXT_MAX_TOKENS || '128000'),
    qualityScoreThreshold: _override.qualityScoreThreshold ?? parseInt(process.env.QUALITY_SCORE_THRESHOLD || '30'),
    stepThresholds: _override.stepThresholds ?? {},
  }
}

export function setRuntimeConfig(updates: Partial<RuntimeConfig>): void {
  _override = { ..._override, ...updates }
  writeConfigFile(_override)
}
