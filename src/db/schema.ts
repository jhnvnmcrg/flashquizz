// Relative imports only: drizzle-kit and tsx do not resolve the `#/` alias.
import { relations, sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import {
  IMAGE_ROLE,
  QUESTION_FORMAT,
  QUESTION_STATUS,
  SESSION_MODE,
  SESSION_STATUS,
  STUDY_ORDER,
} from '../lib/schemas/enums.ts'
import type { Choice, Statement } from '../lib/schemas/question.ts'
import type { StudyFilters } from '../lib/schemas/study.ts'

export const questionStatus = pgEnum('question_status', QUESTION_STATUS)
export const questionFormat = pgEnum('question_format', QUESTION_FORMAT)
export const imageRole = pgEnum('image_role', IMAGE_ROLE)
export const sessionMode = pgEnum('session_mode', SESSION_MODE)
export const sessionStatus = pgEnum('session_status', SESSION_STATUS)
export const studyOrder = pgEnum('study_order', STUDY_ORDER)

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}

export const modules = pgTable('modules', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  slug: text().notNull().unique(),
  code: text().notNull(),
  name: text().notNull(),
  shortName: text().notNull(),
  description: text().notNull().default(''),
  accentHue: smallint().notNull().default(195),
  sortOrder: integer().notNull().default(0),
  ...timestamps,
})

export const subjects = pgTable(
  'subjects',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    moduleId: integer()
      .notNull()
      .references(() => modules.id, { onDelete: 'restrict' }),
    slug: text().notNull().unique(),
    name: text().notNull(),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [index().on(t.moduleId, t.sortOrder)],
)

export const topics = pgTable(
  'topics',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    subjectId: integer()
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
    slug: text().notNull().unique(),
    name: text().notNull(),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [index().on(t.subjectId, t.sortOrder)],
)

export const sources = pgTable('sources', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  shortName: text().notNull(),
  sortOrder: integer().notNull().default(0),
  ...timestamps,
})

export const questionGroups = pgTable('question_groups', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  key: text().notNull().unique(),
  sourceId: integer()
    .notNull()
    .references(() => sources.id, { onDelete: 'restrict' }),
  moduleId: integer()
    .notNull()
    .references(() => modules.id, { onDelete: 'restrict' }),
  context: text().notNull().default(''),
  ...timestamps,
})

export type RawQuestionText = {
  text?: string | null
  answer?: string | null
  rationale?: string | null
}

export const questions = pgTable(
  'questions',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    sourceRef: text().notNull().unique(),
    sourceId: integer()
      .notNull()
      .references(() => sources.id, { onDelete: 'restrict' }),
    moduleId: integer()
      .notNull()
      .references(() => modules.id, { onDelete: 'restrict' }),
    topicId: integer().references(() => topics.id, { onDelete: 'set null' }),
    groupId: integer().references(() => questionGroups.id, {
      onDelete: 'set null',
    }),
    groupOrder: integer(),
    ordinal: integer().notNull().default(0),
    printedNumber: text(),
    sourcePage: integer(),
    format: questionFormat().notNull().default('single'),
    stem: text().notNull(),
    statements: jsonb().$type<Statement[]>().notNull().default([]),
    choices: jsonb().$type<Choice[]>().notNull(),
    answerKey: text(),
    rationale: text().notNull().default(''),
    mnemonic: text().notNull().default(''),
    status: questionStatus().notNull().default('auto'),
    flags: text().array().notNull().default(sql`'{}'::text[]`),
    requiresImage: boolean().notNull().default(false),
    duplicateOfRef: text(),
    reviewNote: text().notNull().default(''),
    raw: jsonb().$type<RawQuestionText>(),
    editedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check(
      'questions_answer_key_check',
      sql`${t.answerKey} IS NULL OR ${t.answerKey} IN ('A','B','C','D','E')`,
    ),
    index().on(t.moduleId, t.status),
    index().on(t.topicId),
    index().on(t.sourceId, t.ordinal),
    index().on(t.groupId),
  ],
)

export const questionImages = pgTable(
  'question_images',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    questionId: integer().references(() => questions.id, {
      onDelete: 'cascade',
    }),
    groupId: integer().references(() => questionGroups.id, {
      onDelete: 'cascade',
    }),
    role: imageRole().notNull(),
    choiceKey: text(),
    alt: text().notNull().default(''),
    mime: text().notNull(),
    width: integer(),
    height: integer(),
    byteSize: integer().notNull(),
    sha256: text().notNull(),
    /** Base64-encoded image bytes. Never select this in list queries. */
    data: text().notNull(),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    check(
      'question_images_owner_check',
      sql`num_nonnulls(${t.questionId}, ${t.groupId}) = 1`,
    ),
    uniqueIndex().on(t.questionId, t.sha256),
    index().on(t.groupId),
  ],
)

export const questionProgress = pgTable(
  'question_progress',
  {
    questionId: integer()
      .primaryKey()
      .references(() => questions.id, { onDelete: 'cascade' }),
    box: smallint().notNull().default(0),
    dueAt: timestamp({ withTimezone: true }),
    seenCount: integer().notNull().default(0),
    correctCount: integer().notNull().default(0),
    wrongCount: integer().notNull().default(0),
    streak: integer().notNull().default(0),
    lastCorrect: boolean(),
    lastAnsweredAt: timestamp({ withTimezone: true }),
    bookmarked: boolean().notNull().default(false),
    bookmarkedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('question_progress_due_idx').on(t.dueAt).where(sql`${t.box} > 0`),
    index('question_progress_bookmarked_idx')
      .on(t.bookmarkedAt)
      .where(sql`${t.bookmarked}`),
    // Sync cursor (devices pull progress changed since their last pull).
    index().on(t.updatedAt, t.questionId),
  ],
)

