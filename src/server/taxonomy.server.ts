import { asc, sql } from 'drizzle-orm'

import { getDb } from '#/db/client.server'
import { modules, questions, sources, subjects, topics } from '#/db/schema'

/** Modules → subjects → topics (with question counts) and the sources list. */
export async function loadTaxonomy() {
  const db = getDb()
  const [mods, srcs, counts] = await Promise.all([
    db.query.modules.findMany({
      orderBy: asc(modules.sortOrder),
      with: {
        subjects: {
          orderBy: asc(subjects.sortOrder),
          with: { topics: { orderBy: asc(topics.sortOrder), columns: { id: true, slug: true, name: true } } },
        },
      },
    }),
    db.select().from(sources).orderBy(asc(sources.sortOrder)),
    db
      .select({ topicId: questions.topicId, n: sql<number>`count(*)::int` })
      .from(questions)
      .groupBy(questions.topicId),
  ])
  const perTopic = new Map(counts.map((c) => [c.topicId, c.n]))
  return {
    modules: mods.map((m) => ({
      id: m.id,
      slug: m.slug,
      code: m.code,
      name: m.name,
      shortName: m.shortName,
      description: m.description,
      accentHue: m.accentHue,
      subjects: m.subjects.map((s) => ({
        id: s.id,
        slug: s.slug,
        name: s.name,
        topics: s.topics.map((t) => ({ ...t, questionCount: perTopic.get(t.id) ?? 0 })),
      })),
    })),
    sources: srcs.map((s) => ({ id: s.id, slug: s.slug, name: s.name, shortName: s.shortName })),
    unsortedCount: perTopic.get(null) ?? 0,
  }
}

export type Taxonomy = Awaited<ReturnType<typeof loadTaxonomy>>
