import { notFound } from '@tanstack/react-router'

import { topicTallies } from '#/lib/study/stats'
import { emptyTally } from '#/lib/tally'

import { ensureLocal } from './common'

/** Modules → subjects → topics and sources, from the device copy. */
export async function getTaxonomy() {
  const s = await ensureLocal()
  if (!s.taxonomy) throw new Error('The question bank isn’t on this device yet. Connect to download it.')
  const { modules, sources, unsortedCount } = s.taxonomy
  return { modules, sources, unsortedCount }
}

/** One module's subjects and topics with study tallies. */
export async function getModuleOverview({ data }: { data: { slug: string } }) {
  const s = await ensureLocal()
  const mod = s.taxonomy?.modules.find((m) => m.slug === data.slug)
  if (!mod || !s.taxonomy) throw notFound()
  const tallies = topicTallies(s.index.values(), s.progress, new Date())
  return {
    module: {
      id: mod.id,
      slug: mod.slug,
      code: mod.code,
      name: mod.name,
      shortName: mod.shortName,
      description: mod.description,
      accentHue: mod.accentHue,
    },
    tally: tallies.byModule.get(mod.id) ?? emptyTally(),
    subjects: mod.subjects.map((sub) => ({
      id: sub.id,
      name: sub.name,
      topics: sub.topics.map((t) => ({ id: t.id, name: t.name, tally: tallies.byTopic.get(t.id) ?? emptyTally() })),
    })),
    sources: s.taxonomy.moduleSources[mod.id] ?? [],
  }
}
