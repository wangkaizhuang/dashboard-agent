export default function ChatPage({ params }: { params: { sessionId: string } }) {
  return (
    <div className="flex h-screen" style={{ background: 'var(--color-bg)' }}>
      {/* AppShell will be implemented by UI Shell agent */}
      <div className="flex-1 flex items-center justify-center text-gray-400">
        Loading session: {params.sessionId}
      </div>
    </div>
  )
}
