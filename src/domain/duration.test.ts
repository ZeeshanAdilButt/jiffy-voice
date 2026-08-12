import { describe, expect, it } from 'vitest'

import { formatDurationMinutes } from './duration.js'

describe('formatDurationMinutes', () => {
  it('formats whole minutes', () => {
    expect(formatDurationMinutes(30)).toBe('30m')
  })

  it('formats whole hours without a minutes part', () => {
    expect(formatDurationMinutes(120)).toBe('2h')
  })

  it('splits hours and minutes', () => {
    expect(formatDurationMinutes(90)).toBe('1h 30m')
  })

  it('formats a sub-minute duration as seconds', () => {
    expect(formatDurationMinutes(0.75)).toBe('45s')
  })

  it('carries seconds alongside larger units', () => {
    expect(formatDurationMinutes(90.5)).toBe('1h 30m 30s')
  })

  it('rounds to the nearest second rather than showing float noise', () => {
    expect(formatDurationMinutes(1 / 3)).toBe('20s')
  })

  it('returns a zero duration for nothing and for nonsense', () => {
    expect(formatDurationMinutes(0)).toBe('0m')
    expect(formatDurationMinutes(-5)).toBe('0m')
    expect(formatDurationMinutes(Number.NaN)).toBe('0m')
    expect(formatDurationMinutes(Number.POSITIVE_INFINITY)).toBe('0m')
  })
})
