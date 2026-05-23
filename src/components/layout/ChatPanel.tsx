'use client'
import { useState, useEffect, useCallback } from 'react'
import { usePipelineStore } from '@/store/pipeline'
import { MessageList } from '@/components/chat/MessageList'
import { ChatInput } from '@/components/chat/ChatInput'
import type { Message, SSEEvent } from '@/types'

interface ChatPanelProps {
  sessionId: string
  onTemplateReady: (templateId: string) => void
  onSessionTitleChange: () => void
}

export function ChatPanel({ sessionId, onTemplateReady, onSessionTitleChange }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const { handleSSEEvent, initPipeline, loadStepsFromDB, setRunning } = usePipelineStore()

  const loadSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`)
      if (res.ok) {
        const session = await res.json()
        setMessages(session.messages || [])
        // If session has a template, inject a template card message
        if (session.template) {
          const templateMsg: Message = {
            id: `template-${session.template.id}`,
            sessionId,
            role: 'ASSISTANT',
            content: '',
            type: 'TEMPLATE_CARD',
            metadata: { templateId: session.template.id },
            createdAt: session.template.createdAt
          }
          setMessages(prev => {
            const hasTemplate = prev.some(m => m.type === 'TEMPLATE_CARD')
            return hasTemplate ? prev : [...(session.messages || []), templateMsg]
          })
        }
      }
    } catch (err) {
      console.error('Failed to load session:', err)
    }
  }, [sessionId])

  useEffect(() => {
    initPipeline(sessionId)
    loadStepsFromDB(sessionId)
    loadSession()
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  const sendMessage = async (content: string) => {
    if (isLoading) return

    // Optimistic user message
    const tempId = `temp-${Date.now()}`
    const userMsg: Message = {
      id: tempId, sessionId, role: 'USER', content, type: 'TEXT',
      createdAt: new Date().toISOString()
    }
    setMessages(prev => [...prev, userMsg])
    setIsLoading(true)
    setRunning(true)

    try {
      const response = await fetch(`/api/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      })

      if (!response.ok || !response.body) throw new Error('Request failed')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') break

          try {
            const event: SSEEvent = JSON.parse(data)
            handleSSEEvent(event)

            if (event.type === 'template_ready' && event.templateId) {
              onTemplateReady(event.templateId)
            }
            if (event.type === 'pipeline_complete') {
              setIsLoading(false)
              setRunning(false)
              onSessionTitleChange()
              await loadSession()
            }
            if (event.type === 'pipeline_paused') {
              setIsLoading(false)
              setRunning(false)
              await loadSession()
            }
          } catch {
            // Ignore parse errors for malformed SSE lines
          }
        }
      }
    } catch (err) {
      console.error('Pipeline error:', err)
      setIsLoading(false)
      setRunning(false)
      await loadSession()
    }
  }

  const handleTemplatePreview = (templateId: string) => {
    onTemplateReady(templateId)
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      {/* Chat header */}
      <div
        className="shrink-0 px-4 py-3 border-b flex items-center"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        <span className="text-sm font-semibold" style={{ color: 'var(--color-text-1)' }}>对话</span>
        {isLoading && (
          <span className="ml-2 text-xs text-indigo-500 animate-pulse">生成中...</span>
        )}
      </div>

      <MessageList
        messages={messages}
        isLoading={isLoading}
        sessionId={sessionId}
        onTemplatePreview={handleTemplatePreview}
        onExpertAnswered={loadSession}
      />

      <ChatInput onSend={sendMessage} disabled={isLoading} />
    </div>
  )
}
