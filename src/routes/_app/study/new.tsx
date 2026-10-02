import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, stripSearchParams, useNavigate } from '@tanstack/react-router'
import { Layers3Icon, ListChecksIcon } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'

import { Segmented } from '#/components/app/segmented'
import { Button } from '#/components/ui/button'
import { Label } from '#/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { STUDY_ORDER, STUDY_SCOPE, type StudyOrder, type StudyScope } from '#/lib/schemas/enums'
import { cn } from '#/lib/utils'
import { taxonomyQuery } from '#/queries'
import { startSession } from '#/offline/api'

const defaults = { mode: 'practice', scope: 'all', count: 20, order: 'smart' } as const

const searchSchema = z.object({
  mode: z.enum(['flashcards', 'practice']).default(defaults.mode).catch(defaults.mode),
  module: z.string().optional().catch(undefined),
  topic: z.number().int().optional().catch(undefined),
  source: z.string().optional().catch(undefined),
  scope: z.enum(STUDY_SCOPE).default(defaults.scope).catch(defaults.scope),
  count: z.number().int().min(5).max(200).default(defaults.count).catch(defaults.count),
  order: z.enum(STUDY_ORDER).default(defaults.order).catch(defaults.order),
})

export const Route = createFileRoute('/_app/study/new')({
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(defaults)] },
  loader: ({ context }) => context.queryClient.ensureQueryData(taxonomyQuery),
  head: () => ({ meta: [{ title: 'Start studying · FlashQuizz' }] }),
  component: StudySetup,
})

const SCOPE_OPTIONS: { value: StudyScope; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'unseen', label: 'New to me' },
  { value: 'mistakes', label: 'Got wrong' },
  { value: 'bookmarked', label: 'Bookmarked' },
  { value: 'due', label: 'Due for review' },
]

const ORDER_OPTIONS: { value: StudyOrder; label: string; hint: string }[] = [
  { value: 'smart', label: 'Smart', hint: 'Due cards first, then new ones, then misses' },
  { value: 'random', label: 'Shuffled', hint: 'Random order' },
  { value: 'sequential', label: 'Source order', hint: 'As numbered in the reviewer' },
]

const ALL = '__all'

function StudySetup() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { data: tax } = useSuspenseQuery(taxonomyQuery)
  const start = startSession

  const set = (patch: Partial<typeof search>) => navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })
  const mod = tax.modules.find((m) => m.slug === search.module)

  const mutation = useMutation({
    mutationFn: start,
    onSuccess: ({ id }) => navigate({ to: '/study/$sessionId', params: { sessionId: id } }),
    onError: (e) => toast.error(e.message),
  })

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Start studying</h1>
        <p className="mt-1 text-muted-foreground">Pick what to cover. Your answers feed the review deck either way.</p>
      </div>

      <div role="radiogroup" aria-label="Mode" className="grid gap-3 sm:grid-cols-2">
        {(
          [
            {
              value: 'practice',
              icon: ListChecksIcon,
              title: 'Practice quiz',
              body: 'Pick A–E and see the rationale right away.',
            },
            {
              value: 'flashcards',
              icon: Layers3Icon,
              title: 'Flashcards',
              body: 'Think of the answer, flip, then rate yourself.',
            },
          ] as const
        ).map((m) => (
          // biome-ignore lint/a11y/useSemanticElements: card-style option; ARIA radio semantics + keyboard shortcuts
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={search.mode === m.value}
            onClick={() => set({ mode: m.value })}
            className={cn(
              'flex gap-3 rounded-2xl border bg-card p-4 text-left transition-colors hover:border-primary/50',
              search.mode === m.value && 'border-primary ring-1 ring-primary/40',
            )}
          >
            <m.icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="block font-bold">{m.title}</span>
              <span className="block text-sm text-muted-foreground">{m.body}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="module">Module</Label>
          <Select
            value={search.module ?? ALL}
            onValueChange={(v) => set({ module: v === ALL ? undefined : v, topic: undefined })}
          >
            <SelectTrigger id="module" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All modules</SelectItem>
              {tax.modules.map((m) => (
                <SelectItem key={m.slug} value={m.slug}>
                  {m.code} {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="topic">Topic</Label>
          <Select
            disabled={!mod}
            value={search.topic ? String(search.topic) : ALL}
            onValueChange={(v) => set({ topic: v === ALL ? undefined : Number(v) })}
          >
            <SelectTrigger id="topic" className="w-full">
              <SelectValue placeholder={mod ? 'All topics' : 'Choose a module first'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All topics</SelectItem>
              {mod?.subjects.flatMap((s) =>
                s.topics.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                )),
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="source">Reviewer</Label>
          <Select value={search.source ?? ALL} onValueChange={(v) => set({ source: v === ALL ? undefined : v })}>
            <SelectTrigger id="source" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All reviewers</SelectItem>
              {tax.sources
                .filter((s) => s.slug !== 'manual' && s.slug !== 'sample')
                .map((s) => (
                  <SelectItem key={s.slug} value={s.slug}>
                    {s.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Which questions</p>
        <Segmented label="Which questions" value={search.scope} onChange={(v) => set({ scope: v })} options={SCOPE_OPTIONS} />
      </div>

      <div className="flex flex-wrap gap-8">
        <div className="space-y-2">
          <p className="text-sm font-medium">How many</p>
          <Segmented
            label="How many"
            value={search.count}
            onChange={(v) => set({ count: v })}
            options={[10, 20, 50, 100].map((n) => ({ value: n, label: String(n) }))}
          />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Order</p>
          <Segmented label="Order" value={search.order} onChange={(v) => set({ order: v })} options={ORDER_OPTIONS} />
        </div>
      </div>

      <Button
        size="lg"
        className="w-full sm:w-auto"
        disabled={mutation.isPending}
        onClick={() =>
          mutation.mutate({
            data: {
              mode: search.mode,
              count: search.count,
              order: search.order,
              filters: {
                moduleSlugs: search.module ? [search.module] : [],
                topicIds: search.topic ? [search.topic] : [],
                sourceSlugs: search.source ? [search.source] : [],
                scope: search.scope,
              },
            },
          })
        }
      >
        {mutation.isPending ? 'Preparing…' : search.mode === 'flashcards' ? 'Start flashcards' : 'Start practice'}
      </Button>
    </div>
  )
}
