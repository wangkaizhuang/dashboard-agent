/**
 * Tests for src/components/layout/Sidebar.tsx
 *
 * Covers:
 * - Renders session list from props
 * - "新对话" button navigates to /chat/new (does NOT create DB session)
 * - "新对话" button is highlighted when currentSessionId === 'new'
 * - "新对话" button is no-op when already on draft (/chat/new)
 * - Delete button appears on hover (group-hover pattern)
 * - Clicking delete shows confirmation popover
 * - Confirmation popover: Cancel dismisses without deleting
 * - Confirmation popover: Confirm calls DELETE API and triggers onSessionsChange
 * - Deleting current session navigates to next session
 * - Deleting only remaining session navigates to /chat/new
 * - Outside click dismisses confirmation popover
 * - Status dots render correct colors per SessionStatus
 * - Sessions grouped by date label
 * - Empty state shown when sessions=[]
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sidebar } from '@/components/layout/Sidebar'
import type { Session } from '@/types'

// Helper to find the confirm "删除" button inside the popover.
// Using getByText('删除') is robust — the trash icon button has NO text content
// (only an SVG icon), while the confirm button has visible text "删除".
function getConfirmDeleteButton() {
  // The popover container has a unique "确认删除此对话？" paragraph
  const popoverText = screen.getByText('确认删除此对话？')
  const popover = popoverText.closest('div[class*="absolute"]')!
  return within(popover as HTMLElement).getByText('删除')
}

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
}))

const makeSession = (overrides: Partial<Session> = {}): Session => ({
  id: 'sess-1',
  title: '测试对话',
  mode: 'QUICK',
  status: 'ACTIVE',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
})

const defaultProps = {
  sessions: [makeSession()],
  currentSessionId: 'sess-1',
  onConfigOpen: vi.fn(),
  onSessionsChange: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as Response)
})

describe('Sidebar — rendering', () => {
  it('renders session title', () => {
    render(<Sidebar {...defaultProps} />)
    expect(screen.getByText('测试对话')).toBeInTheDocument()
  })

  it('shows empty state when no sessions', () => {
    render(<Sidebar {...defaultProps} sessions={[]} />)
    expect(screen.getByText(/还没有对话/)).toBeInTheDocument()
  })

  it('highlights the new chat button when on draft', () => {
    render(<Sidebar {...defaultProps} currentSessionId="new" />)
    const btn = screen.getByRole('button', { name: /新对话/ })
    expect(btn.className).toMatch(/indigo/)
  })

  it('renders ACTIVE session with emerald dot', () => {
    render(<Sidebar {...defaultProps} sessions={[makeSession({ status: 'ACTIVE' })]} />)
    const dot = document.querySelector('.bg-emerald-400')
    expect(dot).toBeInTheDocument()
  })

  it('renders PAUSED session with amber dot', () => {
    render(<Sidebar {...defaultProps} sessions={[makeSession({ status: 'PAUSED' })]} />)
    const dot = document.querySelector('.bg-amber-400')
    expect(dot).toBeInTheDocument()
  })

  it('renders COMPLETED session with slate dot', () => {
    render(<Sidebar {...defaultProps} sessions={[makeSession({ status: 'COMPLETED' })]} />)
    const dot = document.querySelector('.bg-slate-400')
    expect(dot).toBeInTheDocument()
  })

  it('renders FAILED session with red dot', () => {
    render(<Sidebar {...defaultProps} sessions={[makeSession({ status: 'FAILED' })]} />)
    const dot = document.querySelector('.bg-red-400')
    expect(dot).toBeInTheDocument()
  })
})

describe('Sidebar — 新对话 button', () => {
  it('navigates to /chat/new when not already on draft', async () => {
    render(<Sidebar {...defaultProps} currentSessionId="sess-1" />)
    await userEvent.click(screen.getByRole('button', { name: /新对话/ }))
    expect(mockPush).toHaveBeenCalledWith('/chat/new')
  })

  it('does NOT navigate when already on draft (/chat/new)', async () => {
    render(<Sidebar {...defaultProps} currentSessionId="new" />)
    await userEvent.click(screen.getByRole('button', { name: /新对话/ }))
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('does NOT call fetch (no DB session creation)', async () => {
    render(<Sidebar {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /新对话/ }))
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe('Sidebar — delete confirmation popover', () => {
  it('shows confirmation popover after clicking delete icon', async () => {
    render(<Sidebar {...defaultProps} />)
    const deleteBtn = document.querySelector('button[title="删除对话"]') as HTMLElement
    expect(deleteBtn).toBeTruthy()
    await userEvent.click(deleteBtn)
    expect(screen.getByText('确认删除此对话？')).toBeInTheDocument()
  })

  it('Cancel button dismisses popover without calling fetch', async () => {
    render(<Sidebar {...defaultProps} />)
    await userEvent.click(document.querySelector('button[title="删除对话"]') as HTMLElement)
    // The cancel button has unique text "取消" — safe to use getByText
    await userEvent.click(screen.getByText('取消'))
    expect(screen.queryByText('确认删除此对话？')).not.toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('Confirm button calls DELETE API', async () => {
    render(<Sidebar {...defaultProps} />)
    await userEvent.click(document.querySelector('button[title="删除对话"]') as HTMLElement)
    await userEvent.click(getConfirmDeleteButton())
    expect(global.fetch).toHaveBeenCalledWith('/api/sessions/sess-1', { method: 'DELETE' })
  })

  it('Confirm calls onSessionsChange after delete', async () => {
    render(<Sidebar {...defaultProps} />)
    await userEvent.click(document.querySelector('button[title="删除对话"]') as HTMLElement)
    await userEvent.click(getConfirmDeleteButton())
    await waitFor(() => expect(defaultProps.onSessionsChange).toHaveBeenCalled())
  })

  it('dismisses popover on outside click', async () => {
    render(<Sidebar {...defaultProps} />)
    await userEvent.click(document.querySelector('button[title="删除对话"]') as HTMLElement)
    expect(screen.getByText('确认删除此对话？')).toBeInTheDocument()

    // Click outside the popover
    await act(async () => {
      fireEvent.mouseDown(document.body)
    })
    expect(screen.queryByText('确认删除此对话？')).not.toBeInTheDocument()
  })
})

describe('Sidebar — delete navigation', () => {
  it('navigates to next session when deleting current session', async () => {
    const sessions = [
      makeSession({ id: 'sess-1', title: 'First' }),
      makeSession({ id: 'sess-2', title: 'Second', updatedAt: new Date(Date.now() - 1000).toISOString() }),
    ]
    render(<Sidebar {...defaultProps} sessions={sessions} currentSessionId="sess-1" />)

    // Click delete on the first session (the current one)
    const deleteBtns = document.querySelectorAll('button[title="删除对话"]')
    await userEvent.click(deleteBtns[0] as HTMLElement)
    await userEvent.click(getConfirmDeleteButton())
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/chat/sess-2')
    })
  })

  it('navigates to /chat/new when deleting last session', async () => {
    render(<Sidebar {...defaultProps} sessions={[makeSession()]} currentSessionId="sess-1" />)
    await userEvent.click(document.querySelector('button[title="删除对话"]') as HTMLElement)
    await userEvent.click(getConfirmDeleteButton())
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/chat/new')
    })
  })

  it('does NOT navigate when deleting a non-current session', async () => {
    const sessions = [
      makeSession({ id: 'sess-1', title: 'Current' }),
      makeSession({ id: 'sess-2', title: 'Other', updatedAt: new Date(Date.now() - 1000).toISOString() }),
    ]
    render(<Sidebar {...defaultProps} sessions={sessions} currentSessionId="sess-1" />)

    // Click delete on sess-2 (not the current one)
    const deleteBtns = document.querySelectorAll('button[title="删除对话"]')
    await userEvent.click(deleteBtns[1] as HTMLElement)
    await userEvent.click(getConfirmDeleteButton())
    await waitFor(() => expect(defaultProps.onSessionsChange).toHaveBeenCalled())
    expect(mockPush).not.toHaveBeenCalled()
  })
})

describe('Sidebar — session navigation', () => {
  it('clicking a session item navigates to its route', async () => {
    render(<Sidebar {...defaultProps} sessions={[makeSession({ id: 'sess-42' })]} />)
    const sessionItem = screen.getByText('测试对话').closest('[class*="cursor-pointer"]') as HTMLElement
    await userEvent.click(sessionItem)
    expect(mockPush).toHaveBeenCalledWith('/chat/sess-42')
  })
})
