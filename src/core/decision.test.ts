import { describe, expect, it } from 'vitest'

import {
  namedTarget,
  NO_TARGET,
  unknownIntent,
  type IntentTarget,
  type ResolvedTarget,
  type VoiceIntent,
} from '../domain/index.js'
import { classifyCommand, DEFAULT_CONFIDENCE_POLICY } from './decision.js'

function startTracking(target: IntentTarget = NO_TARGET, confidence = 0.9): VoiceIntent {
  return { type: 'START_TRACKING', target, transcript: 'start tracking', confidence }
}

function match(id: string, score: number, name = id): ResolvedTarget {
  return { id, name, kind: 'goal', score, matchedOn: name }
}

const DEEN = namedTarget('goal', 'deen')

describe('classifyCommand', () => {
  describe('with nothing named', () => {
    it('is confident about a clear command', () => {
      const decision = classifyCommand({ intent: startTracking(), options: [] })

      expect(decision).toMatchObject({ kind: 'confident', target: null, reason: null })
    })

    it('asks about a command it half heard', () => {
      const decision = classifyCommand({ intent: startTracking(NO_TARGET, 0.7), options: [] })

      expect(decision).toMatchObject({
        kind: 'needs-confirmation',
        reason: 'low-intent-confidence',
      })
    })

    it('gives up on a command it barely heard', () => {
      const decision = classifyCommand({ intent: startTracking(NO_TARGET, 0.3), options: [] })

      expect(decision).toMatchObject({ kind: 'unresolved', reason: 'low-intent-confidence' })
    })

    it('gives up on an utterance it did not understand', () => {
      const decision = classifyCommand({ intent: unknownIntent('what time is it'), options: [] })

      expect(decision).toMatchObject({ kind: 'unresolved', reason: 'unrecognized-command' })
    })
  })

  describe('with a name to resolve', () => {
    it('is confident about a strong match', () => {
      const decision = classifyCommand({
        intent: startTracking(DEEN),
        options: [match('goal_1', 1, 'Deen')],
      })

      expect(decision).toMatchObject({ kind: 'confident', target: { id: 'goal_1' } })
    })

    it('is confident about a match a recognizer merely mispronounced', () => {
      const decision = classifyCommand({
        intent: startTracking(DEEN),
        options: [match('goal_1', 0.85, 'Deen')],
      })

      expect(decision.kind).toBe('confident')
    })

    it('asks when the best match is only plausible', () => {
      const decision = classifyCommand({
        intent: startTracking(DEEN),
        options: [match('goal_1', 0.65, 'Deen Study')],
      })

      expect(decision).toMatchObject({
        kind: 'needs-confirmation',
        reason: 'low-target-score',
        target: { id: 'goal_1' },
      })
    })

    it('asks when two candidates are too close to choose between', () => {
      const decision = classifyCommand({
        intent: startTracking(DEEN),
        options: [match('a', 0.85, 'Dean'), match('b', 0.85, 'Dan')],
      })

      expect(decision).toMatchObject({ kind: 'needs-confirmation', reason: 'ambiguous-target' })
    })

    it('offers no target when it could not choose, rather than the first one', () => {
      const decision = classifyCommand({
        intent: startTracking(DEEN),
        options: [match('a', 0.85, 'Dean'), match('b', 0.85, 'Dan')],
      })

      expect(decision.target).toBeNull()
      expect(decision.options.map((option) => option.id)).toEqual(['a', 'b'])
    })

    it('picks a clear winner over a distant runner-up', () => {
      const decision = classifyCommand({
        intent: startTracking(DEEN),
        options: [match('a', 0.95, 'Deen'), match('b', 0.6, 'Dan')],
      })

      expect(decision).toMatchObject({ kind: 'confident', target: { id: 'a' } })
    })

    it('gives up when nothing matched the name at all', () => {
      const decision = classifyCommand({ intent: startTracking(DEEN), options: [] })

      expect(decision).toMatchObject({
        kind: 'unresolved',
        reason: 'no-matching-target',
        target: null,
      })
    })

    it('weighs the target before the softer doubt about the command', () => {
      const decision = classifyCommand({
        intent: startTracking(DEEN, 0.7),
        options: [match('a', 0.4, 'Deen')],
      })

      expect(decision.reason).toBe('low-target-score')
    })

    it('gives up on a barely heard command without bothering with the name', () => {
      const decision = classifyCommand({
        intent: startTracking(DEEN, 0.2),
        options: [match('a', 1, 'Deen')],
      })

      expect(decision).toMatchObject({ kind: 'unresolved', reason: 'low-intent-confidence' })
    })
  })

  describe('options', () => {
    const many = [match('a', 0.95), match('b', 0.7), match('c', 0.65), match('d', 0.62)]

    it('are carried even on a confident decision, for a change of mind', () => {
      const decision = classifyCommand({ intent: startTracking(DEEN), options: many })

      expect(decision.kind).toBe('confident')
      expect(decision.options.length).toBeGreaterThan(1)
    })

    it('are capped by the policy', () => {
      const decision = classifyCommand({ intent: startTracking(DEEN), options: many })

      expect(decision.options).toHaveLength(DEFAULT_CONFIDENCE_POLICY.maxOptions)
    })

    it('take the cap from the policy', () => {
      const decision = classifyCommand(
        { intent: startTracking(DEEN), options: many },
        { maxOptions: 2 },
      )

      expect(decision.options).toHaveLength(2)
    })

    it('are empty when there was no name to resolve', () => {
      const decision = classifyCommand({ intent: unknownIntent('mumble'), options: many })

      expect(decision.options).toEqual([])
    })
  })

  describe('thresholds', () => {
    it('take the auto-run bar from the policy', () => {
      const intent = startTracking(NO_TARGET, 0.9)

      expect(
        classifyCommand({ intent, options: [] }, { autoIntentConfidence: 0.95 }),
      ).toMatchObject({ kind: 'needs-confirmation' })
      expect(classifyCommand({ intent, options: [] }, { autoIntentConfidence: 0.9 })).toMatchObject(
        {
          kind: 'confident',
        },
      )
    })

    it('take the give-up bar from the policy', () => {
      const intent = startTracking(NO_TARGET, 0.7)

      expect(classifyCommand({ intent, options: [] }, { minIntentConfidence: 0.75 })).toMatchObject(
        {
          kind: 'unresolved',
        },
      )
    })

    it('take the target bar from the policy', () => {
      const input = { intent: startTracking(DEEN), options: [match('a', 0.7)] }

      expect(classifyCommand(input, { autoTargetScore: 0.7 })).toMatchObject({ kind: 'confident' })
      expect(classifyCommand(input, { autoTargetScore: 0.71 })).toMatchObject({
        kind: 'needs-confirmation',
      })
    })

    it('take the ambiguity margin from the policy', () => {
      const input = { intent: startTracking(DEEN), options: [match('a', 0.9), match('b', 0.85)] }

      expect(classifyCommand(input, { ambiguityMargin: 0.01 })).toMatchObject({ kind: 'confident' })
      expect(classifyCommand(input, { ambiguityMargin: 0.2 })).toMatchObject({
        kind: 'needs-confirmation',
      })
    })

    it('leave unmentioned thresholds at their defaults', () => {
      const decision = classifyCommand(
        { intent: startTracking(NO_TARGET, 0.3), options: [] },
        { maxOptions: 1 },
      )

      expect(decision.kind).toBe('unresolved')
    })
  })

  it('is pure, so the same input always sorts the same way', () => {
    const input = { intent: startTracking(DEEN, 0.75), options: [match('a', 0.7)] }
    const first = classifyCommand(input)

    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(classifyCommand(input)).toEqual(first)
    }
  })
})
