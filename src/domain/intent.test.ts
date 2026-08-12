import { describe, expect, it } from 'vitest'

import {
  clampConfidence,
  describeIntent,
  hasNamedTarget,
  INTENT_TYPES,
  intentTarget,
  isActionable,
  isIntentType,
  unknownIntent,
  type LogTimeIntent,
  type StartTrackingIntent,
  type StopTrackingIntent,
} from './intent.js'
import { namedTarget, NO_TARGET, type IntentTarget } from './target.js'

function startTracking(target: IntentTarget = NO_TARGET): StartTrackingIntent {
  return { type: 'START_TRACKING', target, transcript: 'start tracking', confidence: 0.9 }
}

function logTime(durationMinutes: number, target: IntentTarget = NO_TARGET): LogTimeIntent {
  return { type: 'LOG_TIME', target, durationMinutes, transcript: 'log time', confidence: 0.9 }
}

describe('isIntentType', () => {
  it('accepts every declared type', () => {
    for (const type of INTENT_TYPES) {
      expect(isIntentType(type)).toBe(true)
    }
  })

  it('rejects anything else, including near misses', () => {
    expect(isIntentType('start_tracking')).toBe(false)
    expect(isIntentType('START')).toBe(false)
    expect(isIntentType(undefined)).toBe(false)
  })
})

describe('clampConfidence', () => {
  it('leaves a value inside the range alone', () => {
    expect(clampConfidence(0.75)).toBe(0.75)
  })

  it('clamps out-of-range values to the ends', () => {
    expect(clampConfidence(1.4)).toBe(1)
    expect(clampConfidence(-0.2)).toBe(0)
  })

  it('rounds to two decimals so scores stay comparable', () => {
    expect(clampConfidence(0.8333333)).toBe(0.83)
  })

  it('treats non-finite input as no confidence at all', () => {
    expect(clampConfidence(Number.NaN)).toBe(0)
    expect(clampConfidence(Number.POSITIVE_INFINITY)).toBe(0)
    expect(clampConfidence(Number.NEGATIVE_INFINITY)).toBe(0)
  })
})

describe('unknownIntent', () => {
  it('keeps the transcript so the host can show what was heard', () => {
    expect(unknownIntent('do a barrel roll').transcript).toBe('do a barrel roll')
  })

  it('defaults to zero confidence', () => {
    expect(unknownIntent('do a barrel roll').confidence).toBe(0)
  })

  it('clamps a supplied confidence', () => {
    expect(unknownIntent('anything', 5).confidence).toBe(1)
  })
})

describe('isActionable', () => {
  it('is true for a parsed command', () => {
    expect(isActionable(startTracking())).toBe(true)
  })

  it('is false for an unknown command', () => {
    expect(isActionable(unknownIntent('mumble'))).toBe(false)
  })
})

describe('hasNamedTarget', () => {
  it('is true when the speaker named something', () => {
    expect(hasNamedTarget(startTracking(namedTarget('goal', 'deen')))).toBe(true)
  })

  it('is false when the command carries no target', () => {
    expect(hasNamedTarget(startTracking())).toBe(false)
  })

  it('is false for an unknown command, which has no target field at all', () => {
    expect(hasNamedTarget(unknownIntent('mumble'))).toBe(false)
  })

  it('narrows the target so the name is reachable without a cast', () => {
    const intent = startTracking(namedTarget('goal', 'deen'))
    if (!hasNamedTarget(intent)) throw new Error('expected a named target')
    expect(intent.target.name).toBe('deen')
  })
})

describe('intentTarget', () => {
  it('returns the target of an actionable intent', () => {
    expect(intentTarget(startTracking(namedTarget('task', 'invoices')))).toEqual({
      kind: 'task',
      name: 'invoices',
    })
  })

  it('returns no target for an unknown intent', () => {
    expect(intentTarget(unknownIntent('mumble'))).toEqual(NO_TARGET)
  })
})

describe('describeIntent', () => {
  it('describes a bare command', () => {
    const stop: StopTrackingIntent = {
      type: 'STOP_TRACKING',
      target: NO_TARGET,
      transcript: 'stop',
      confidence: 0.95,
    }
    expect(describeIntent(stop)).toBe('stop tracking')
  })

  it('describes a command with a target', () => {
    expect(describeIntent(startTracking(namedTarget('goal', 'deen')))).toBe(
      'start tracking goal "deen"',
    )
  })

  it('describes a logged duration in readable units', () => {
    expect(describeIntent(logTime(90, namedTarget('goal', 'deen')))).toBe(
      'log 1h 30m to goal "deen"',
    )
  })

  it('describes a logged duration with no target', () => {
    expect(describeIntent(logTime(30))).toBe('log 30m')
  })

  it('describes an unknown command without pretending to know more', () => {
    expect(describeIntent(unknownIntent('what time is it'))).toBe('unknown command')
  })
})
