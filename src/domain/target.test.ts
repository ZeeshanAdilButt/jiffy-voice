import { describe, expect, it } from 'vitest'

import {
  describeTarget,
  isNamedTarget,
  isTargetKind,
  namedTarget,
  NO_TARGET,
  TARGET_KINDS,
} from './target.js'

describe('namedTarget', () => {
  it('keeps the kind and name it was given', () => {
    expect(namedTarget('goal', 'deen')).toEqual({ kind: 'goal', name: 'deen' })
  })

  it('trims surrounding whitespace from the name', () => {
    expect(namedTarget('task', '  write tests  ').name).toBe('write tests')
  })

  it('collapses internal whitespace so spacing never changes equality', () => {
    expect(namedTarget('category', 'deep   work').name).toBe('deep work')
  })

  it('accepts an unspecified kind for names said without a type', () => {
    expect(namedTarget('unspecified', 'deen').kind).toBe('unspecified')
  })
})

describe('isNamedTarget', () => {
  it('rejects the absence of a target', () => {
    expect(isNamedTarget(NO_TARGET)).toBe(false)
  })

  it('accepts every spoken kind', () => {
    expect(isNamedTarget(namedTarget('goal', 'deen'))).toBe(true)
    expect(isNamedTarget(namedTarget('unspecified', 'deen'))).toBe(true)
  })
})

describe('isTargetKind', () => {
  it('accepts the host-facing kinds', () => {
    for (const kind of TARGET_KINDS) {
      expect(isTargetKind(kind)).toBe(true)
    }
  })

  it('rejects unspecified, which is a parser state and not a record type', () => {
    expect(isTargetKind('unspecified')).toBe(false)
  })

  it('rejects values that are not kinds at all', () => {
    expect(isTargetKind('none')).toBe(false)
    expect(isTargetKind('')).toBe(false)
    expect(isTargetKind(null)).toBe(false)
    expect(isTargetKind(7)).toBe(false)
  })
})

describe('describeTarget', () => {
  it('names the kind when the speaker gave one', () => {
    expect(describeTarget(namedTarget('goal', 'deen'))).toBe('goal "deen"')
  })

  it('omits the kind when the speaker did not give one', () => {
    expect(describeTarget(namedTarget('unspecified', 'deen'))).toBe('"deen"')
  })

  it('says so when there is no target', () => {
    expect(describeTarget(NO_TARGET)).toBe('no target')
  })
})
