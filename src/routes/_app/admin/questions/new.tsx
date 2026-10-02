import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { toast } from 'sonner'

import { QuestionEditor } from '#/components/admin/question-editor'
import type { QuestionEditorValues } from '#/lib/schemas/question'
import { invalidateContent, adminTaxonomyQuery } from '#/queries'
import { createQuestion } from '#/server/admin.functions'

export const Route = createFileRoute('/_app/admin/questions/new')({
  loader: ({ context }) => context.queryClient.ensureQueryData(adminTaxonomyQuery),
  component: NewQuestionPage,
})

function NewQuestionPage() {
  const { data: tax } = useSuspenseQuery(adminTaxonomyQuery)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const create = useServerFn(createQuestion)
  const mutation = useMutation({
    mutationFn: create,
    onSuccess: ({ id }) => {
      toast.success('Question added')
      invalidateContent(qc)
      navigate({ to: '/admin/questions/$questionId', params: { questionId: String(id) } })
    },
    onError: (e) => toast.error('Not saved', { description: e.message }),
  })

  const manual = tax.sources.find((s) => s.slug === 'manual')
  const initial: QuestionEditorValues = {
    moduleId: tax.modules[0]?.id ?? 0,
    topicId: null,
    sourceId: manual?.id ?? tax.sources[0]?.id ?? 0,
    groupId: null,
    groupOrder: null,
    format: 'single',
    stem: '',
    statements: [],
    choices: [
      { key: 'A', text: '' },
      { key: 'B', text: '' },
      { key: 'C', text: '' },
      { key: 'D', text: '' },
    ],
    answerKey: null,
    rationale: '',
    mnemonic: '',
    requiresImage: false,
    flags: [],
    status: 'verified',
    reviewNote: '',
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">New question</h2>
      <p className="text-sm text-muted-foreground">You can attach images after saving.</p>
      <QuestionEditor
        initial={initial}
        taxonomy={tax}
        saving={mutation.isPending}
        submitLabel="Add question"
        onSave={(values) => mutation.mutateAsync({ data: values })}
      />
    </div>
  )
}
