import { type QueryClient, queryOptions } from '@tanstack/react-query'

import type { QuestionFlag, QuestionStatus } from '#/lib/schemas/enums'
import { getAdminQuestion, getReviewQueue, listAdminQuestions } from '#/server/admin.functions'
import { getDashboard, getReviewHub } from '#/server/dashboard.functions'
import { getExam, getExamResult, listExams } from '#/server/exam.functions'
import { getSession, getSessionSummary, getWarmup } from '#/server/study.functions'
import { getModuleOverview, getTaxonomy } from '#/server/taxonomy.functions'
import { getViewer } from '#/server/viewer.functions'

export const viewerQuery = queryOptions({
  queryKey: ['viewer'],
  queryFn: () => getViewer(),
  staleTime: 60_000,
  retry: false,
})

export const dashboardQuery = queryOptions({
  queryKey: ['dashboard'],
  queryFn: () => getDashboard(),
})

export const warmupQuery = (skip: number[]) =>
  queryOptions({
    queryKey: ['warmup', skip],
    queryFn: () => getWarmup({ data: { skip } }),
    staleTime: Number.POSITIVE_INFINITY,
  })

export const taxonomyQuery = queryOptions({
  queryKey: ['taxonomy'],
  queryFn: () => getTaxonomy(),
  staleTime: 5 * 60_000,
})

export const moduleQuery = (slug: string) =>
  queryOptions({
    queryKey: ['module', slug],
    queryFn: () => getModuleOverview({ data: { slug } }),
  })

export const reviewHubQuery = queryOptions({
  queryKey: ['review'],
  queryFn: () => getReviewHub(),
})

export const sessionQuery = (id: string) =>
  queryOptions({
    queryKey: ['session', id],
    queryFn: () => getSession({ data: { id } }),
    staleTime: Number.POSITIVE_INFINITY,
  })

export const sessionSummaryQuery = (id: string) =>
  queryOptions({
    queryKey: ['session', id, 'summary'],
    queryFn: () => getSessionSummary({ data: { id } }),
  })

export const examsQuery = queryOptions({
  queryKey: ['exams'],
  queryFn: () => listExams(),
})

export const examQuery = (id: string) =>
  queryOptions({
    queryKey: ['exams', id],
    queryFn: () => getExam({ data: { id } }),
    staleTime: Number.POSITIVE_INFINITY,
  })

export const examResultQuery = (id: string) =>
  queryOptions({
    queryKey: ['exams', id, 'result'],
    queryFn: () => getExamResult({ data: { id } }),
    staleTime: Number.POSITIVE_INFINITY,
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

/** After admin edits: refresh content everywhere. */
export function invalidateContent(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['admin'] }),
    qc.invalidateQueries({ queryKey: ['taxonomy'] }),
    invalidateProgress(qc),
  ])
}
