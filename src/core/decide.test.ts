import { describe, expect, it } from 'vitest'

import { FuzzyTargetResolver } from '../adapters/fuzzy/index.js'
import { RuleBasedIntentParser } from '../adapters/rule-based/index.js'
import type { NamedTarget, ResolvedTarget } from '../domain/index.js'
import type { TargetCandidate, TargetResolver } from '../ports/index.js'
import { TargetResolutionFailedError } from './errors.js'
import { VoiceCommandService } from './voice-command-service.js'

const CANDIDATES: readonly TargetCandidate[] = [
  { id: 'goal_1', name: 'Deen', kind: 'goal' },
  { id: 'goal_2', name: 'Deep Work', kind: 'goal' },
  { id: 'goal_3', name: 'Fitness', kind: 'goal' },
]

function service(candidates: readonly TargetCandidate[] = CANDIDATES): VoiceCommandService {
  return new VoiceCommandService({
    parser: new RuleBasedIntentParser(),
    resolver: new FuzzyTargetResolver(candidates),
  })
}

describe('decideText', () => {
  it('runs a clear command against a clear match', async () => {
    const decision = await service().decideText('start tracking time for my deen goal')

    expect(decision).toMatchObject({
      kind: 'confident',
      intent: { type: 'START_TRACKING' },
      target: { id: 'goal_1' },
    })
  })

  it('runs a command that names nothing', async () => {
    const decision = await service().decideText('stop tracking')

    expect(decision).toMatchObject({ kind: 'confident', target: null, reason: null })
  })

  it('asks about a phrase that is ordinary speech as often as a command', async () => {
    const decision = await service().decideText('done')

    expect(decision).toMatchObject({
      kind: 'needs-confirmation',
      reason: 'low-intent-confidence',
      intent: { type: 'STOP_TRACKING' },
    })
  })

  it('asks about a name it only half matched, and says which one it means', async () => {
    const decision = await service().decideText('start tracking my deen study goal')

    expect(decision).toMatchObject({ kind: 'needs-confirmation', reason: 'low-target-score' })
    expect(decision.target?.id).toBe('goal_1')
  })

  it('refuses to choose between two names that sound the same', async () => {
    const twins = [
      { id: 'a', name: 'Dean', kind: 'goal' as const },
      { id: 'b', name: 'Dan', kind: 'goal' as const },
    ]
    const decision = await service(twins).decideText('start tracking deen')

    expect(decision).toMatchObject({ kind: 'needs-confirmation', reason: 'ambiguous-target' })
    expect(decision.options.map((option) => option.id).sort()).toEqual(['a', 'b'])
  })

  it('reports a name that matched nothing', async () => {
    const decision = await service().decideText('start tracking my gardening goal')

    expect(decision).toMatchObject({ kind: 'unresolved', reason: 'no-matching-target' })
  })

  it('reports an utterance it did not understand', async () => {
    const decision = await service().decideText('what did i do yesterday')

    expect(decision).toMatchObject({ kind: 'unresolved', reason: 'unrecognized-command' })
  })

  it('carries the runner-up candidates a prompt would offer', async () => {
    const decision = await service().decideText('start tracking my deep goal')

    expect(decision.options.map((option) => option.id)).toEqual(['goal_1', 'goal_2'])
  })

  it('takes its thresholds from the policy the service was built with', async () => {
    const strict = new VoiceCommandService({
      parser: new RuleBasedIntentParser(),
      resolver: new FuzzyTargetResolver(CANDIDATES),
      policy: { autoIntentConfidence: 0.99 },
    })

    await expect(strict.decideText('stop tracking')).resolves.toMatchObject({
      kind: 'needs-confirmation',
    })
  })

  it('works without a resolver, treating every name as unmatched', async () => {
    const bare = new VoiceCommandService({ parser: new RuleBasedIntentParser() })

    await expect(bare.decideText('start tracking deen')).resolves.toMatchObject({
      kind: 'unresolved',
      reason: 'no-matching-target',
    })
    await expect(bare.decideText('stop tracking')).resolves.toMatchObject({ kind: 'confident' })
  })
})

describe('a resolver that can only answer yes or no', () => {
  class YesOrNoResolver implements TargetResolver {
    async resolve(target: NamedTarget): Promise<ResolvedTarget | null> {
      if (target.name !== 'deen') return null
      return { id: 'goal_1', name: 'Deen', kind: 'goal', score: 1, matchedOn: 'Deen' }
    }
  }

  function bare(): VoiceCommandService {
    return new VoiceCommandService({
      parser: new RuleBasedIntentParser(),
      resolver: new YesOrNoResolver(),
    })
  }

  it('has its one answer read as a list of one', async () => {
    const decision = await bare().decideText('start tracking deen')

    expect(decision).toMatchObject({ kind: 'confident', target: { id: 'goal_1' } })
    expect(decision.options).toHaveLength(1)
  })

  it('has no match read as no candidates', async () => {
    const decision = await bare().decideText('start tracking fitness')

    expect(decision).toMatchObject({ kind: 'unresolved', reason: 'no-matching-target' })
  })
})

describe('ranking failures', () => {
  it('are wrapped, since a broken lookup is not an empty one', async () => {
    const broken: TargetResolver = {
      async resolve() {
        return null
      },
      async rank() {
        throw new Error('index unavailable')
      },
    }

    const failing = new VoiceCommandService({
      parser: new RuleBasedIntentParser(),
      resolver: broken,
    })

    await expect(failing.decideText('start tracking deen')).rejects.toBeInstanceOf(
      TargetResolutionFailedError,
    )
  })
})
