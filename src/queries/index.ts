import { type QueryClient, queryOptions } from '@tanstack/react-query'

import type { QuestionFlag, QuestionStatus } from '#/lib/schemas/enums'
import * as local from '#/offline/api'
import { requestSync } from '#/offline/sync/engine'
import { getAdminQuestion, getReviewQueue, listAdminQuestions } from '#/server/admin.functions'
import { getTaxonomy } from '#/server/taxonomy.functions'
import { getViewer } from '#/server/viewer.functions'

export const viewerQuery = queryOptions({
  queryKey: ['viewer'],
  queryFn: () => getViewer(),
  staleTime: 60_000,
  retry: false,
})

// ── Study screens: read from the device copy (src/offline), work offline ──
// They change only when this device writes or a sync lands; both invalidate.
const fromDevice = { staleTime: Number.POSITIVE_INFINITY, retry: false } as const

export const dashboardQuery = queryOptions({
  queryKey: ['dashboard'],
  queryFn: () => local.getDashboard(),
  ...fromDevice,
})

export const warmupQuery = (skip: number[]) =>
  queryOptions({
    queryKey: ['warmup', skip],
    queryFn: () => local.getWarmup({ data: { skip } }),
    ...fromDevice,
  })

export const taxonomyQuery = queryOptions({
  queryKey: ['taxonomy'],
  queryFn: () => local.getTaxonomy(),
  ...fromDevice,
})

export const moduleQuery = (slug: string) =>
  queryOptions({
    queryKey: ['module', slug],
    queryFn: () => local.getModuleOverview({ data: { slug } }),
    ...fromDevice,
  })

export const reviewHubQuery = queryOptions({
  queryKey: ['review'],
  queryFn: () => local.getReviewHub(),
  ...fromDevice,
})

export const sessionQuery = (id: string) =>
  queryOptions({
    queryKey: ['session', id],
    queryFn: () => local.getSession({ data: { id } }),
    ...fromDevice,
  })

export const sessionSummaryQuery = (id: string) =>
  queryOptions({
    queryKey: ['session', id, 'summary'],
    queryFn: () => local.getSessionSummary({ data: { id } }),
    ...fromDevice,
  })

export const examsQuery = queryOptions({
  queryKey: ['exams'],
  queryFn: () => local.listExams(),
  ...fromDevice,
})

export const examQuery = (id: string) =>
  queryOptions({
    queryKey: ['exams', id],
    queryFn: () => local.getExam({ data: { id } }),
    ...fromDevice,
  })

export const examResultQuery = (id: string) =>
  queryOptions({
    queryKey: ['exams', id, 'result'],
    queryFn: () => local.getExamResult({ data: { id } }),
    ...fromDevice,
  })

// ── Question bank (admin): online only, straight from the server ──

/** The editable taxonomy, fresh from the server (study screens use the device copy). */
export const adminTaxonomyQuery = queryOptions({
  queryKey: ['admin', 'taxonomy'],
  queryFn: () => getTaxonomy(),
  staleTime: 5 * 60_000,
})

export type AdminListFilters = { module?: string; status?: QuestionStatus; source?: string }

export const adminQuestionsQuery = (filters: AdminListFilters) =>
  queryOptions({
    queryKey: ['admin', 'questions', filters],
    queryFn: () => listAdminQuestions({ data: filters }),
  })

export const adminQuestionQuery = (id: number) =>
  queryOptions({
    queryKey: ['admin', 'question', id],
    queryFn: () => getAdminQuestion({ data: { id } }),
  })

export const reviewQueueQuery = (flag?: QuestionFlag) =>
  queryOptions({
    queryKey: ['admin', 'review-queue', flag ?? null],
    queryFn: () => getReviewQueue({ data: { flag } }),
  })

/** After any answer/bookmark: refresh the aggregate screens. */
export function invalidateProgress(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['dashboard'] }),
    qc.invalidateQueries({ queryKey: ['module'] }),
    qc.invalidateQueries({ queryKey: ['review'] }),
  ])
}

/** After admin edits: refresh the question bank, and bring the device copy up to date. */
export function invalidateContent(qc: QueryClient) {
  void requestSync({ force: true })
  return qc.invalidateQueries({ queryKey: ['admin'] })
}
