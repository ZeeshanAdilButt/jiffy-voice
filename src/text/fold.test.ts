import { describe, expect, it } from 'vitest'

import { foldText, tokenize } from './fold.js'

describe('foldText', () => {
  it('lowercases', () => {
    expect(foldText('Start Tracking')).toBe('start tracking')
  })

  it('strips accents so accented and plain spellings meet in the middle', () => {
    expect(foldText('Café Résumé')).toBe('cafe resume')
  })

  it('closes up apostrophes instead of splitting the word', () => {
    expect(foldText("don't")).toBe('dont')
    expect(foldText("deen's")).toBe('deens')
  })

  it('treats the typographic apostrophe the same as the typed one', () => {
    expect(foldText('deen’s')).toBe(foldText("deen's"))
  })

  it('turns punctuation into separators', () => {
    expect(foldText('stop, please!')).toBe('stop please')
    expect(foldText('deep-work')).toBe('deep work')
  })

  it('keeps decimal points inside numbers', () => {
    expect(foldText('1.5 hours')).toBe('1.5 hours')
  })

  it('drops sentence punctuation that happens to be a period', () => {
    expect(foldText('Stop tracking.')).toBe('stop tracking')
  })

  it('collapses runs of whitespace', () => {
    expect(foldText('  start \n  tracking  ')).toBe('start tracking')
  })

  it('returns nothing for text it cannot fold', () => {
    expect(foldText('！！！')).toBe('')
    expect(foldText('   ')).toBe('')
  })
})

describe('tokenize', () => {
  it('splits on whitespace after folding', () => {
    expect(tokenize('Start tracking my deen goal')).toEqual([
      'start',
      'tracking',
      'my',
      'deen',
      'goal',
    ])
  })

  it('returns an empty list rather than a list holding an empty string', () => {
    expect(tokenize('')).toEqual([])
    expect(tokenize('   ')).toEqual([])
  })
})
