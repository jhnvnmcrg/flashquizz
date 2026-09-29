import { compareItems, rankItem, rankings } from '@tanstack/match-sorter-utils'
import {
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { Link } from '@tanstack/react-router'
import { ArrowDownIcon, ArrowUpIcon, ImageIcon } from 'lucide-react'
import { useMemo } from 'react'

import { ModuleTag } from '#/components/question/module-tag'
import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import { FLAG_LABELS, type QuestionFlag, type QuestionStatus } from '#/lib/schemas/enums'
import { cn } from '#/lib/utils'
import type { listAdminQuestions } from '#/server/admin.functions'

import { StatusBadge } from './status-badge'

export type AdminRow = Awaited<ReturnType<typeof listAdminQuestions>>[number]

const features = tableFeatures({
  rowSortingFeature,
  rowSelectionFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
})

const helper = createColumnHelper<typeof features, AdminRow>()

const plain = (md: string) => md.replace(/[*_`#>|~]/g, '').replace(/\s+/g, ' ').trim()

const columns = helper.columns([
  helper.display({
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all on this page"
        checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? 'indeterminate' : false}
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label="Select question"
        checked={row.getIsSelected()}
        onCheckedChange={(v) => row.toggleSelected(!!v)}
      />
    ),
  }),
  helper.accessor('sourceRef', {
    header: 'Ref',
    sortFn: 'alphanumeric',
    cell: (info) => <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{info.getValue()}</span>,
  }),
  helper.accessor('moduleCode', {
    header: 'Module',
    cell: ({ row }) => <ModuleTag code={row.original.moduleCode} hue={row.original.accentHue} />,
  }),
  helper.accessor('stem', {
    header: 'Question',
    enableSorting: false,
    cell: ({ row }) => (
      <Link
        to="/admin/questions/$questionId"
        params={{ questionId: String(row.original.id) }}
        className="line-clamp-2 max-w-xl text-sm font-medium hover:underline"
      >
        {plain(row.original.stem)}
      </Link>
    ),
  }),
  helper.accessor('topic', {
    header: 'Topic',
    sortFn: 'alphanumeric',
    cell: (info) => <span className="text-sm text-muted-foreground">{info.getValue() ?? 'Unsorted'}</span>,
  }),
  helper.accessor('answerKey', {
    header: 'Key',
    cell: (info) => <span className="font-bold">{info.getValue() ?? '—'}</span>,
  }),
  helper.accessor('status', {
    header: 'Status',
    cell: ({ row }) => (
      <div className="flex items-center gap-1.5">
        <StatusBadge status={row.original.status} />
        {row.original.requiresImage || row.original.imageCount ? (
          <ImageIcon
            className={cn('size-3.5', row.original.requiresImage && !row.original.imageCount ? 'text-destructive' : 'text-muted-foreground')}
            aria-label={row.original.imageCount ? `${row.original.imageCount} image(s)` : 'Needs an image'}
          />
        ) : null}
      </div>
    ),
  }),
  helper.accessor('source', { header: 'Source', cell: (info) => <span className="text-xs whitespace-nowrap">{info.getValue()}</span> }),
])

const EMPTY: AdminRow[] = []

export function useFilteredRows(rows: AdminRow[] | undefined, q: string, flag?: QuestionFlag) {
  return useMemo(() => {
    let list = rows ?? EMPTY
    if (flag) list = list.filter((r) => r.flags.includes(flag))
    const query = q.trim()
    if (!query) return list
    return list
      .map((r) => ({
        r,
        info: rankItem(r, query, {
          threshold: rankings.CONTAINS,
          accessors: [(x) => x.stem, (x) => x.choicesText ?? '', (x) => x.sourceRef, (x) => x.topic ?? ''],
        }),
      }))
      .filter((x) => x.info.passed)
      .sort((a, b) => compareItems(a.info, b.info))
      .map((x) => x.r)
  }, [rows, q, flag])
}

export function QuestionsTable({
  rows,
  onBulkStatus,
  busy,
}: {
  rows: AdminRow[]
  onBulkStatus: (ids: number[], status: QuestionStatus) => void
  busy?: boolean
}) {
  const table = useTable(
    {
      features,
      columns,
      data: rows,
      getRowId: (row) => String(row.id),
      initialState: { pagination: { pageIndex: 0, pageSize: 50 } },
    },
    (state) => ({ sorting: state.sorting, rowSelection: state.rowSelection, pagination: state.pagination }),
  )
  const selected = Object.keys(table.state.rowSelection).map(Number)
  const { pageIndex, pageSize } = table.state.pagination

  return (
    <div className="space-y-3">
      {selected.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-secondary px-3 py-2 text-sm">
          <span className="font-semibold">{selected.length} selected</span>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onBulkStatus(selected, 'verified')}>
            Mark verified
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onBulkStatus(selected, 'needs_review')}>
            Needs review
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onBulkStatus(selected, 'archived')}>
            Archive
          </Button>
          <Button size="sm" variant="ghost" onClick={() => table.resetRowSelection()}>
            Clear
          </Button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-left">
          <thead className="border-b bg-secondary/60">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted()
                  return (
                    <th key={header.id} className="px-3 py-2 text-xs font-semibold text-muted-foreground">
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 hover:text-foreground"
                        >
                          <table.FlexRender header={header} />
                          {sorted === 'asc' ? <ArrowUpIcon className="size-3" /> : sorted === 'desc' ? <ArrowDownIcon className="size-3" /> : null}
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className={cn('align-top hover:bg-accent/40', row.getIsSelected() && 'bg-info-soft/60')}>
                {row.getAllCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2.5">
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <p className="p-8 text-center text-muted-foreground">No questions match.</p> : null}
      </div>

      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span className="tabular-nums">
          {rows.length ? `${pageIndex * pageSize + 1}–${Math.min(rows.length, (pageIndex + 1) * pageSize)} of ${rows.length}` : '0 questions'}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
            Previous
          </Button>
          <Button size="sm" variant="outline" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}

export { FLAG_LABELS }
