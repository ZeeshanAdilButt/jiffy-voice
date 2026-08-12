import { describe, expect, it } from 'vitest'

import { findDuration } from './duration.js'

function minutesIn(phrase: string): number | null {
  return findDuration(phrase.split(' '))?.minutes ?? null
}

describe('findDuration', () => {
  const spoken: ReadonlyArray<readonly [string, number]> = [
    ['30 minutes', 30],
    ['30 minute', 30],
    ['30 mins', 30],
    ['30 min', 30],
    ['30m', 30],
    ['1 hour', 60],
    ['2 hours', 120],
    ['2 hrs', 120],
    ['1h', 60],
    ['1.5 hours', 90],
    ['90 seconds', 1.5],
    ['45 seconds', 0.75],
    ['a minute', 1],
    ['an hour', 60],
    ['ten minutes', 10],
    ['fifteen minutes', 15],
    ['twenty five minutes', 25],
    ['ninety minutes', 90],
    ['two hundred minutes', 200],
    ['one hundred twenty minutes', 120],
    ['one hundred and twenty minutes', 120],
    ['half an hour', 30],
    ['a half hour', 30],
    ['half hour', 30],
    ['a quarter of an hour', 15],
    ['quarter of an hour', 15],
    ['three quarters of an hour', 45],
    ['an hour and a half', 90],
    ['one and a half hours', 90],
    ['two and a half hours', 150],
    ['1 hour 30 minutes', 90],
    ['one hour and thirty minutes', 90],
    ['an hour and ten minutes', 70],
  ]

  it.each(spoken)('reads %j as %i minutes', (phrase, minutes) => {
    expect(minutesIn(phrase)).toBe(minutes)
  })

  it('reports where the duration sat so the caller can lift it out', () => {
    expect(findDuration(['to', 'my', 'goal', 'for', '30', 'minutes'])).toEqual({
      minutes: 30,
      start: 4,
      end: 6,
      assumedUnit: false,
    })
  })

  it('finds the first duration when there is more than one', () => {
    expect(findDuration(['30', 'minutes', 'or', '2', 'hours'])?.minutes).toBe(30)
  })

  it('ignores a number with no unit', () => {
    expect(minutesIn('45 to my deen goal')).toBeNull()
  })

  it('reads a bare number as the unit the caller nominates', () => {
    expect(findDuration(['45', 'to', 'deen'], { bareNumberUnit: 'minutes' })).toEqual({
      minutes: 45,
      start: 0,
      end: 1,
      assumedUnit: true,
    })
  })

  it('does not claim it assumed a unit when one was spoken', () => {
    expect(findDuration(['45', 'minutes'], { bareNumberUnit: 'minutes' })?.assumedUnit).toBe(false)
  })

  it('stops at a unit no smaller than the last, so two quantities do not merge', () => {
    expect(findDuration(['2', 'hours', '3', 'hours'])?.minutes).toBe(120)
  })

  it('does not treat a word that merely starts with a number as a duration', () => {
    expect(minutesIn('5k training')).toBeNull()
  })

  it('finds nothing in text with no quantity in it', () => {
    expect(minutesIn('my deen goal')).toBeNull()
    expect(findDuration([])).toBeNull()
  })

  it('ignores a zero-length duration rather than reporting an empty match', () => {
    expect(minutesIn('zero minutes')).toBeNull()
  })
})
