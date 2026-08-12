import { describe, expect, it } from 'vitest'

import type { NamedTarget } from '../../domain/index.js'
import type { TargetCandidate } from '../../ports/index.js'
import { FuzzyTargetResolver } from './target-resolver.js'

const CANDIDATES: readonly TargetCandidate[] = [
  { id: 'goal_1', name: 'Deen', kind: 'goal', aliases: ['Islamic Studies'] },
  { id: 'goal_2', name: 'Fitness', kind: 'goal' },
  { id: 'goal_3', name: 'Reading', kind: 'goal' },
  { id: 'task_1', name: 'Invoices', kind: 'task' },
  { id: 'cat_1', name: 'Deep Work', kind: 'category' },
]

function spoken(name: string, kind: NamedTarget['kind'] = 'unspecified'): NamedTarget {
  return { kind, name }
}

function resolver(options = {}): FuzzyTargetResolver {
  return new FuzzyTargetResolver(CANDIDATES, options)
}

describe('FuzzyTargetResolver', () => {
  it('matches a name said exactly', async () => {
    await expect(resolver().resolve(spoken('deen'))).resolves.toMatchObject({
      id: 'goal_1',
      name: 'Deen',
      kind: 'goal',
      score: 1,
      matchedOn: 'Deen',
    })
  })

  it('matches a name a recognizer misheard', async () => {
    await expect(resolver().resolve(spoken('dean'))).resolves.toMatchObject({ id: 'goal_1' })
    await expect(resolver().resolve(spoken('reeding'))).resolves.toMatchObject({ id: 'goal_3' })
  })

  it('matches through the word saying what kind of thing it is', async () => {
    await expect(resolver().resolve(spoken('dean goal'))).resolves.toMatchObject({ id: 'goal_1' })
    await expect(resolver().resolve(spoken('the invoices task'))).resolves.toMatchObject({
      id: 'task_1',
    })
  })

  it('matches an alias and reports which string matched', async () => {
    await expect(resolver().resolve(spoken('islamic studies'))).resolves.toMatchObject({
      id: 'goal_1',
      name: 'Deen',
      matchedOn: 'Islamic Studies',
    })
  })

  it('returns nothing when no candidate is close enough', async () => {
    await expect(resolver().resolve(spoken('something else entirely'))).resolves.toBeNull()
  })

  it('returns nothing when there are no candidates at all', async () => {
    await expect(new FuzzyTargetResolver([]).resolve(spoken('deen'))).resolves.toBeNull()
  })

  it('returns nothing for a name that folds away to nothing', async () => {
    await expect(resolver().resolve(spoken('   '))).resolves.toBeNull()
  })

  describe('kind', () => {
    it('only considers candidates of the kind that was spoken', async () => {
      await expect(resolver().resolve(spoken('deen', 'task'))).resolves.toBeNull()
      await expect(resolver().resolve(spoken('deen', 'goal'))).resolves.toMatchObject({
        id: 'goal_1',
      })
    })

    it('considers every kind when the speaker did not say one', async () => {
      await expect(resolver().resolve(spoken('deep work'))).resolves.toMatchObject({ id: 'cat_1' })
      await expect(resolver().resolve(spoken('invoices'))).resolves.toMatchObject({ id: 'task_1' })
    })
  })

  describe('ambiguity', () => {
    const twins: readonly TargetCandidate[] = [
      { id: 'a', name: 'Dean', kind: 'goal' },
      { id: 'b', name: 'Dan', kind: 'goal' },
    ]

    it('refuses to pick between two candidates it cannot tell apart', async () => {
      await expect(new FuzzyTargetResolver(twins).resolve(spoken('deen'))).resolves.toBeNull()
    })

    it('still ranks both, so the host can ask which one', async () => {
      const ranked = await new FuzzyTargetResolver(twins).rank(spoken('deen'))
      expect(ranked).toHaveLength(2)
    })

    it('picks a clear winner over a distant runner-up', async () => {
      const clear = new FuzzyTargetResolver([
        { id: 'a', name: 'Deen', kind: 'goal' },
        { id: 'b', name: 'Dan', kind: 'goal' },
      ])
      await expect(clear.resolve(spoken('deen'))).resolves.toMatchObject({ id: 'a' })
    })

    it('takes the margin from the options', async () => {
      const relaxed = new FuzzyTargetResolver(twins, { ambiguityMargin: 0 })
      await expect(relaxed.resolve(spoken('deen'))).resolves.not.toBeNull()
    })
  })

  describe('rank', () => {
    it('returns matches best first', async () => {
      const ranked = await resolver({ minScore: 0.2 }).rank(spoken('deen'))
      const scores = ranked.map((match) => match.score)
      expect(scores).toEqual([...scores].sort((a, b) => b - a))
    })

    it('leaves out anything below the threshold', async () => {
      const ranked = await resolver().rank(spoken('deen'))
      expect(ranked.map((match) => match.id)).toEqual(['goal_1'])
    })

    it('takes the threshold from the options', async () => {
      const ranked = await resolver({ minScore: 0.99 }).rank(spoken('dean'))
      expect(ranked).toEqual([])
    })

    it('orders equally good matches the same way every time', async () => {
      const identical: readonly TargetCandidate[] = [
        { id: 'z', name: 'Deen', kind: 'goal' },
        { id: 'a', name: 'Deen', kind: 'goal' },
        { id: 'm', name: 'Deen', kind: 'goal' },
      ]
      const ranked = await new FuzzyTargetResolver(identical).rank(spoken('deen'))
      expect(ranked.map((match) => match.id)).toEqual(['a', 'm', 'z'])
    })

    it('does not depend on the order the candidates arrived in', async () => {
      const forward = await new FuzzyTargetResolver(CANDIDATES).rank(spoken('deen', 'goal'))
      const backward = await new FuzzyTargetResolver([...CANDIDATES].reverse()).rank(
        spoken('deen', 'goal'),
      )
      expect(forward).toEqual(backward)
    })
  })

  describe('candidate sources', () => {
    it('accepts a function returning candidates', async () => {
      const dynamic = new FuzzyTargetResolver(() => CANDIDATES)
      await expect(dynamic.resolve(spoken('deen'))).resolves.toMatchObject({ id: 'goal_1' })
    })

    it('accepts a function returning a promise of candidates', async () => {
      const dynamic = new FuzzyTargetResolver(async () => CANDIDATES)
      await expect(dynamic.resolve(spoken('deen'))).resolves.toMatchObject({ id: 'goal_1' })
    })

    it('asks the function again on every call, so a changing list is seen', async () => {
      let available: readonly TargetCandidate[] = []
      const dynamic = new FuzzyTargetResolver(() => available)

      await expect(dynamic.resolve(spoken('deen'))).resolves.toBeNull()
      available = CANDIDATES
      await expect(dynamic.resolve(spoken('deen'))).resolves.toMatchObject({ id: 'goal_1' })
    })
  })

  it('takes the host word for what a kind is called', async () => {
    const custom = new FuzzyTargetResolver(CANDIDATES, { kindWords: { client: 'category' } })
    await expect(custom.resolve(spoken('deen client'))).resolves.toMatchObject({ id: 'goal_1' })
  })
})
