/**
 * Tests for src/components/chat/MessageList.tsx empty-state logic.
 *
 * Regression: on a hard reload of an EXISTING session, MessageList used to show
 * the "开始设计您的仪表板" new-session CTA during the session-load window (and
 * permanently if the load was slow/raced), because it only checked
 * `messages.length === 0 && !isLoading` and could not tell a still-loading real
 * session apart from an empty new draft. The CTA must only appear for the 'new'
 * draft; a real session that is still loading shows a loading indicator instead.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MessageList } from '@/components/chat/MessageList'
import type { Message } from '@/types'

const base = { onTemplatePreview: () => {}, onExpertAnswered: () => {} }
const CTA = '开始设计您的仪表板'

describe('MessageList — empty state', () => {
  it('shows the new-session CTA for a new draft session', () => {
    render(<MessageList messages={[]} isLoading={false} isNewSession sessionLoading={false} {...base} />)
    expect(screen.getByText(CTA)).toBeInTheDocument()
  })

  it('does NOT show the new-session CTA for a real session still loading (shows loading instead)', () => {
    render(<MessageList messages={[]} isLoading={false} isNewSession={false} sessionLoading {...base} />)
    expect(screen.queryByText(CTA)).not.toBeInTheDocument()
    expect(screen.getByText(/加载中/)).toBeInTheDocument()
  })

  it('does NOT show the new-session CTA for a real loaded session with no messages', () => {
    render(<MessageList messages={[]} isLoading={false} isNewSession={false} sessionLoading={false} {...base} />)
    expect(screen.queryByText(CTA)).not.toBeInTheDocument()
  })

  it('renders messages when present', () => {
    const msg: Message = {
      id: '1', sessionId: 's', role: 'USER', content: '你好世界', type: 'TEXT',
      createdAt: new Date().toISOString(),
    }
    render(<MessageList messages={[msg]} isLoading={false} isNewSession={false} sessionLoading={false} {...base} />)
    expect(screen.getByText('你好世界')).toBeInTheDocument()
  })
})
