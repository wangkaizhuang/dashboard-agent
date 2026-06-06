'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Menu, ListChecks } from 'lucide-react'
import { toast } from 'sonner'
import { usePipelineStore } from '@/store/pipeline'
import { MessageList } from '@/components/chat/MessageList'
import { ChatInput } from '@/components/chat/ChatInput'
import type { Message, SSEEvent, Mode, Annotation } from '@/types'

interface ChatPanelProps {
  sessionId: string
  onTemplateReady: (templateId: string, autoOpen?: boolean) => void
  onSessionTitleChange: () => void
  onSessionCreated: () => void
  annotations?: Annotation[]
  onAnnotationRemove?: (componentId: string) => void
  onAnnotationClear?: () => void
  /** Mobile-only (< md): open the off-canvas sidebar. */
  onOpenSidebar?: () => void
  /** Below xl: open the progress/preview sheet. */
  onOpenPanel?: () => void
}

export function ChatPanel({
  sessionId,
  onTemplateReady,
  onSessionTitleChange,
  onSessionCreated,
  annotations = [],
  onAnnotationRemove,
  onAnnotationClear,
  onOpenSidebar,
  onOpenPanel,
}: ChatPanelProps) {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  // Whether the initial history fetch for a real session has resolved. Gates the
  // empty-state: a real session shows a loading indicator until this is true,
  // instead of the (misleading) new-session CTA.
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [selectedMode, setSelectedMode] = useState<Mode>('QUICK')
  const { handleSSEEvent, initPipeline, loadStepsFromDB, setRunning } = usePipelineStore()

  // Synchronous guard that prevents double-send even before React re-renders.
  // React state (isLoading) is reliable for UI but has a render-cycle delay;
  // a ref is set synchronously so concurrent async calls are blocked immediately.
  const isLoadingRef = useRef(false)

  // Always-current ref for sendMessage so it can be called from effects / timeouts
  const sendMessageRef = useRef<(content: string, modeOverride?: Mode) => Promise<void>>()

  // Always-current ref for onTemplateReady — prevents stale-closure bugs in loadSession
  const onTemplateReadyRef = useRef(onTemplateReady)
  useEffect(() => { onTemplateReadyRef.current = onTemplateReady })

  // AbortController for the active SSE stream — cancelled when sessionId changes
  // so events from a previous pipeline don't bleed into a newly-loaded session.
  const sseAbortRef = useRef<AbortController | null>(null)

  // Monotonic load id — only the latest loadSession() may write state, so a
  // superseded load (rapid session switching) can't blank/stale the chat.
  const loadGenRef = useRef(0)

  const loadSession = useCallback(async () => {
    if (sessionId === 'new') return
    const myGen = ++loadGenRef.current
    const isStale = () => myGen !== loadGenRef.current
    try {
      // Fetch with one retry — a transient failure must not leave the chat blank.
      let res = await fetch(`/api/sessions/${sessionId}`)
      if (!res.ok && !isStale()) {
        await new Promise(r => setTimeout(r, 500))
        res = await fetch(`/api/sessions/${sessionId}`)
      }
      if (!res.ok || isStale()) return
      const session = await res.json()
      if (isStale()) return  // a newer session load started while we awaited — don't write stale data
      setMessages(session.messages || [])
      // Update browser tab title with the session title
      if (session.title) document.title = `${session.title} — Dashboard Agent`
      // Sync mode selector to what the session has in DB
      if (session.mode) setSelectedMode(session.mode as Mode)
      // If session already has a completed template, inject the card
      if (session.template) {
        const templateMsg: Message = {
          id: `template-${session.template.id}`,
          sessionId,
          role: 'ASSISTANT',
          content: '',
          type: 'TEMPLATE_CARD',
          metadata: { templateId: session.template.id },
          createdAt: session.template.createdAt,
        }
        setMessages(prev => {
          const hasTemplate = prev.some(m => m.type === 'TEMPLATE_CARD')
          return hasTemplate ? prev : [...(session.messages || []), templateMsg]
        })
        // Notify parent so the right panel restores its Preview state (e.g. on page reload
        // or session switch) even though no SSE template_ready event fires in this path.
        // autoOpen=false: loading an existing session must NOT auto-pop the mobile sheet
        // over the chat history.
        onTemplateReadyRef.current(session.template.id, false)
      }
    } catch (err) {
      console.error('Failed to load session:', err)
    } finally {
      // Mark the initial fetch as resolved (success or failure) so the empty-state
      // stops showing the loading indicator / never shows the new-session CTA.
      // Only the latest load may flip this, so a superseded load can't end the
      // newer session's loading state early.
      if (myGen === loadGenRef.current) setSessionLoaded(true)
    }
  }, [sessionId])

  // Keep sendMessageRef pointing to the latest sendMessage closure after every render
  useEffect(() => {
    sendMessageRef.current = (content, modeOverride) => sendMessage(content, modeOverride)
  })

  // Initialize when sessionId changes
  useEffect(() => {
    // Cancel any in-flight SSE stream from the previous session so its events
    // don't bleed into the newly-selected session's UI state.
    sseAbortRef.current?.abort()
    sseAbortRef.current = null
    setSessionLoaded(false)

    if (sessionId === 'new') {
      // Draft state — show empty UI, reset pipeline
      setMessages([])
      setIsLoading(false)
      setRunning(false)
      initPipeline('new')
      document.title = 'Dashboard Agent'
      return
    }

    initPipeline(sessionId)
    loadStepsFromDB(sessionId)
    loadSession()

    // If we just navigated here from the /chat/new draft with a pending first message,
    // retrieve it from sessionStorage and auto-send it.
    const pendingKey = `pendingMsg:${sessionId}`
    const pendingRaw = sessionStorage.getItem(pendingKey)
    if (pendingRaw) {
      sessionStorage.removeItem(pendingKey)
      try {
        const { content: pendingContent, mode: pendingMode } = JSON.parse(pendingRaw)
        // Pass the original mode so the pipeline runs in the mode the user chose,
        // regardless of what selectedMode state is at this point.
        setTimeout(() => { sendMessageRef.current?.(pendingContent, pendingMode as Mode) }, 150)
      } catch {
        // Fallback: treat raw value as plain content (legacy)
        setTimeout(() => { sendMessageRef.current?.(pendingRaw) }, 150)
      }
    }
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  const stopLoading = () => {
    isLoadingRef.current = false
    setIsLoading(false)
    setRunning(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sendMessage = async (content: string, modeOverride?: Mode) => {
    // Use the ref (not state) as the guard — refs are synchronous and not subject
    // to the render-cycle delay that makes state-based guards unreliable for async functions.
    if (isLoadingRef.current) return
    const mode = modeOverride ?? selectedMode

    // ── Draft session: create real session first, then navigate ──────────────
    if (sessionId === 'new') {
      isLoadingRef.current = true
      try {
        const res = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode }),
        })
        const session = await res.json()
        // Store the pending message AND its mode so the auto-send uses the correct pipeline mode
        sessionStorage.setItem(`pendingMsg:${session.id}`, JSON.stringify({ content, mode }))
        onSessionCreated()
        router.replace(`/chat/${session.id}`)
      } catch (err) {
        console.error('Failed to create session:', err)
        isLoadingRef.current = false  // Reset so user can retry
      }
      return
    }

    // ── Real session: optimistic UI + SSE pipeline ────────────────────────────
    const tempId = `temp-${Date.now()}`
    const userMsg: Message = {
      id: tempId,
      sessionId,
      role: 'USER',
      content,
      type: 'TEXT',
      createdAt: new Date().toISOString(),
    }
    isLoadingRef.current = true
    setMessages(prev => [...prev, userMsg])
    setIsLoading(true)
    setRunning(true)

    try {
      // Create a new AbortController for this SSE stream. The previous one (if any)
      // was already aborted by the sessionId-change effect or a prior send.
      const controller = new AbortController()
      sseAbortRef.current = controller

      const response = await fetch(`/api/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, mode, annotations }),
        signal: controller.signal,
      })
      // Clear annotation chips immediately after send
      onAnnotationClear?.()

      if (!response.ok || !response.body) throw new Error('Request failed')

      // Message is now in DB — refresh sidebar so this session appears in the list
      onSessionCreated()

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let streamDone = false
      // Defer loadSession() until the stream closes ([DONE]). The server writes
      // the SCORE_REPORT message in its `finally` block AFTER emitting
      // pipeline_paused but BEFORE [DONE]; reloading on the event itself races
      // that write and can drop the card on first load.
      let needsReload = false
      let needsTitle = false

      while (!streamDone) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          // [DONE] must exit the outer while loop, not just the inner for loop.
          // Previously `break` here only broke the for loop and the reader was
          // called one more time before naturally seeing done===true.
          if (data === '[DONE]') { streamDone = true; break }

          try {
            const event: SSEEvent = JSON.parse(data)

            // Silently drop heartbeat pings — they just keep the connection alive
            if (event.type === 'heartbeat') continue

            handleSSEEvent(event)

            if (event.type === 'expert_question' && event.question) {
              const q = event.question
              const eqMsg: Message = {
                id: `eq-${q.id}`,
                sessionId,
                role: 'ASSISTANT',
                content: '',
                type: 'EXPERT_QUESTION',
                metadata: {
                  id: q.id,
                  sessionId: q.sessionId,
                  stepIndex: q.stepIndex,
                  question: q.question,
                  options: q.options,
                  answered: false,
                  createdAt: q.createdAt,
                },
                createdAt: q.createdAt,
              }
              setMessages(prev => [...prev, eqMsg])
            }

            if (event.type === 'template_summary' && event.summaryText) {
              const summaryMsg: Message = {
                id: `summary-${Date.now()}`,
                sessionId,
                role: 'ASSISTANT',
                content: event.summaryText,
                type: 'TEXT',
                createdAt: new Date().toISOString(),
              }
              setMessages(prev => [...prev, summaryMsg])
            }

            if (event.type === 'template_ready' && event.templateId) {
              onTemplateReady(event.templateId, true)  // fresh generation — auto-surface on mobile
            }
            if (event.type === 'pipeline_complete') {
              stopLoading()
              needsTitle = true
              needsReload = true
            }
            if (event.type === 'pipeline_paused') {
              stopLoading()
              needsReload = true
            }
          } catch { /* ignore malformed SSE lines */ }
        }
      }

      // Stream closed ([DONE]) — all server-side DB writes (including the
      // SCORE_REPORT written in the route's finally block) are now committed.
      if (needsTitle) onSessionTitleChange()
      if (needsReload) await loadSession()
    } catch (err) {
      // AbortError means the user navigated away — silently stop without UI updates
      if ((err as Error).name === 'AbortError') return
      console.error('Pipeline error:', err)
      // Surface the failure to the user instead of failing silently.
      toast.error('生成失败，请重试或检查网络/配置')
      stopLoading()
      await loadSession()
    }
  }

  return (
    <div
      className="flex flex-col flex-1 min-w-0 h-full overflow-hidden"
      style={{ background: 'var(--color-bg)' }}
    >
      {/* Header */}
      <div
        className="shrink-0 px-3 py-2.5 border-b flex items-center gap-1"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        {/* Hamburger — opens the off-canvas sidebar on mobile (< md) */}
        {onOpenSidebar && (
          <button
            onClick={onOpenSidebar}
            className="md:hidden p-2 -ml-1 rounded-lg hover:bg-gray-100 transition-colors"
            style={{ color: 'var(--color-text-1)' }}
            aria-label="打开菜单"
          >
            <Menu size={18} />
          </button>
        )}
        <span className="text-sm font-semibold" style={{ color: 'var(--color-text-1)' }}>
          对话
        </span>
        {isLoading && (
          <span className="ml-2 text-xs text-indigo-500 animate-pulse">生成中…</span>
        )}
        {/* Progress/preview — reachable below xl (where the inline panel is hidden) */}
        {onOpenPanel && (
          <button
            onClick={onOpenPanel}
            className="xl:hidden ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-colors"
          >
            <ListChecks size={13} /> 进度/预览
          </button>
        )}
      </div>

      <MessageList
        messages={messages}
        isLoading={isLoading}
        isNewSession={sessionId === 'new'}
        sessionLoading={sessionId !== 'new' && !sessionLoaded}
        onTemplatePreview={onTemplateReady}
        onExpertAnswered={loadSession}
      />

      <ChatInput
        key={sessionId}
        onSend={content => sendMessage(content)}
        disabled={isLoading}
        selectedMode={selectedMode}
        onModeChange={setSelectedMode}
        annotations={annotations}
        onAnnotationRemove={onAnnotationRemove}
      />
    </div>
  )
}
