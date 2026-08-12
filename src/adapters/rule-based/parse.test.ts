import { describe, expect, it } from 'vitest'

import { intentTarget, type IntentTarget, type IntentType } from '../../domain/index.js'
import { parseCommand } from './parse.js'

function typeOf(say: string): IntentType {
  return parseCommand(say).type
}

function targetOf(say: string): IntentTarget {
  return intentTarget(parseCommand(say))
}

function minutesOf(say: string): number | null {
  const intent = parseCommand(say)
  return intent.type === 'LOG_TIME' ? intent.durationMinutes : null
}

describe('starting a timer', () => {
  const phrases = [
    'start',
    'start tracking',
    'start tracking time',
    'start the timer',
    'start a timer',
    'start timer',
    'start the clock',
    'begin',
    'begin tracking',
    'begin tracking time',
    'clock in',
    'punch in',
    'new timer',
    'track',
    'track time',
  ]

  it.each(phrases)('reads %j as a start', (say) => {
    expect(typeOf(say)).toBe('START_TRACKING')
  })

  const withTarget = [
    'start tracking deen',
    'start tracking my deen goal',
    'start tracking time for my deen goal',
    'start working on deen',
    'begin working on the deen goal',
    'clock in on deen',
    'switch to deen',
    'switch over to deen',
    'im working on deen',
    'i am working on deen',
    'new timer for deen',
    'time me on deen',
    'track deen',
  ]

  it.each(withTarget)('finds the target in %j', (say) => {
    expect(typeOf(say)).toBe('START_TRACKING')
    expect(targetOf(say)).toMatchObject({ name: 'deen' })
  })
})

describe('stopping a timer', () => {
  const phrases = [
    'stop',
    'stop tracking',
    'stop tracking time',
    'stop the timer',
    'stop timer',
    'stop the clock',
    'end',
    'end tracking',
    'end the timer',
    'end session',
    'end the session',
    'finish',
    'finish up',
    'finish tracking',
    'finished',
    'im finished',
    'i am finished',
    'im done',
    'i am done',
    'done',
    'thats it',
    'clock out',
    'punch out',
    'wrap up',
  ]

  it.each(phrases)('reads %j as a stop', (say) => {
    expect(typeOf(say)).toBe('STOP_TRACKING')
  })

  const withTarget = ['stop tracking deen', 'stop tracking the deen goal', 'stop working on deen']

  it.each(withTarget)('finds the target in %j', (say) => {
    expect(typeOf(say)).toBe('STOP_TRACKING')
    expect(targetOf(say)).toMatchObject({ name: 'deen' })
  })
})

describe('pausing', () => {
  const phrases = [
    'pause',
    'pause tracking',
    'pause the timer',
    'pause timer',
    'take a break',
    'hold on',
    'hold the timer',
    'put it on hold',
  ]

  it.each(phrases)('reads %j as a pause', (say) => {
    expect(typeOf(say)).toBe('PAUSE')
  })

  const qualifiers = [
    'pause for a moment',
    'pause for a second',
    'pause for a bit',
    'pause for now',
    'pause for five minutes',
    'pause for 5 minutes',
  ]

  it.each(qualifiers)('reads the tail of %j as a qualifier, not a name', (say) => {
    expect(typeOf(say)).toBe('PAUSE')
    expect(targetOf(say)).toEqual({ kind: 'none' })
  })

  it('still finds a real target after a pause', () => {
    expect(targetOf('pause the deen goal')).toEqual({ kind: 'goal', name: 'deen' })
  })
})

describe('resuming', () => {
  const phrases = [
    'resume',
    'resume tracking',
    'resume the timer',
    'resume timer',
    'unpause',
    'un pause',
    'continue',
    'continue tracking',
    'continue the timer',
    'keep going',
    'carry on',
    'start again',
    'back to work',
    'im back',
    'i am back',
    'pick up where i left off',
  ]

  it.each(phrases)('reads %j as a resume', (say) => {
    expect(typeOf(say)).toBe('RESUME')
  })

  it('prefers the longer phrase, so start again is not a fresh start', () => {
    expect(typeOf('start again')).toBe('RESUME')
    expect(typeOf('start tracking')).toBe('START_TRACKING')
  })
})

