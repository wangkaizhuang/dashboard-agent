// Simple token estimation — avoids tiktoken build issues in Next.js
// Approximation: 1 token ≈ 3 chars for mixed Chinese/English
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3)
}

export function estimateMessagesTokens(messages: Array<{ content: string }>): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content) + 4, 0)
}
