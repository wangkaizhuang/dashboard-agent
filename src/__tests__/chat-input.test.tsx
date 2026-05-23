/**
 * Tests for src/components/chat/ChatInput.tsx
 *
 * Covers:
 * - Renders all three mode chips (快速 / 深思 / 专家)
 * - Active mode chip is visually distinct
 * - Clicking a mode chip calls onModeChange with correct mode
 * - Mode chips are disabled when `disabled=true`
 * - Send button is disabled when textarea is empty
 * - Send button is disabled when `disabled=true`
 * - Send fires onSend with trimmed content
 * - Enter key sends message (not Shift+Enter)
 * - Shift+Enter inserts newline (not sends)
 * - Textarea value is cleared after successful send
 * - Cannot send empty/whitespace-only message
 * - Placeholder text is customizable
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatInput } from '@/components/chat/ChatInput'

const defaultProps = {
  onSend: vi.fn(),
  selectedMode: 'QUICK' as const,
  onModeChange: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ChatInput — mode selector', () => {
  it('renders all three mode chips', () => {
    render(<ChatInput {...defaultProps} />)
    expect(screen.getByRole('button', { name: /快速/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /深思/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /专家/ })).toBeInTheDocument()
  })

  it('QUICK chip has active styling when selectedMode is QUICK', () => {
    render(<ChatInput {...defaultProps} selectedMode="QUICK" />)
    const btn = screen.getByRole('button', { name: /快速/ })
    expect(btn.className).toMatch(/emerald/)
  })

  it('THINK chip has active styling when selectedMode is THINK', () => {
    render(<ChatInput {...defaultProps} selectedMode="THINK" />)
    const btn = screen.getByRole('button', { name: /深思/ })
    expect(btn.className).toMatch(/blue/)
  })

  it('EXPERT chip has active styling when selectedMode is EXPERT', () => {
    render(<ChatInput {...defaultProps} selectedMode="EXPERT" />)
    const btn = screen.getByRole('button', { name: /专家/ })
    expect(btn.className).toMatch(/purple/)
  })

  it('clicking THINK chip calls onModeChange("THINK")', async () => {
    render(<ChatInput {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /深思/ }))
    expect(defaultProps.onModeChange).toHaveBeenCalledWith('THINK')
  })

  it('clicking EXPERT chip calls onModeChange("EXPERT")', async () => {
    render(<ChatInput {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /专家/ }))
    expect(defaultProps.onModeChange).toHaveBeenCalledWith('EXPERT')
  })

  it('clicking QUICK chip calls onModeChange("QUICK")', async () => {
    render(<ChatInput {...defaultProps} selectedMode="THINK" />)
    await userEvent.click(screen.getByRole('button', { name: /快速/ }))
    expect(defaultProps.onModeChange).toHaveBeenCalledWith('QUICK')
  })

  it('mode chips are disabled when disabled=true', () => {
    render(<ChatInput {...defaultProps} disabled={true} />)
    const chips = [
      screen.getByRole('button', { name: /快速/ }),
      screen.getByRole('button', { name: /深思/ }),
      screen.getByRole('button', { name: /专家/ }),
    ]
    chips.forEach(chip => expect(chip).toBeDisabled())
  })
})

describe('ChatInput — send behavior', () => {
  it('send button is disabled when textarea is empty', () => {
    render(<ChatInput {...defaultProps} />)
    const textarea = screen.getByRole('textbox')
    expect(textarea).toHaveValue('')
    // Send button is the last button in the container
    const sendBtn = document.querySelector('button[class*="rounded-lg"]') as HTMLElement
    expect(sendBtn).toBeDisabled()
  })

  it('send button is disabled when disabled=true', () => {
    render(<ChatInput {...defaultProps} disabled={true} />)
    const sendBtn = document.querySelector('button[class*="rounded-lg"]') as HTMLElement
    expect(sendBtn).toBeDisabled()
  })

  it('calls onSend with trimmed content when send button clicked', async () => {
    render(<ChatInput {...defaultProps} />)
    const textarea = screen.getByRole('textbox')
    await userEvent.type(textarea, '  hello world  ')
    await userEvent.click(document.querySelector('button[class*="bg-indigo"]') as HTMLElement)
    expect(defaultProps.onSend).toHaveBeenCalledWith('hello world')
  })

  it('clears textarea after send', async () => {
    render(<ChatInput {...defaultProps} />)
    const textarea = screen.getByRole('textbox')
    await userEvent.type(textarea, 'test message')
    await userEvent.click(document.querySelector('button[class*="bg-indigo"]') as HTMLElement)
    expect(textarea).toHaveValue('')
  })

  it('Enter key sends message', async () => {
    render(<ChatInput {...defaultProps} />)
    const textarea = screen.getByRole('textbox')
    await userEvent.type(textarea, 'hello')
    await userEvent.keyboard('{Enter}')
    expect(defaultProps.onSend).toHaveBeenCalledWith('hello')
  })

  it('Shift+Enter does NOT send (inserts newline)', async () => {
    render(<ChatInput {...defaultProps} />)
    const textarea = screen.getByRole('textbox')
    await userEvent.type(textarea, 'line1')
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}')
    expect(defaultProps.onSend).not.toHaveBeenCalled()
  })

  it('cannot send empty message via Enter', async () => {
    render(<ChatInput {...defaultProps} />)
    const textarea = screen.getByRole('textbox')
    await userEvent.click(textarea)
    await userEvent.keyboard('{Enter}')
    expect(defaultProps.onSend).not.toHaveBeenCalled()
  })

  it('cannot send whitespace-only message', async () => {
    render(<ChatInput {...defaultProps} />)
    const textarea = screen.getByRole('textbox')
    await userEvent.type(textarea, '   ')
    await userEvent.keyboard('{Enter}')
    expect(defaultProps.onSend).not.toHaveBeenCalled()
  })

  it('shows custom placeholder', () => {
    render(<ChatInput {...defaultProps} placeholder="自定义占位符" />)
    const textarea = screen.getByPlaceholderText('自定义占位符')
    expect(textarea).toBeInTheDocument()
  })

  it('shows default placeholder', () => {
    render(<ChatInput {...defaultProps} />)
    const textarea = screen.getByPlaceholderText('描述您想要的仪表板…')
    expect(textarea).toBeInTheDocument()
  })

  it('shows keyboard shortcut hint text', () => {
    render(<ChatInput {...defaultProps} />)
    expect(screen.getByText(/Enter 发送/)).toBeInTheDocument()
    expect(screen.getByText(/Shift\+Enter 换行/)).toBeInTheDocument()
  })
})