describe('logging time after the fact', () => {
  const phrases = [
    'log 30 minutes',
    'add 20 mins',
    'record 2 hours',
    'put 45 minutes',
    'enter 15 minutes',
    'bill 2 hours',
    'credit 30 minutes',
    'i spent 2 hours',
    'ive spent 2 hours',
    'spent 30 minutes',
    'i worked 2 hours',
    'worked 30 minutes',
    'worked for 30 minutes',
  ]

  it.each(phrases)('reads %j as a log', (say) => {
    expect(typeOf(say)).toBe('LOG_TIME')
  })

  const durations: ReadonlyArray<readonly [string, number]> = [
    ['log 30 minutes to my deen goal', 30],
    ['log 30 minutes for deen', 30],
    ['log 30 minutes on deen', 30],
    ['add half an hour to deen', 30],
    ['record 2 hours for the fitness category', 120],
    ['i spent an hour and a half on the deen goal', 90],
    ['put 45 minutes toward deen', 45],
    ['log an hour to deen', 60],
    ['log 90 seconds to deen', 1.5],
    ['add one and a half hours to deen', 90],
    ['log a quarter of an hour to deen', 15],
    ['log three quarters of an hour to deen', 45],
    ['log 1h 30m to deen', 90],
    ['log 1.5 hours to deen', 90],
    ['log one hundred and twenty minutes to deen', 120],
  ]

  it.each(durations)('reads the duration in %j as %i minutes', (say, minutes) => {
    expect(minutesOf(say)).toBe(minutes)
  })

  it('keeps the target once the duration has been lifted out', () => {
    expect(targetOf('log 30 minutes to my deen goal')).toEqual({ kind: 'goal', name: 'deen' })
    expect(targetOf('record 2 hours for the fitness category')).toEqual({
      kind: 'category',
      name: 'fitness',
    })
  })

  it('reads a bare number as minutes, which is the only unit anyone means', () => {
    expect(minutesOf('log 45 to my deen goal')).toBe(45)
    expect(targetOf('log 45 to my deen goal')).toEqual({ kind: 'goal', name: 'deen' })
  })

  it('refuses a log with no duration rather than turning it into a start', () => {
    expect(typeOf('log time for my deen goal')).toBe('UNKNOWN')
    expect(typeOf('add to my deen goal')).toBe('UNKNOWN')
  })
})

describe('reading the target out of a phrase', () => {
  const targets: ReadonlyArray<readonly [string, IntentTarget]> = [
    ['start tracking deen', { kind: 'unspecified', name: 'deen' }],
    ['start tracking my deen goal', { kind: 'goal', name: 'deen' }],
    ['start tracking the deen goals', { kind: 'goal', name: 'deen' }],
    ['start tracking goal deen', { kind: 'goal', name: 'deen' }],
    ['start tracking the invoices task', { kind: 'task', name: 'invoices' }],
    ['start tracking my morning routine todo', { kind: 'task', name: 'morning routine' }],
    ['start tracking the fitness category', { kind: 'category', name: 'fitness' }],
    ['start tracking the acme project', { kind: 'category', name: 'acme' }],
    ['start tracking deep work', { kind: 'unspecified', name: 'deep work' }],
    ['start tracking my time on the deen goal', { kind: 'goal', name: 'deen' }],
    ['start tracking my time management goal', { kind: 'goal', name: 'time management' }],
    ['start tracking the 5k training goal', { kind: 'goal', name: '5k training' }],
    ['start tracking deen now', { kind: 'unspecified', name: 'deen' }],
  ]

  it.each(targets)('reads %j as %j', (say, target) => {
    expect(targetOf(say)).toEqual(target)
  })

  it('treats a bare kind word as no target, since it names a type', () => {
    expect(targetOf('start tracking my goal')).toEqual({ kind: 'none' })
    expect(targetOf('stop tracking the task')).toEqual({ kind: 'none' })
  })

  it('leaves a name that happens to contain a command word intact', () => {
    expect(targetOf('start tracking my stop smoking goal')).toEqual({
      kind: 'goal',
      name: 'stop smoking',
    })
  })
})

