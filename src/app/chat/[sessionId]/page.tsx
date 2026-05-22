import { AppShell } from '@/components/layout/AppShell'

export default function ChatPage({ params }: { params: { sessionId: string } }) {
  return <AppShell sessionId={params.sessionId} />
}
