import { describe, expect, it } from 'vitest'

import { intentTarget } from '../../domain/index.js'
import { RuleBasedIntentParser } from './intent-parser.js'

describe('RuleBasedIntentParser', () => {
  it('parses a transcript into an intent', async () => {
    const parser = new RuleBasedIntentParser()
    const intent = await parser.parse('start tracking my deen goal')

    expect(intent.type).toBe('START_TRACKING')
    expect(intentTarget(intent)).toEqual({ kind: 'goal', name: 'deen' })
  })

  it('answers with UNKNOWN instead of throwing on an unparseable transcript', async () => {
    const parser = new RuleBasedIntentParser()

    await expect(parser.parse('what time is it')).resolves.toMatchObject({ type: 'UNKNOWN' })
  })

  it('applies the options it was constructed with to every call', async () => {
    const parser = new RuleBasedIntentParser({ wakeWords: ['jiffy'] })

    await expect(parser.parse('jiffy stop')).resolves.toMatchObject({ type: 'STOP_TRACKING' })
    await expect(parser.parse('jiffy pause')).resolves.toMatchObject({ type: 'PAUSE' })
  })
})
