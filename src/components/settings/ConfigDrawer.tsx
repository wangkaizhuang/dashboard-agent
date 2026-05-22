'use client'
import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Eye, EyeOff, RotateCcw, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DEFAULT_CONFIG, type AppConfig } from '@/types'
import { toast } from 'sonner'

interface ConfigDrawerProps {
  open: boolean
  onClose: () => void
}

export function ConfigDrawer({ open, onClose }: ConfigDrawerProps) {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [apiEndpoint, setApiEndpoint] = useState('https://www.packyapi.com/v1')
  const [modelName, setModelName] = useState('gpt-5.4-mini')

  useEffect(() => {
    const saved = localStorage.getItem('dashboard-agent-config')
    if (saved) {
      try { setConfig(JSON.parse(saved)) } catch { /* ignore parse errors */ }
    }
    const savedApi = localStorage.getItem('dashboard-agent-api')
    if (savedApi) {
      try {
        const api = JSON.parse(savedApi)
        setApiEndpoint(api.endpoint || '')
        setModelName(api.model || '')
        setApiKey(api.key || '')
      } catch { /* ignore parse errors */ }
    }
  }, [open])

  const handleSave = () => {
    localStorage.setItem('dashboard-agent-config', JSON.stringify(config))
    localStorage.setItem('dashboard-agent-api', JSON.stringify({
      endpoint: apiEndpoint, model: modelName, key: apiKey
    }))
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
                  <div>
                    <label className="block text-sm mb-1" style={{ color: 'var(--color-text-1)' }}>Model Name</label>
                    <input
                      type="text" value={modelName} onChange={e => setModelName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                      style={{ borderColor: 'var(--color-border)' }}
                    />
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
