import { describe, expect, it } from 'vitest'

import { isUnresolved, namesTarget, type ResolvedTarget, type VoiceCommand } from './command.js'
import { unknownIntent, type StartTrackingIntent } from './intent.js'
import { namedTarget, NO_TARGET } from './target.js'

const RESOLVED: ResolvedTarget = {
  id: 'goal_42',
  name: 'Deen',
  kind: 'goal',
  score: 0.87,
  matchedOn: 'Deen',
}

function command(intent: VoiceCommand['intent'], target: ResolvedTarget | null): VoiceCommand {
  return { intent, target }
}

function startTracking(target: StartTrackingIntent['target']): StartTrackingIntent {
  return { type: 'START_TRACKING', target, transcript: 'start tracking', confidence: 0.9 }
}

describe('namesTarget', () => {
  it('is true when the speaker named something', () => {
    expect(namesTarget(command(startTracking(namedTarget('goal', 'deen')), null))).toBe(true)
  })

  it('is false when the command was complete without one', () => {
    expect(namesTarget(command(startTracking(NO_TARGET), null))).toBe(false)
  })
})

describe('isUnresolved', () => {
  it('is true when a named target matched nothing', () => {
    expect(isUnresolved(command(startTracking(namedTarget('goal', 'deen')), null))).toBe(true)
  })

  it('is false once the name has been matched to a record', () => {
    expect(isUnresolved(command(startTracking(namedTarget('goal', 'deen')), RESOLVED))).toBe(false)
  })

  it('is false for a command that never named anything', () => {
    expect(isUnresolved(command(startTracking(NO_TARGET), null))).toBe(false)
  })

  it('is false for an unknown command, which has nothing to resolve', () => {
    expect(isUnresolved(command(unknownIntent('mumble'), null))).toBe(false)
  })
})
