import { describe, expect, it } from 'vitest'

import { intentTarget, type IntentType } from '../../domain/index.js'
import { parseCommand } from './parse.js'
import { compileKindWords, compileVocabulary, type Vocabulary } from './vocabulary.js'

function typeOf(say: string, vocabulary?: Vocabulary): IntentType {
  return parseCommand(say, { vocabulary }).type
}

function nameOf(say: string, vocabulary?: Vocabulary): string | undefined {
  const intent = parseCommand(say, { vocabulary })
  return intent.type === 'CUSTOM' ? intent.name : undefined
}

describe('adding phrasings', () => {
  const extra: Vocabulary = {
    phrases: [
      { phrase: 'clock on', type: 'START_TRACKING' },
      { phrase: 'knock off', type: 'STOP_TRACKING' },
    ],
  }

  it('understands the added phrasing', () => {
    expect(typeOf('clock on', extra)).toBe('START_TRACKING')
    expect(typeOf('knock off', extra)).toBe('STOP_TRACKING')
  })

  it('still understands everything it did before', () => {
    expect(typeOf('start tracking', extra)).toBe('START_TRACKING')
    expect(typeOf('clock in', extra)).toBe('START_TRACKING')
    expect(typeOf('pause', extra)).toBe('PAUSE')
    expect(typeOf('log 30 minutes', extra)).toBe('LOG_TIME')
  })

  it('reads a target out of the added phrasing the same way', () => {
    expect(intentTarget(parseCommand('clock on to my deen goal', { vocabulary: extra }))).toEqual({
      kind: 'goal',
      name: 'deen',
    })
  })

  it('folds an added phrase the same way it folds a transcript', () => {
    const punctuated: Vocabulary = { phrases: [{ phrase: "Let's Get Going!", type: 'RESUME' }] }

    expect(typeOf('lets get going', punctuated)).toBe('RESUME')
  })

  it('prefers the longer phrase, added or built in', () => {
    const overlapping: Vocabulary = {
      phrases: [{ phrase: 'start the pomodoro', type: 'START_TRACKING' }],
    }

    expect(typeOf('start the pomodoro', overlapping)).toBe('START_TRACKING')
    expect(intentTarget(parseCommand('start the pomodoro', { vocabulary: overlapping }))).toEqual({
      kind: 'none',
    })
  })

  it('carries the weak flag through', () => {
    const soft: Vocabulary = { phrases: [{ phrase: 'go', type: 'START_TRACKING', weak: true }] }

    expect(parseCommand('go', { vocabulary: soft }).confidence).toBeLessThan(
      parseCommand('start', { vocabulary: soft }).confidence,
    )
  })

  it('carries the duration requirement through', () => {
    const billing: Vocabulary = {
      phrases: [{ phrase: 'invoice', type: 'LOG_TIME', needsDuration: true }],
    }

    expect(typeOf('invoice 2 hours to deen', billing)).toBe('LOG_TIME')
    expect(typeOf('invoice deen', billing)).toBe('UNKNOWN')
  })

  it('ignores a phrase that folds away to nothing', () => {
    expect(typeOf('stop', { phrases: [{ phrase: '!!!', type: 'PAUSE' }] })).toBe('STOP_TRACKING')
  })
})

describe('overriding phrasings', () => {
  it('lets a repeated phrase take on the new meaning', () => {
    const reassigned: Vocabulary = { phrases: [{ phrase: 'wrap up', type: 'PAUSE' }] }

    expect(typeOf('wrap up')).toBe('STOP_TRACKING')
    expect(typeOf('wrap up', reassigned)).toBe('PAUSE')
  })

  it('does not leave the built-in meaning behind as a duplicate', () => {
    const reassigned: Vocabulary = { phrases: [{ phrase: 'pause', type: 'STOP_TRACKING' }] }

    expect(typeOf('pause', reassigned)).toBe('STOP_TRACKING')
  })

  it('drops a built-in phrasing on request', () => {
    const stricter: Vocabulary = { removePhrases: ['done', 'thats it'] }

    expect(typeOf('done')).toBe('STOP_TRACKING')
    expect(typeOf('done', stricter)).toBe('UNKNOWN')
    expect(typeOf('stop tracking', stricter)).toBe('STOP_TRACKING')
  })
})