export const studySessions = pgTable(
  'study_sessions',
  {
    id: uuid().primaryKey().defaultRandom(),
    mode: sessionMode().notNull(),
    status: sessionStatus().notNull().default('active'),
    filters: jsonb().$type<StudyFilters>().notNull(),
    orderMode: studyOrder().notNull().default('smart'),
    questionCount: integer().notNull(),
    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    durationSec: integer(),
    expiresAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),
    autoSubmitted: boolean().notNull().default(false),
    answeredCount: integer().notNull().default(0),
    correctCount: integer().notNull().default(0),
    lastPosition: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    check(
      'study_sessions_exam_timer_check',
      sql`${t.mode} <> 'exam' OR (${t.durationSec} IS NOT NULL AND ${t.expiresAt} IS NOT NULL)`,
    ),
    index().on(t.status, t.mode, t.startedAt.desc()),
    index().on(t.updatedAt, t.id),
  ],
)

export const studySessionItems = pgTable(
  'study_session_items',
  {
    sessionId: uuid()
      .notNull()
      .references(() => studySessions.id, { onDelete: 'cascade' }),
    position: integer().notNull(),
    questionId: integer()
      .notNull()
      .references(() => questions.id, { onDelete: 'restrict' }),
    selectedKey: text(),
    isCorrect: boolean(),
    answeredAt: timestamp({ withTimezone: true }),
    responseMs: integer(),
    flagged: boolean().notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.position] }),
    uniqueIndex().on(t.sessionId, t.questionId),
    index().on(t.questionId),
  ],
)

export const attempts = pgTable(
  'attempts',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    questionId: integer()
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    sessionId: uuid().references(() => studySessions.id, {
      onDelete: 'set null',
    }),
    mode: sessionMode().notNull(),
    selectedKey: text(),
    isCorrect: boolean().notNull(),
    responseMs: integer(),
    answeredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Set by the device that recorded it offline; makes re-uploads harmless. */
    clientId: uuid().unique(),
    /** When the server stored it (database clock) — the sync cursor. `answeredAt` is the device's clock. */
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.questionId, t.answeredAt.desc()),
    index().on(t.answeredAt),
    index().on(t.createdAt, t.id),
  ],
)

/**
 * Every bookmark toggle, so progress can be rebuilt from history on any
 * device (bookmarking a card outside the deck puts it in box 1).
 */
export const bookmarkEvents = pgTable(
  'bookmark_events',
  {
    clientId: uuid().primaryKey().defaultRandom(),
    questionId: integer()
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    bookmarked: boolean().notNull(),
    at: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.questionId, t.at)],
)

// ── Relations (for db.query) ────────────────────────────────────────────────

export const modulesRelations = relations(modules, ({ many }) => ({
  subjects: many(subjects),
  questions: many(questions),
}))

export const subjectsRelations = relations(subjects, ({ one, many }) => ({
  module: one(modules, { fields: [subjects.moduleId], references: [modules.id] }),
  topics: many(topics),
}))

export const topicsRelations = relations(topics, ({ one, many }) => ({
  subject: one(subjects, { fields: [topics.subjectId], references: [subjects.id] }),
  questions: many(questions),
}))

export const sourcesRelations = relations(sources, ({ many }) => ({
  questions: many(questions),
}))

export const questionGroupsRelations = relations(questionGroups, ({ one, many }) => ({
  source: one(sources, { fields: [questionGroups.sourceId], references: [sources.id] }),
  module: one(modules, { fields: [questionGroups.moduleId], references: [modules.id] }),
  questions: many(questions),
  images: many(questionImages),
}))

export const questionsRelations = relations(questions, ({ one, many }) => ({
  source: one(sources, { fields: [questions.sourceId], references: [sources.id] }),
  module: one(modules, { fields: [questions.moduleId], references: [modules.id] }),
  topic: one(topics, { fields: [questions.topicId], references: [topics.id] }),
  group: one(questionGroups, {
    fields: [questions.groupId],
    references: [questionGroups.id],
  }),
  images: many(questionImages),
  progress: one(questionProgress, {
    fields: [questions.id],
    references: [questionProgress.questionId],
  }),
  attempts: many(attempts),
}))

export const questionImagesRelations = relations(questionImages, ({ one }) => ({
  question: one(questions, {
    fields: [questionImages.questionId],
    references: [questions.id],
  }),
  group: one(questionGroups, {
    fields: [questionImages.groupId],
    references: [questionGroups.id],
  }),
}))

export const questionProgressRelations = relations(questionProgress, ({ one }) => ({
  question: one(questions, {
    fields: [questionProgress.questionId],
    references: [questions.id],
  }),
}))

export const studySessionsRelations = relations(studySessions, ({ many }) => ({
  items: many(studySessionItems),
}))

export const studySessionItemsRelations = relations(studySessionItems, ({ one }) => ({
  session: one(studySessions, {
    fields: [studySessionItems.sessionId],
    references: [studySessions.id],
  }),
  question: one(questions, {
    fields: [studySessionItems.questionId],
    references: [questions.id],
  }),
}))

export const bookmarkEventsRelations = relations(bookmarkEvents, ({ one }) => ({
  question: one(questions, { fields: [bookmarkEvents.questionId], references: [questions.id] }),
}))

export const attemptsRelations = relations(attempts, ({ one }) => ({
  question: one(questions, { fields: [attempts.questionId], references: [questions.id] }),
  session: one(studySessions, {
    fields: [attempts.sessionId],
    references: [studySessions.id],
  }),
}))
