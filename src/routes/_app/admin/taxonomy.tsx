import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { CheckIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { ModuleTag, moduleStyle } from '#/components/question/module-tag'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Slider } from '#/components/ui/slider'
import { Textarea } from '#/components/ui/textarea'
import { invalidateContent, taxonomyQuery } from '#/queries'
import { deleteTopic, saveModule, saveSubject, saveTopic } from '#/server/taxonomy.functions'

export const Route = createFileRoute('/_app/admin/taxonomy')({
  loader: ({ context }) => context.queryClient.ensureQueryData(taxonomyQuery),
  component: TaxonomyPage,
})

type Tax = ReturnType<typeof useTaxonomy>
const useTaxonomy = () => useSuspenseQuery(taxonomyQuery).data

function useSave<T>(fn: (args: { data: T }) => Promise<unknown>, message: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      toast.success(message)
      invalidateContent(qc)
    },
    onError: (e) => toast.error(e.message),
  })
}

function TaxonomyPage() {
  const tax = useTaxonomy()
  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-muted-foreground">
        Rename modules and topics, change a module’s colour, or add topics. {tax.unsortedCount ? `${tax.unsortedCount} questions have no topic yet.` : ''}
      </p>
      {tax.modules.map((m) => (
        <ModuleEditor key={m.id} module={m} />
      ))}
    </div>
  )
}

function ModuleEditor({ module: m }: { module: Tax['modules'][number] }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ name: m.name, shortName: m.shortName, description: m.description, accentHue: m.accentHue })
  const save = useSave(useServerFn(saveModule), 'Module saved')
  const addSubject = useSave(useServerFn(saveSubject), 'Subject added')
  const [newSubject, setNewSubject] = useState('')

  return (
    <section data-module style={moduleStyle(editing ? draft.accentHue : m.accentHue)} className="overflow-hidden rounded-2xl border bg-card">
      <div className="h-1.5 bg-module" aria-hidden />
      <div className="space-y-4 p-5">
        {editing ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`name-${m.id}`}>Name</Label>
              <Input id={`name-${m.id}`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`short-${m.id}`}>Short name</Label>
              <Input id={`short-${m.id}`} value={draft.shortName} onChange={(e) => setDraft({ ...draft, shortName: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`desc-${m.id}`}>Description</Label>
              <Textarea id={`desc-${m.id}`} rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Colour</Label>
              <div className="flex items-center gap-4">
                <Slider
                  min={0}
                  max={360}
                  step={5}
                  value={[draft.accentHue]}
                  onValueChange={([v]) => setDraft({ ...draft, accentHue: v })}
                  aria-label="Module colour hue"
                  className="max-w-md"
                />
                <ModuleTag code={m.code} hue={draft.accentHue}>
                  {' '}
                  {draft.shortName}
                </ModuleTag>
              </div>
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button
                disabled={save.isPending}
                onClick={() => save.mutate({ data: { id: m.id, ...draft } }, { onSuccess: () => setEditing(false) })}
              >
                <CheckIcon /> Save module
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">
                <span className="text-module-foreground">{m.code}</span> {m.name}
              </h2>
              <p className="text-sm text-muted-foreground">{m.description}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              <PencilIcon /> Edit
            </Button>
          </div>
        )}

        {m.subjects.map((s) => (
          <SubjectEditor key={s.id} subject={s} moduleSubjects={m.subjects} />
        ))}

        <div className="flex gap-2">
          <Input value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="New subject" aria-label="New subject name" className="max-w-xs" />
          <Button
            variant="outline"
            disabled={!newSubject.trim() || addSubject.isPending}
            onClick={() =>
              addSubject.mutate({ data: { id: null, moduleId: m.id, name: newSubject } }, { onSuccess: () => setNewSubject('') })
            }
          >
            <PlusIcon /> Add subject
          </Button>
        </div>
      </div>
    </section>
  )
}

function SubjectEditor({
  subject: s,
  moduleSubjects,
}: {
  subject: Tax['modules'][number]['subjects'][number]
  moduleSubjects: Tax['modules'][number]['subjects']
}) {
  const [newTopic, setNewTopic] = useState('')
  const addTopic = useSave(useServerFn(saveTopic), 'Topic added')
  return (
    <div className="rounded-xl border p-4">
      <h3 className="font-semibold">{s.name}</h3>
      <ul className="mt-2 divide-y">
        {s.topics.map((t) => (
          <TopicRow key={t.id} topic={t} subjectId={s.id} siblings={moduleSubjects.flatMap((x) => x.topics).filter((x) => x.id !== t.id)} />
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <Input value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="New topic" aria-label={`New topic in ${s.name}`} className="max-w-xs" />
        <Button
          size="sm"
          variant="outline"
          disabled={!newTopic.trim() || addTopic.isPending}
          onClick={() => addTopic.mutate({ data: { id: null, subjectId: s.id, name: newTopic } }, { onSuccess: () => setNewTopic('') })}
        >
          <PlusIcon /> Add topic
        </Button>
      </div>
    </div>
  )
}

function TopicRow({
  topic: t,
  subjectId,
  siblings,
}: {
  topic: { id: number; name: string; questionCount: number }
  subjectId: number
  siblings: { id: number; name: string }[]
}) {
  const [name, setName] = useState(t.name)
  const [editing, setEditing] = useState(false)
  const save = useSave(useServerFn(saveTopic), 'Topic renamed')
  const remove = useSave(useServerFn(deleteTopic), 'Topic deleted')
  return (
    <li className="flex items-center gap-2 py-2">
      {editing ? (
        <>
          <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Topic name" className="h-8 max-w-sm" autoFocus />
          <Button
            size="sm"
            disabled={!name.trim() || save.isPending}
            onClick={() => save.mutate({ data: { id: t.id, subjectId, name } }, { onSuccess: () => setEditing(false) })}
          >
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 text-sm">{t.name}</span>
          <span className="text-xs text-muted-foreground tabular-nums">{t.questionCount} questions</span>
          <Button size="icon" variant="ghost" aria-label={`Rename ${t.name}`} onClick={() => setEditing(true)}>
            <PencilIcon />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Delete ${t.name}`}
            onClick={() => {
              const msg = t.questionCount
                ? `Delete “${t.name}”? Its ${t.questionCount} questions become unsorted${siblings.length ? '' : ''}.`
                : `Delete “${t.name}”?`
              if (window.confirm(msg)) remove.mutate({ data: { id: t.id, reassignTo: null } })
            }}
          >
            <Trash2Icon />
          </Button>
        </>
      )}
    </li>
  )
}
