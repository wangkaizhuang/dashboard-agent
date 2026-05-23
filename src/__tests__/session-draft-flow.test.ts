/**
 * Tests for the draft session flow
 *
 * The "draft-first" pattern means:
 * - Clicking 新对话 navigates to /chat/new (no DB session)
 * - The first message send creates a real session via POST /api/sessions
 * - The pending message + mode is stored in sessionStorage as JSON
 * - On navigation to the real session, the pending message is auto-sent
 * - The mode stored in sessionStorage is the mode the user had selected
 *
 * These tests verify the sessionStorage contract used between ChatPanel
 * (writer) and the ChatPanel mount effect (reader).
 */
import { describe, it, expect, beforeEach } from 'vitest'

// The shape that ChatPanel writes to sessionStorage
interface PendingMessage {
  content: string
  mode: 'QUICK' | 'THINK' | 'EXPERT'
}

function writePendingMessage(sessionId: string, content: string, mode: 'QUICK' | 'THINK' | 'EXPERT'): void {
  sessionStorage.setItem(`pendingMsg:${sessionId}`, JSON.stringify({ content, mode }))
}

function readAndClearPendingMessage(sessionId: string): PendingMessage | null {
  const raw = sessionStorage.getItem(`pendingMsg:${sessionId}`)
  if (!raw) return null
  sessionStorage.removeItem(`pendingMsg:${sessionId}`)
  try {
    return JSON.parse(raw) as PendingMessage
  } catch {
    return null
  }
}

beforeEach(() => {
  sessionStorage.clear()
})

describe('sessionStorage pending message contract', () => {
  it('round-trips content and mode correctly (QUICK)', () => {
    writePendingMessage('sess-xyz', 'create a dashboard', 'QUICK')
    const msg = readAndClearPendingMessage('sess-xyz')
    expect(msg).toEqual({ content: 'create a dashboard', mode: 'QUICK' })
  })

  it('round-trips THINK mode', () => {
    writePendingMessage('sess-abc', 'think about it', 'THINK')
    const msg = readAndClearPendingMessage('sess-abc')
    expect(msg?.mode).toBe('THINK')
  })

  it('round-trips EXPERT mode', () => {
    writePendingMessage('sess-def', 'expert analysis', 'EXPERT')
    const msg = readAndClearPendingMessage('sess-def')
    expect(msg?.mode).toBe('EXPERT')
  })

  it('is keyed by sessionId (different sessions do not interfere)', () => {
    writePendingMessage('sess-1', 'message one', 'QUICK')
    writePendingMessage('sess-2', 'message two', 'THINK')
    expect(readAndClearPendingMessage('sess-1')?.content).toBe('message one')
    expect(readAndClearPendingMessage('sess-2')?.content).toBe('message two')
  })

  it('removes the key from sessionStorage after reading', () => {
    writePendingMessage('sess-cleanup', 'hello', 'QUICK')
    readAndClearPendingMessage('sess-cleanup')
    expect(sessionStorage.getItem('pendingMsg:sess-cleanup')).toBeNull()
  })

  it('returns null when no pending message exists', () => {
    const msg = readAndClearPendingMessage('sess-nonexistent')
    expect(msg).toBeNull()
  })

  it('does not accidentally clear other sessionStorage keys', () => {
    sessionStorage.setItem('other-key', 'other-value')
    writePendingMessage('sess-clear', 'msg', 'QUICK')
    readAndClearPendingMessage('sess-clear')
    expect(sessionStorage.getItem('other-key')).toBe('other-value')
  })

  it('handles special characters in content', () => {
    const content = '分析"报表" & 指标 <数据>'
    writePendingMessage('sess-special', content, 'EXPERT')
    const msg = readAndClearPendingMessage('sess-special')
    expect(msg?.content).toBe(content)
  })

  it('handles very long content without truncation', () => {
    const longContent = 'x'.repeat(10_000)
    writePendingMessage('sess-long', longContent, 'THINK')
    const msg = readAndClearPendingMessage('sess-long')
    expect(msg?.content.length).toBe(10_000)
  })
})

describe('draft session — no DB session creation', () => {
  // Simulates what ChatPanel does: only creates a DB session when sending the first message

  it('stores pending message before navigating to new session URL', () => {
    // Simulate what ChatPanel.sendMessage does for sessionId === 'new':
    const simulatedSessionId = 'new-session-from-api'
    const content = 'create a sales dashboard'
    const mode: 'THINK' = 'THINK'

    // This is what ChatPanel writes before router.replace()
    writePendingMessage(simulatedSessionId, content, mode)

    // Later, when the new session page mounts, it reads this
    const pending = readAndClearPendingMessage(simulatedSessionId)
    expect(pending).not.toBeNull()
    expect(pending?.content).toBe(content)
    expect(pending?.mode).toBe('THINK')
  })

  it('pending message is consumed exactly once (auto-send only fires once)', () => {
    writePendingMessage('sess-once', 'one-time message', 'QUICK')
    const first = readAndClearPendingMessage('sess-once')
    const second = readAndClearPendingMessage('sess-once')
    expect(first).not.toBeNull()
    expect(second).toBeNull() // consumed
  })
})

describe('mode selection persistence across draft → real session', () => {
  it('THINK mode selected in draft is correctly recovered', () => {
    // User selects THINK, types message, clicks send
    const selectedMode: 'THINK' = 'THINK'
    const content = 'deep analysis request'

    // ChatPanel writes to sessionStorage with the correct mode
    writePendingMessage('real-sess-1', content, selectedMode)

    // When real session mounts (possibly before loadSession() sets mode from DB):
    const pending = readAndClearPendingMessage('real-sess-1')
    // The mode from sessionStorage is the one that was selected in the draft
    expect(pending?.mode).toBe('THINK')
    // NOT 'QUICK' (the default selectedMode state) — this was the bug before the fix
    expect(pending?.mode).not.toBe('QUICK')
  })

  it('EXPERT mode selected in draft is correctly recovered', () => {
    writePendingMessage('real-sess-2', 'expert req', 'EXPERT')
    const pending = readAndClearPendingMessage('real-sess-2')
    expect(pending?.mode).toBe('EXPERT')
    expect(pending?.mode).not.toBe('QUICK')
  })
})
