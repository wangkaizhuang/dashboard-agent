'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { usePipelineStore } from '@/store/pipeline'
import { MessageList } from '@/components/chat/MessageList'
import { ChatInput } from '@/components/chat/ChatInput'
import type { Message, SSEEvent, Mode, Annotation } from '@/types'

interface ChatPanelProps {
  sessionId: string
  onTemplateReady: (templateId: string) => void
  onSessionTitleChange: () => void
  onSessionCreated: () => void
  annotations?: Annotation[]
  onAnnotationRemove?: (componentId: string) => void
  onAnnotationClear?: () => void
}

export function ChatPanel({
  sessionId,
  onTemplateReady,
  onSessionTitleChange,
  onSessionCreated,
  annotations = [],
  onAnnotationRemove,
  onAnnotationClear,
}: ChatPanelProps) {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedMode, setSelectedMode] = useState<Mode>('QUICK')
  const { handleSSEEvent, initPipeline, loadStepsFromDB, setRunning } = usePipelineStore()

  // Synchronous guard that prevents double-send even before React re-renders.
  // React state (isLoading) is reliable for UI but has a render-cycle delay;
  // a ref is set synchronously so concurrent async calls are blocked immediately.
  const isLoadingRef = useRef(false)

  // Always-current ref for sendMessage so it can be called from effects / timeouts
  const sendMessageRef = useRef<(content: string, modeOverride?: Mode) => Promise<void>>()

  const loadSession = useCallback(async () => {
    if (sessionId === 'new') return
    try {
      const res = await fetch(`/api/sessions/${sessionId}`)
      if (!res.ok) return
      const session = await res.json()
      setMessages(session.messages || [])
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
      }
    } catch (err) {
      console.error('Failed to load session:', err)
    }
  }, [sessionId])

  // Keep sendMessageRef pointing to the latest sendMessage closure after every render
  useEffect(() => {
    sendMessageRef.current = (content, modeOverride) => sendMessage(content, modeOverride)
  })

  // Initialize when sessionId changes
  useEffect(() => {
    if (sessionId === 'new') {
      // Draft state — show empty UI, reset pipeline
      setMessages([])
      setIsLoading(false)
      setRunning(false)
      initPipeline('new')
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
      const response = await fetch(`/api/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, mode, annotations }),
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
              onTemplateReady(event.templateId)
            }
            if (event.type === 'pipeline_complete') {
              stopLoading()
              onSessionTitleChange()
              await loadSession()
            }
            if (event.type === 'pipeline_paused') {
              stopLoading()
              await loadSession()
            }
          } catch { /* ignore malformed SSE lines */ }
        }
      }
    } catch (err) {
      console.error('Pipeline error:', err)
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
        className="shrink-0 px-4 py-3 border-b flex items-center"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        <span className="text-sm font-semibold" style={{ color: 'var(--color-text-1)' }}>
          对话
        </span>
        {isLoading && (
          <span className="ml-2 text-xs text-indigo-500 animate-pulse">生成中…</span>
        )}
      </div>

      <MessageList
        messages={messages}
        isLoading={isLoading}
        onTemplatePreview={onTemplateReady}
        onExpertAnswered={loadSession}
      />

      <ChatInput
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
