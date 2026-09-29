import { createFileRoute } from '@tanstack/react-router'

import { SessionRunner } from '#/components/study/session-runner'
import { sessionQuery } from '#/queries'

export const Route = createFileRoute('/_app/study/$sessionId/')({
  staticData: { chrome: 'focus' },
  loader: ({ context, params }) => context.queryClient.ensureQueryData(sessionQuery(params.sessionId)),
  head: () => ({ meta: [{ title: 'Studying · FlashQuizz' }] }),
  component: SessionPage,
})

function SessionPage() {
  const { sessionId } = Route.useParams()
  return <SessionRunner sessionId={sessionId} />
}
