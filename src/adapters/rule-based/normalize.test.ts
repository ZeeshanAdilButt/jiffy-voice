import { describe, expect, it } from 'vitest'

import { matchesAt, normalizeUtterance } from './normalize.js'

describe('normalizeUtterance', () => {
  it('folds and splits an ordinary command', () => {
    expect(normalizeUtterance('Start tracking my deen goal')).toEqual([
      'start',
      'tracking',
      'my',
      'deen',
      'goal',
    ])
  })

  it('drops thinking noises wherever they appear', () => {
    expect(normalizeUtterance('um start uh tracking deen')).toEqual(['start', 'tracking', 'deen'])
  })

  it('drops politeness from the front', () => {
    expect(normalizeUtterance('hey can you start tracking deen')).toEqual([
      'start',
      'tracking',
      'deen',
    ])
  })

  it('drops politeness from the end', () => {
    expect(normalizeUtterance('stop tracking please')).toEqual(['stop', 'tracking'])
  })

  it('keeps stripping while there is anything left to strip', () => {
    expect(normalizeUtterance('ok so please just stop')).toEqual(['stop'])
  })

  it('keeps words that only look like filler in the middle of a name', () => {
    expect(normalizeUtterance('start tracking the just cause goal')).toEqual([
      'start',
      'tracking',
      'the',
      'just',
      'cause',
      'goal',
    ])
  })

  it('drops a configured wake word', () => {
    expect(normalizeUtterance('jiffy stop', { wakeWords: ['jiffy'] })).toEqual(['stop'])
  })

  it('drops a wake word that arrives behind a greeting', () => {
    expect(normalizeUtterance('hey jiffy stop tracking', { wakeWords: ['jiffy'] })).toEqual([
      'stop',
      'tracking',
    ])
  })

  it('folds the configured wake word the same way it folds the transcript', () => {
    expect(normalizeUtterance('Jiffy, stop', { wakeWords: ['Jiffy'] })).toEqual(['stop'])
  })

  it('returns nothing when the utterance was entirely filler', () => {
    expect(normalizeUtterance('um okay so')).toEqual([])
    expect(normalizeUtterance('')).toEqual([])
  })
})

describe('matchesAt', () => {
  it('matches a phrase at an offset', () => {
    expect(matchesAt(['well', 'stop', 'tracking'], 1, ['stop', 'tracking'])).toBe(true)
  })

  it('does not match a phrase that runs past the end', () => {
    expect(matchesAt(['stop'], 0, ['stop', 'tracking'])).toBe(false)
  })

  it('does not match at a negative offset', () => {
    expect(matchesAt(['stop'], -1, ['stop'])).toBe(false)
  })
})
