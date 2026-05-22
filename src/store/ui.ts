import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppConfig } from '@/types'
import { DEFAULT_CONFIG } from '@/types'

interface UIState {
  // Right panel view
  rightPanelView: 'progress' | 'preview'
  previewTemplateId: string | null

  // Fullscreen
  isFullscreen: boolean

  // Config drawer
  isConfigOpen: boolean

  // App config (persisted in localStorage)
  config: AppConfig

  // Actions
  setRightPanelView: (view: 'progress' | 'preview') => void
  setPreviewTemplate: (templateId: string | null) => void
  setFullscreen: (full: boolean) => void
  setConfigOpen: (open: boolean) => void
  updateConfig: (config: Partial<AppConfig>) => void
  resetConfig: () => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      rightPanelView: 'progress',
      previewTemplateId: null,
      isFullscreen: false,
      isConfigOpen: false,
      config: DEFAULT_CONFIG,

      setRightPanelView: (view) => set({ rightPanelView: view }),
      setPreviewTemplate: (templateId) => set({ previewTemplateId: templateId, rightPanelView: templateId ? 'preview' : 'progress' }),
      setFullscreen: (full) => set({ isFullscreen: full }),
      setConfigOpen: (open) => set({ isConfigOpen: open }),
      updateConfig: (config) => set(state => ({ config: { ...state.config, ...config } })),
      resetConfig: () => set({ config: DEFAULT_CONFIG }),
    }),
    {
      name: 'dashboard-agent-ui',
      partialize: (state) => ({ config: state.config }),
    }
  )
)
