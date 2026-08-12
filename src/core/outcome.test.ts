import { describe, expect, it } from 'vitest'

import {
  namedTarget,
  NO_TARGET,
  unknownIntent,
  type IntentTarget,
  type ResolvedTarget,
  type VoiceIntent,
} from '../domain/index.js'
import { classifyCommand, type CommandDecision } from './decision.js'
import { fallbackFor, isCommand, isFallback, needsConfirmation, toOutcome } from './outcome.js'

function startTracking(target: IntentTarget = NO_TARGET, confidence = 0.9): VoiceIntent {
  return { type: 'START_TRACKING', target, transcript: 'start tracking deen', confidence }
}

function match(id: string, score: number): ResolvedTarget {
  return { id, name: id, kind: 'goal', score, matchedOn: id }
}

const DEEN = namedTarget('goal', 'deen')

function outcomeFor(intent: VoiceIntent, options: readonly ResolvedTarget[] = []) {
  return toOutcome(classifyCommand({ intent, options }))
}

describe('toOutcome', () => {
  it('turns a confident decision into a command to run', () => {
    const outcome = outcomeFor(startTracking(DEEN), [match('goal_1', 1)])

    expect(outcome).toMatchObject({
      kind: 'command',
      intent: { type: 'START_TRACKING' },
      target: { id: 'goal_1' },
    })
  })

  it('narrows the intent, so a command outcome needs no further checking', () => {
    const outcome = outcomeFor(startTracking())
    if (!isCommand(outcome)) throw new Error('expected a command')

    expect(outcome.intent.target).toEqual(NO_TARGET)
  })

  it('turns a doubtful decision into something to ask about', () => {
    const outcome = outcomeFor(startTracking(DEEN), [match('a', 0.85), match('b', 0.85)])

    expect(outcome).toMatchObject({ kind: 'confirm', target: null })
    expect(needsConfirmation(outcome) && outcome.options).toHaveLength(2)
  })

  it('turns an unresolved decision into a fallback', () => {
    const outcome = outcomeFor(unknownIntent('what did i work on yesterday'))

    expect(outcome).toMatchObject({
      kind: 'fallback',
      transcript: 'what did i work on yesterday',
      reason: 'unrecognized-command',
    })
  })

  it('keeps the reason the decision gave', () => {
    const outcome = outcomeFor(startTracking(DEEN), [])

    expect(outcome).toMatchObject({ kind: 'fallback', reason: 'no-matching-target' })
  })

  it('keeps whatever partial sense was made of the utterance', () => {
    const outcome = outcomeFor(startTracking(DEEN), [])
    if (!isFallback(outcome)) throw new Error('expected a fallback')

    expect(outcome.intent).toMatchObject({ type: 'START_TRACKING' })
    expect(outcome.decision?.reason).toBe('no-matching-target')
  })

  it('carries the decision on every kind, for logging', () => {
    const confident = outcomeFor(startTracking())
    const doubtful = outcomeFor(startTracking(NO_TARGET, 0.7))

    expect(confident.decision).not.toBeNull()
    expect(doubtful.decision).not.toBeNull()
  })

  it('reports an empty transcript as having heard nothing', () => {
    const outcome = toOutcome(classifyCommand({ intent: unknownIntent(''), options: [] }))

    expect(outcome).toMatchObject({ kind: 'fallback', reason: 'nothing-heard', transcript: '' })
  })

  it('does not trust a decision that claims confidence in an unknown intent', () => {
    const malformed: CommandDecision = {
      kind: 'confident',
      intent: unknownIntent('mumble'),
      target: null,
      options: [],
      reason: null,
    }

    expect(toOutcome(malformed).kind).toBe('fallback')
  })
})

describe('fallbackFor', () => {
  it('carries the transcript, which is the whole point of it', () => {
    expect(fallbackFor('book me a flight')).toMatchObject({
      kind: 'fallback',
      transcript: 'book me a flight',
    })
  })

  it('defaults to not having recognized the command', () => {
    expect(fallbackFor('book me a flight').reason).toBe('unrecognized-command')
  })

  it('overrides the reason when nothing was said', () => {
    expect(fallbackFor('   ', 'unrecognized-command').reason).toBe('nothing-heard')
  })
})

describe('the guards', () => {
  it('sort each kind exactly one way', () => {
    const outcomes = [
      outcomeFor(startTracking()),
      outcomeFor(startTracking(NO_TARGET, 0.7)),
      outcomeFor(unknownIntent('mumble')),
    ]

    for (const outcome of outcomes) {
      const matches = [isCommand(outcome), needsConfirmation(outcome), isFallback(outcome)]
      expect(matches.filter(Boolean)).toHaveLength(1)
    }
  })
})