describe('custom intent types', () => {
  const breaks: Vocabulary = {
    phrases: [
      { phrase: 'take five', type: 'CUSTOM', name: 'BREAK' },
      { phrase: 'start a break on', type: 'CUSTOM', name: 'BREAK' },
      { phrase: 'summarize my day', type: 'CUSTOM', name: 'DAILY_SUMMARY' },
    ],
  }

  it('produces a CUSTOM intent carrying the host name', () => {
    expect(typeOf('take five', breaks)).toBe('CUSTOM')
    expect(nameOf('take five', breaks)).toBe('BREAK')
    expect(nameOf('summarize my day', breaks)).toBe('DAILY_SUMMARY')
  })

  it('reads a target for a custom command like any other', () => {
    expect(
      intentTarget(parseCommand('start a break on my deen goal', { vocabulary: breaks })),
    ).toEqual({ kind: 'goal', name: 'deen' })
  })

  it('is actionable, so the layers above treat it as a real command', () => {
    const intent = parseCommand('take five', { vocabulary: breaks })

    expect(intent.confidence).toBeGreaterThan(0)
    expect(intent.type).not.toBe('UNKNOWN')
  })

  it('ignores an entry with no name', () => {
    const nameless: Vocabulary = { phrases: [{ phrase: 'take five', type: 'CUSTOM', name: '' }] }

    expect(typeOf('take five', nameless)).toBe('UNKNOWN')
  })
})

describe('filler', () => {
  it('strips an added filler from either end', () => {
    const polite: Vocabulary = { fillers: ['bitte'] }

    expect(typeOf('bitte stop tracking', polite)).toBe('STOP_TRACKING')
    expect(typeOf('stop tracking bitte', polite)).toBe('STOP_TRACKING')
  })

  it('keeps stripping the built-in filler alongside it', () => {
    const polite: Vocabulary = { fillers: ['bitte'] }

    expect(typeOf('hey bitte can you stop tracking please', polite)).toBe('STOP_TRACKING')
  })

  it('stops stripping a built-in filler on request', () => {
    const literal: Vocabulary = { removeFillers: ['just'] }

    expect(
      intentTarget(parseCommand('start tracking just cause', { vocabulary: literal })),
    ).toEqual({ kind: 'unspecified', name: 'just cause' })
  })
})

describe('kind words', () => {
  it('merge over the built-in set rather than replacing it', () => {
    const words = compileKindWords({ sprint: 'category' })

    expect(words.sprint).toBe('category')
    expect(words.goal).toBe('goal')
  })

  it('override a built-in word', () => {
    expect(compileKindWords({ project: 'task' }).project).toBe('task')
  })

  it('drop a built-in word when mapped to null', () => {
    expect(compileKindWords({ project: null }).project).toBeUndefined()
    expect(compileKindWords({ project: null }).goal).toBe('goal')
  })

  it('fold the word the same way a transcript folds', () => {
    expect(compileKindWords({ Sprint: 'category' }).sprint).toBe('category')
  })

  it('leave the defaults alone when nothing is supplied', () => {
    expect(compileKindWords().goal).toBe('goal')
  })

  it('do not mutate the defaults between calls', () => {
    compileKindWords({ goal: null })

    expect(compileKindWords().goal).toBe('goal')
  })
})

describe('compilation', () => {
  it('reuses the compiled table for the same vocabulary object', () => {
    const vocabulary: Vocabulary = { phrases: [{ phrase: 'clock on', type: 'START_TRACKING' }] }

    expect(compileVocabulary(vocabulary)).toBe(compileVocabulary(vocabulary))
  })

  it('reuses the built-in table when there is no vocabulary', () => {
    expect(compileVocabulary()).toBe(compileVocabulary())
  })

  it('gives the same answer however many times it runs', () => {
    const vocabulary: Vocabulary = { phrases: [{ phrase: 'clock on', type: 'START_TRACKING' }] }
    const first = parseCommand('clock on to deen', { vocabulary })

    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(parseCommand('clock on to deen', { vocabulary })).toEqual(first)
    }
  })
})
