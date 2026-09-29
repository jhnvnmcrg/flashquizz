import { createFileRoute } from '@tanstack/react-router'

import { ExamRunner } from '#/components/exam/exam-runner'
import { examQuery } from '#/queries'

export const Route = createFileRoute('/_app/exam/$sessionId/')({
  staticData: { chrome: 'focus' },
  loader: ({ context, params }) => context.queryClient.ensureQueryData(examQuery(params.sessionId)),
  head: () => ({ meta: [{ title: 'Mock exam in progress · FlashQuizz' }] }),
  component: ExamPage,
})

function ExamPage() {
  const { sessionId } = Route.useParams()
  return <ExamRunner sessionId={sessionId} />
}
