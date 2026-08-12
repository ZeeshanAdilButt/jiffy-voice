import { describe, expect, it } from 'vitest'

import { similarity } from './similarity.js'

describe('similarity', () => {
  it('scores an identical name as a perfect match', () => {
    expect(similarity('deen', 'deen')).toBe(1)
  })

  it('ignores casing, punctuation, and accents', () => {
    expect(similarity('deep work', 'Deep-Work')).toBe(1)
    expect(similarity('quran study', "Qur'an Study")).toBe(1)
    expect(similarity('cafe', 'Café')).toBe(1)
  })

  it('ignores word order', () => {
    expect(similarity('work deep', 'Deep Work')).toBe(1)
  })

  it('scores nothing when either side folds away to nothing', () => {
    expect(similarity('', 'deen')).toBe(0)
    expect(similarity('!!!', 'deen')).toBe(0)
  })

  it('scores unrelated names low enough to reject', () => {
    expect(similarity('deen', 'fitness')).toBeLessThan(0.3)
    expect(similarity('writing', 'Reading')).toBeLessThan(0.6)
    expect(similarity('fitness', 'Finance')).toBeLessThan(0.6)
  })

  describe('transcription errors', () => {
    it('forgives a vowel a recognizer got wrong', () => {
      expect(similarity('dean', 'Deen')).toBe(0.85)
      expect(similarity('deen', 'Din')).toBe(0.85)
    })

    it('forgives a transposition', () => {
      expect(similarity('detial', 'detail')).toBeGreaterThan(0.8)
    })

    it('forgives a plural', () => {
      expect(similarity('morning routine', 'Morning Routines')).toBeGreaterThan(0.9)
      expect(similarity('side project', 'Side Projects')).toBeGreaterThan(0.9)
    })

    it('forgives a word split in two', () => {
      expect(similarity('work out', 'Workout')).toBeGreaterThan(0.8)
    })

    it('still separates two names a vowel apart from an unrelated one', () => {
      expect(similarity('dean', 'Deen')).toBeGreaterThan(similarity('dean', 'Fitness'))
    })
  })

  describe('partial names', () => {
    it('scores a name said in full above the same name said in part', () => {
      expect(similarity('deen study', 'Deen Study')).toBeGreaterThan(
        similarity('deen', 'Deen Study'),
      )
    })

    it('does not let one matching word carry a much longer name', () => {
      expect(similarity('deen', 'Deen fitness tracker overhaul')).toBeLessThan(0.6)
    })

    it('accepts a name shortened by a word or so', () => {
      expect(similarity('acme', 'Acme Corp')).toBeGreaterThan(0.6)
    })
  })

  it('is symmetric', () => {
    const pairs: ReadonlyArray<readonly [string, string]> = [
      ['dean', 'Deen'],
      ['acme', 'Acme Corp'],
      ['deep work', 'Deep Work'],
      ['reading', 'writing'],
    ]

    for (const [a, b] of pairs) {
      expect(similarity(a, b)).toBe(similarity(b, a))
    }
  })

  it('gives the same score every time', () => {
    const first = similarity('dean goal', 'Deen')
    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(similarity('dean goal', 'Deen')).toBe(first)
    }
  })

  it('stays inside the range', () => {
    const words = ['deen', 'Deen Study', 'x', '', 'a very long name indeed', '5k']
    for (const a of words) {
      for (const b of words) {
        const score = similarity(a, b)
        expect(score).toBeGreaterThanOrEqual(0)
        expect(score).toBeLessThanOrEqual(1)
      }
    }
  })
})
