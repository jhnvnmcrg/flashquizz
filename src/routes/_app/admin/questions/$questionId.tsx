import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { ChevronLeftIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { ImageManager } from '#/components/admin/image-manager'
import { QuestionEditor } from '#/components/admin/question-editor'
import { StatusBadge } from '#/components/admin/status-badge'
import { ModuleTag } from '#/components/question/module-tag'
import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/textarea'
import { FLAG_LABELS, type ChoiceKey, type QuestionFlag } from '#/lib/schemas/enums'
import type { QuestionEditorValues } from '#/lib/schemas/question'
import { adminQuestionQuery, invalidateContent, taxonomyQuery } from '#/queries'
import { saveGroupContext, updateQuestion } from '#/server/admin.functions'

export const Route = createFileRoute('/_app/admin/questions/$questionId')({
  params: {
    parse: (p) => ({ questionId: p.questionId }),
  },
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(adminQuestionQuery(Number(params.questionId))),
      context.queryClient.ensureQueryData(taxonomyQuery),
    ]),
  component: EditQuestionPage,
})

function EditQuestionPage() {
  const { questionId } = Route.useParams()
  const id = Number(questionId)
  const qc = useQueryClient()
  const { data } = useSuspenseQuery(adminQuestionQuery(id))
  const { data: tax } = useSuspenseQuery(taxonomyQuery)
  const q = data.question
  const update = useServerFn(updateQuestion)
  const mutation = useMutation({
    mutationFn: update,
    onSuccess: () => {
      toast.success('Saved')
      invalidateContent(qc)
    },
    onError: (e) => toast.error('Not saved', { description: e.message }),
  })

  const initial: QuestionEditorValues = {
    moduleId: q.moduleId,
    topicId: q.topicId,
    sourceId: q.sourceId,
    groupId: q.groupId,
    groupOrder: q.groupOrder,
    format: q.format,
    stem: q.stem,
    statements: q.statements,
    choices: q.choices,
    answerKey: (q.answerKey as ChoiceKey | null) ?? null,
    rationale: q.rationale,
    mnemonic: q.mnemonic,
    requiresImage: q.requiresImage,
    flags: q.flags as QuestionFlag[],
    status: q.status,
    reviewNote: q.reviewNote,
  }

  const refresh = () => qc.invalidateQueries({ queryKey: adminQuestionQuery(id).queryKey })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/questions">
            <ChevronLeftIcon /> All questions
          </Link>
        </Button>
        <ModuleTag code={q.module.code} hue={q.module.accentHue} />
        <span className="text-sm text-muted-foreground tabular-nums">{q.sourceRef}</span>
        <StatusBadge status={q.status} />
        {q.editedAt ? <span className="text-xs text-muted-foreground">Edited — re-imports won’t overwrite it</span> : null}
      </div>

      {q.reviewNote || q.flags.length ? (
        <div className="rounded-xl border border-warning/50 bg-warning-soft px-4 py-3 text-sm text-warning-foreground">
          {q.flags.length ? (
            <p className="font-semibold">{q.flags.map((f) => FLAG_LABELS[f as QuestionFlag] ?? f).join(', ')}</p>
          ) : null}
          {q.reviewNote ? <p className="mt-0.5">{q.reviewNote}</p> : null}
        </div>
      ) : null}

      <QuestionEditor
        key={q.updatedAt ? new Date(q.updatedAt).getTime() : q.id}
        initial={initial}
        taxonomy={tax}
        images={q.images}
        context={q.group?.context}
        saving={mutation.isPending}
        onSave={(values) => mutation.mutateAsync({ data: { id, values } })}
        aside={
          <>
            {q.group ? <GroupContextEditor groupId={q.group.id} context={q.group.context} members={data.groupMembers} onSaved={refresh} /> : null}
            <ImageManager
              questionId={q.id}
              images={q.images}
              choiceKeys={q.choices.map((c) => c.key)}
              onChange={() => {
                refresh()
                invalidateContent(qc)
              }}
            />
            {q.raw ? (
              <details className="rounded-2xl border bg-card p-5">
                <summary className="cursor-pointer font-bold">Original text from the reviewer</summary>
                <div className="mt-3 space-y-3 text-sm">
                  {q.raw.text ? <pre className="whitespace-pre-wrap rounded-lg bg-secondary p-3 font-sans">{q.raw.text}</pre> : null}
                  {q.raw.answer ? <p><span className="font-semibold">Answer as printed:</span> {q.raw.answer}</p> : null}
                  {q.raw.rationale ? <pre className="whitespace-pre-wrap rounded-lg bg-secondary p-3 font-sans">{q.raw.rationale}</pre> : null}
                  {q.sourcePage ? <p className="text-muted-foreground">{q.source.name}, page {q.sourcePage}</p> : null}
                </div>
              </details>
            ) : null}
            {data.recentAttempts.length ? (
              <div className="rounded-2xl border bg-card p-5 text-sm">
                <h3 className="font-bold">Your recent answers</h3>
                <ul className="mt-2 space-y-1">
                  {data.recentAttempts.map((a) => (
                    <li key={new Date(a.answeredAt).toISOString()} className="flex justify-between">
                      <span>
                        {a.selectedKey ?? '—'} {a.isCorrect ? 'right' : 'wrong'} in {a.mode}
                      </span>
                      <span className="text-muted-foreground">{new Date(a.answeredAt).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        }
      />
    </div>
  )
}

function GroupContextEditor({
  groupId,
  context,
  members,
  onSaved,
}: {
  groupId: number
  context: string
  members: { id: number; sourceRef: string; groupOrder: number | null }[]
  onSaved: () => void
}) {
  const [value, setValue] = useState(context)
  const save = useServerFn(saveGroupContext)
  const mutation = useMutation({
    mutationFn: save,
    onSuccess: () => {
      toast.success('Shared context saved')
      onSaved()
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <fieldset className="space-y-3 rounded-2xl border bg-card p-5">
      <legend className="sr-only">Shared context</legend>
      <div>
        <h3 className="font-bold">Shared context</h3>
        <p className="text-sm text-muted-foreground">
          Shown above every item in this set:{' '}
          {members.map((m, i) => (
            <span key={m.id}>
              {i ? ', ' : ''}
              <Link to="/admin/questions/$questionId" params={{ questionId: String(m.id) }} className="text-info hover:underline">
                {m.sourceRef}
              </Link>
            </span>
          ))}
        </p>
      </div>
      <Textarea rows={3} value={value} onChange={(e) => setValue(e.target.value)} aria-label="Shared context" />
      <Button
        type="button"
        variant="outline"
        disabled={mutation.isPending || !value.trim() || value === context}
        onClick={() => mutation.mutate({ data: { groupId, context: value } })}
      >
        Save shared context
      </Button>
    </fieldset>
  )
}
