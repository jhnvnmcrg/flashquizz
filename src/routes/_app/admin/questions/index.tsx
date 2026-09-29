import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { PlusIcon, SearchIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { QuestionsTable, useFilteredRows } from '#/components/admin/questions-table'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { FLAG_LABELS, QUESTION_FLAGS, QUESTION_STATUS, STATUS_LABELS } from '#/lib/schemas/enums'
import { adminQuestionsQuery, invalidateContent, taxonomyQuery } from '#/queries'
import { setQuestionsStatus } from '#/server/admin.functions'

const searchSchema = z.object({
  module: z.string().optional().catch(undefined),
  status: z.enum(QUESTION_STATUS).optional().catch(undefined),
  source: z.string().optional().catch(undefined),
  flag: z.enum(QUESTION_FLAGS).optional().catch(undefined),
  q: z.string().optional().catch(undefined),
})

export const Route = createFileRoute('/_app/admin/questions/')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ module: search.module, status: search.status, source: search.source }),
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(adminQuestionsQuery(deps)),
      context.queryClient.ensureQueryData(taxonomyQuery),
    ]),
  component: QuestionsPage,
})

const ALL = '__all'

function QuestionsPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const qc = useQueryClient()
  const { data: tax } = useSuspenseQuery(taxonomyQuery)
  const { data: rows } = useQuery(
    adminQuestionsQuery({ module: search.module, status: search.status, source: search.source }),
  )
  const [q, setQ] = useState(search.q ?? '')
  useEffect(() => {
    const id = setTimeout(() => {
      if ((search.q ?? '') !== q) navigate({ search: (p) => ({ ...p, q: q || undefined }), replace: true })
    }, 250)
    return () => clearTimeout(id)
  }, [q, search.q, navigate])

  const filtered = useFilteredRows(rows, search.q ?? '', search.flag)
  const set = (patch: Partial<typeof search>) => navigate({ search: (p) => ({ ...p, ...patch }), replace: true })

  const bulk = useServerFn(setQuestionsStatus)
  const mutation = useMutation({
    mutationFn: bulk,
    onSuccess: (res) => {
      toast.success(`Updated ${res.updated} question${res.updated === 1 ? '' : 's'}`)
      invalidateContent(qc)
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search stems, choices, refs"
            aria-label="Search questions"
            className="pl-9"
          />
        </div>
        <FilterSelect
          label="Module"
          value={search.module}
          onChange={(v) => set({ module: v })}
          options={tax.modules.map((m) => ({ value: m.slug, label: `${m.code} ${m.shortName}` }))}
        />
        <FilterSelect
          label="Status"
          value={search.status}
          onChange={(v) => set({ status: v as typeof search.status })}
          options={QUESTION_STATUS.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
        />
        <FilterSelect
          label="Source"
          value={search.source}
          onChange={(v) => set({ source: v })}
          options={tax.sources.map((s) => ({ value: s.slug, label: s.shortName }))}
        />
        <FilterSelect
          label="Flag"
          value={search.flag}
          onChange={(v) => set({ flag: v as typeof search.flag })}
          options={QUESTION_FLAGS.map((f) => ({ value: f, label: FLAG_LABELS[f] }))}
        />
        <Button asChild>
          <Link to="/admin/questions/new">
            <PlusIcon /> New question
          </Link>
        </Button>
      </div>
      <QuestionsTable
        key={`${search.module}-${search.status}-${search.source}-${search.flag}-${search.q}`}
        rows={filtered}
        busy={mutation.isPending}
        onBulkStatus={(ids, status) => mutation.mutate({ data: { ids, status } })}
      />
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string | undefined
  onChange: (v: string | undefined) => void
  options: { value: string; label: string }[]
}) {
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)}>
      <SelectTrigger aria-label={label} className="w-auto min-w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Any {label.toLowerCase()}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
