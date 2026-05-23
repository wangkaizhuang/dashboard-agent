'use client'
import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Eye, EyeOff, RotateCcw, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DEFAULT_CONFIG, type AppConfig } from '@/types'
import { toast } from 'sonner'

const PRESET_MODELS = [
  // GPT
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', provider: 'OpenAI', tag: '默认', tagColor: 'bg-green-100 text-green-700' },
  { id: 'gpt-4o', label: 'GPT-4o', provider: 'OpenAI', tag: '强大', tagColor: 'bg-blue-100 text-blue-700' },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'OpenAI', tag: '快速', tagColor: 'bg-sky-100 text-sky-700' },
  { id: 'o3-mini', label: 'o3 Mini', provider: 'OpenAI', tag: '推理', tagColor: 'bg-violet-100 text-violet-700' },
  // Claude
  { id: 'claude-opus-4-5', label: 'Claude Opus 4.5', provider: 'Anthropic', tag: '旗舰', tagColor: 'bg-orange-100 text-orange-700' },
  { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', provider: 'Anthropic', tag: '均衡', tagColor: 'bg-amber-100 text-amber-700' },
  { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', provider: 'Anthropic', tag: '轻量', tagColor: 'bg-yellow-100 text-yellow-700' },
  // DeepSeek
  { id: 'deepseek-chat', label: 'DeepSeek V3', provider: 'DeepSeek', tag: '开源', tagColor: 'bg-emerald-100 text-emerald-700' },
  { id: 'deepseek-reasoner', label: 'DeepSeek R1', provider: 'DeepSeek', tag: '推理', tagColor: 'bg-teal-100 text-teal-700' },
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', provider: 'DeepSeek', tag: '极速', tagColor: 'bg-cyan-100 text-cyan-700' },
  // Gemini
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', provider: 'Google', tag: '极速', tagColor: 'bg-red-100 text-red-700' },
  { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', provider: 'Google', tag: '长文', tagColor: 'bg-pink-100 text-pink-700' },
]

interface ConfigDrawerProps {
  open: boolean
  onClose: () => void
}

export function ConfigDrawer({ open, onClose }: ConfigDrawerProps) {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [apiEndpoint, setApiEndpoint] = useState('https://www.packyapi.com/v1')
  const [selectedModel, setSelectedModel] = useState('gpt-5.4-mini')
  const [customModel, setCustomModel] = useState('')

  const isCustomModel = !PRESET_MODELS.some(m => m.id === selectedModel) || selectedModel === '__custom__'

  useEffect(() => {
    if (!open) return
    // Load server config
    fetch('/api/config').then(r => r.json()).then(cfg => {
      if (cfg.model) {
        const isPreset = PRESET_MODELS.some(m => m.id === cfg.model)
        if (isPreset) {
          setSelectedModel(cfg.model)
        } else {
          setSelectedModel('__custom__')
          setCustomModel(cfg.model)
        }
      }
      if (cfg.baseUrl) setApiEndpoint(cfg.baseUrl)
      if (cfg.apiKeyMasked) setApiKey(cfg.apiKeyMasked) // display masked key
      if (cfg.contextMaxTokens) setConfig(c => ({ ...c, contextMaxTokens: cfg.contextMaxTokens }))
      if (cfg.qualityScoreThreshold) setConfig(c => ({ ...c, qualityScoreThreshold: cfg.qualityScoreThreshold }))
    }).catch(() => {})
  }, [open])

  const handleSave = async () => {
    const model = isCustomModel ? customModel : selectedModel
    // Save to server
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        baseUrl: apiEndpoint,
        // Only send apiKey if user changed it (not the masked placeholder)
        ...(!apiKey.includes('...') && apiKey ? { apiKey } : {}),
        contextMaxTokens: config.contextMaxTokens,
        qualityScoreThreshold: config.qualityScoreThreshold,
      })
    }).catch(() => {})
    // Also save display prefs to localStorage
    localStorage.setItem('dashboard-agent-config', JSON.stringify(config))
    toast.success('配置已保存')
    onClose()
  }

  const handleReset = () => {
    setConfig(DEFAULT_CONFIG)
    toast.info('已恢复默认值')
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-96 bg-white shadow-2xl z-50 flex flex-col"
            style={{ borderLeft: '1px solid var(--color-border)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <h2 className="font-semibold text-base" style={{ color: 'var(--color-text-1)' }}>系统配置</h2>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
              {/* API Settings */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-text-2)' }}>模型设置</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm mb-1" style={{ color: 'var(--color-text-1)' }}>API Endpoint</label>
                    <input
                      type="text" value={apiEndpoint} onChange={e => setApiEndpoint(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                      style={{ borderColor: 'var(--color-border)' }}
                    />
                  </div>

                  {/* Model selection grid */}
                  <div>
                    <label className="block text-sm mb-2" style={{ color: 'var(--color-text-1)' }}>选择模型</label>
                    <div className="grid grid-cols-2 gap-1.5 mb-2">
                      {PRESET_MODELS.map(m => (
                        <button
                          key={m.id}
                          onClick={() => setSelectedModel(m.id)}
                          className={cn(
                            'flex flex-col items-start p-2 rounded-lg border text-left transition-all',
                            selectedModel === m.id && !isCustomModel
                              ? 'border-indigo-400 bg-indigo-50'
                              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          )}
                        >
                          <div className="flex items-center gap-1.5 w-full">
                            <span className={cn('text-xs font-semibold truncate flex-1', selectedModel === m.id && !isCustomModel ? 'text-indigo-700' : 'text-slate-700')}>
                              {m.label}
                            </span>
                            <span className={cn('text-[10px] px-1 py-0.5 rounded font-medium shrink-0', m.tagColor)}>{m.tag}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 mt-0.5">{m.provider}</span>
                        </button>
                      ))}
                      {/* Custom option */}
                      <button
                        onClick={() => { setSelectedModel('__custom__'); setCustomModel('') }}
                        className={cn(
                          'flex flex-col items-start p-2 rounded-lg border text-left transition-all col-span-2',
                          isCustomModel ? 'border-indigo-400 bg-indigo-50' : 'border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                        )}
                      >
                        <span className={cn('text-xs font-semibold', isCustomModel ? 'text-indigo-700' : 'text-slate-500')}>✏️ 自定义模型</span>
                      </button>
                    </div>
                    {/* Custom model text input — shown when custom selected or when current model isn't in preset list */}
                    {isCustomModel && (
                      <input
                        type="text"
                        value={customModel}
                        onChange={e => setCustomModel(e.target.value)}
                        placeholder="输入模型名称，如 gpt-4-turbo"
                        className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                        style={{ borderColor: 'var(--color-border)' }}
                        autoFocus
                      />
                    )}
                    {/* Show currently selected model ID */}
                    {!isCustomModel && (
                      <p className="text-xs mt-1" style={{ color: 'var(--color-text-2)' }}>
                        当前: <code className="bg-slate-100 px-1 rounded">{selectedModel}</code>
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm mb-1" style={{ color: 'var(--color-text-1)' }}>API Key</label>
                    <div className="relative">
                      <input
                        type={showKey ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)}
                        className="w-full px-3 py-2 pr-10 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                        style={{ borderColor: 'var(--color-border)' }}
                        placeholder="sk-..."
                      />
                      <button onClick={() => setShowKey(!showKey)} className="absolute right-3 top-2.5 text-gray-400">
                        {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {/* Context Settings */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-text-2)' }}>上下文设置</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span style={{ color: 'var(--color-text-1)' }}>最大 Token 数</span>
                      <span className="font-mono text-indigo-600">{(config.contextMaxTokens / 1000).toFixed(0)}k</span>
                    </div>
                    <input type="range" min={8000} max={200000} step={1000}
                      value={config.contextMaxTokens}
                      onChange={e => setConfig(c => ({ ...c, contextMaxTokens: Number(e.target.value) }))}
                      className="w-full accent-indigo-600"
                    />
                    <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--color-text-2)' }}>
                      <span>8k</span><span>200k</span>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span style={{ color: 'var(--color-text-1)' }}>保留最近消息数</span>
                      <span className="font-mono text-indigo-600">{config.contextKeepRecent} 条</span>
                    </div>
                    <input type="range" min={5} max={30}
                      value={config.contextKeepRecent}
                      onChange={e => setConfig(c => ({ ...c, contextKeepRecent: Number(e.target.value) }))}
                      className="w-full accent-indigo-600"
                    />
                  </div>
                </div>
              </section>

              {/* Quality Control */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-text-2)' }}>质量控制</h3>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span style={{ color: 'var(--color-text-1)' }}>评分阈值</span>
                    <span className="font-mono text-indigo-600">{config.qualityScoreThreshold} 分</span>
                  </div>
                  <input type="range" min={0} max={80}
                    value={config.qualityScoreThreshold}
                    onChange={e => setConfig(c => ({ ...c, qualityScoreThreshold: Number(e.target.value) }))}
                    className="w-full accent-indigo-600"
                  />
                  <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--color-text-2)' }}>
                    <span>0 分（不限制）</span><span>80 分（严格）</span>
                  </div>
                </div>
              </section>

              {/* Theme */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-text-2)' }}>界面设置</h3>
                <div className="flex gap-2">
                  {(['light', 'dark', 'system'] as const).map(t => (
                    <button key={t}
                      onClick={() => setConfig(c => ({ ...c, theme: t }))}
                      className={cn(
                        'flex-1 py-2 rounded-lg border text-sm transition-colors',
                        config.theme === t
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-600 font-medium'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      )}
                    >
                      {t === 'light' ? '浅色' : t === 'dark' ? '深色' : '跟随系统'}
                    </button>
                  ))}
                </div>
              </section>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t flex gap-2" style={{ borderColor: 'var(--color-border)' }}>
              <button onClick={handleReset}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <RotateCcw size={13} /> 恢复默认
              </button>
              <button onClick={handleSave}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                <Save size={13} /> 保存配置
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
