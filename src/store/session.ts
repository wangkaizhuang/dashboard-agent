import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Session, Mode } from '@/types'

interface SessionState {
  sessions: Session[]
  currentSessionId: string | null
  isLoading: boolean

  // Actions
  setSessions: (sessions: Session[]) => void
  setCurrentSession: (id: string) => void
  addSession: (session: Session) => void
  removeSession: (id: string) => void
  updateSession: (id: string, updates: Partial<Session>) => void
  fetchSessions: () => Promise<void>
  createSession: (mode?: Mode) => Promise<Session | null>
}

export const useSessionStore = create<SessionState>()(
  immer((set, get) => ({
    sessions: [],
    currentSessionId: null,
    isLoading: false,

    setSessions: (sessions) => set(state => { state.sessions = sessions }),

    setCurrentSession: (id) => set(state => { state.currentSessionId = id }),

    addSession: (session) => set(state => { state.sessions.unshift(session) }),

    removeSession: (id) => set(state => {
      state.sessions = state.sessions.filter(s => s.id !== id)
    }),

    updateSession: (id, updates) => set(state => {
      const idx = state.sessions.findIndex(s => s.id === id)
      if (idx >= 0) Object.assign(state.sessions[idx], updates)
    }),

    fetchSessions: async () => {
      set(state => { state.isLoading = true })
      try {
        const res = await fetch('/api/sessions')
        if (res.ok) {
          const sessions = await res.json()
          set(state => { state.sessions = sessions; state.isLoading = false })
        }
      } catch {
        set(state => { state.isLoading = false })
      }
    },

    createSession: async (mode = 'QUICK') => {
      try {
        const res = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode })
        })
        if (res.ok) {
          const session = await res.json()
          get().addSession(session)
          return session
        }
      } catch {}
      return null
    }
  }))
)