describe('phrasing it does not care about', () => {
  const sameCommand = [
    'Start Tracking My Deen Goal.',
    'start tracking my deen goal',
    'START TRACKING MY DEEN GOAL',
    'um, start tracking my deen goal',
    'hey, can you start tracking my deen goal please?',
    'i want to start tracking my deen goal',
    "let's start tracking my deen goal",
    'ok so start tracking my deen goal, thanks',
  ]

  it.each(sameCommand)('reads %j the same way', (say) => {
    expect(typeOf(say)).toBe('START_TRACKING')
    expect(targetOf(say)).toEqual({ kind: 'goal', name: 'deen' })
  })

  it('closes up an apostrophe rather than splitting the name on it', () => {
    expect(targetOf("start tracking the qur'an study goal")).toEqual({
      kind: 'goal',
      name: 'quran study',
    })
  })
})

describe('options', () => {
  it('drops a configured wake word', () => {
    const intent = parseCommand('hey jiffy start tracking deen', { wakeWords: ['jiffy'] })
    expect(intent.type).toBe('START_TRACKING')
    expect(intentTarget(intent)).toEqual({ kind: 'unspecified', name: 'deen' })
  })

  it('leaves an unconfigured wake word in the utterance', () => {
    expect(intentTarget(parseCommand('start tracking jiffy'))).toEqual({
      kind: 'unspecified',
      name: 'jiffy',
    })
  })

  it('takes the host word for what a kind is called', () => {
    const intent = parseCommand('start tracking the acme client', {
      kindWords: { client: 'category' },
    })
    expect(intentTarget(intent)).toEqual({ kind: 'category', name: 'acme' })
  })

  it('replaces the defaults rather than adding to them', () => {
    const intent = parseCommand('start tracking my deen goal', {
      kindWords: { client: 'category' },
    })
    expect(intentTarget(intent)).toEqual({ kind: 'unspecified', name: 'deen goal' })
  })
})

describe('things it refuses to guess at', () => {
  const phrases = [
    '',
    '   ',
    'um',
    'hello',
    'what time is it',
    'the weather is nice today',
    'how much time did i spend on deen',
    'delete my deen goal',
    'log time for my deen goal',
    'log zero minutes to deen',
  ]

  it.each(phrases)('reads %j as unknown', (say) => {
    expect(typeOf(say)).toBe('UNKNOWN')
  })

  it('does not read cancel as stop, since one of them throws work away', () => {
    expect(typeOf('cancel')).toBe('UNKNOWN')
    expect(typeOf('cancel the timer')).toBe('UNKNOWN')
  })

  it('keeps the transcript on an unknown command so the host can show it', () => {
    expect(parseCommand('what time is it').transcript).toBe('what time is it')
  })
})

describe('confidence', () => {
  it('is highest when the whole utterance is a known command', () => {
    expect(parseCommand('stop').confidence).toBe(0.95)
    expect(parseCommand('pause').confidence).toBe(0.95)
  })

  it('settles a step lower once a target has to be read out of the phrase', () => {
    expect(parseCommand('stop tracking the deen goal').confidence).toBe(0.9)
  })

  it('discounts a phrase that is ordinary speech as often as it is a command', () => {
    expect(parseCommand('done').confidence).toBeLessThan(parseCommand('stop tracking').confidence)
    expect(parseCommand('continue').confidence).toBeLessThan(parseCommand('resume').confidence)
  })

  it('discounts a command buried behind words it did not recognize', () => {
    expect(parseCommand('sorry start tracking deen').confidence).toBeLessThan(
      parseCommand('start tracking deen').confidence,
    )
  })

  it('discounts a duration whose unit had to be assumed', () => {
    expect(parseCommand('log 45 to deen').confidence).toBeLessThan(
      parseCommand('log 45 minutes to deen').confidence,
    )
  })

  it('gives an unknown command no confidence at all', () => {
    expect(parseCommand('what time is it').confidence).toBe(0)
  })

  it('stays inside the range whatever the penalties add up to', () => {
    for (const say of ['done', 'sorry log 45 to deen', 'stop', 'what time is it']) {
      const { confidence } = parseCommand(say)
      expect(confidence).toBeGreaterThanOrEqual(0)
      expect(confidence).toBeLessThanOrEqual(1)
    }
  })
})

describe('determinism', () => {
  it('gives the same answer every time for the same input', () => {
    const say = 'log an hour and a half to my deen goal'
    const first = parseCommand(say)
    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(parseCommand(say)).toEqual(first)
    }
  })
})
