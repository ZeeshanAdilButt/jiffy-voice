import { describe, expect, it } from 'vitest'

import { isFallback, TargetResolutionFailedError } from './core/index.js'
import { createEmbeddedVoice } from './embedded.js'
import type {
  AudioClip,
  SpeechToText,
  TargetCandidate,
  TranscriptionResult,
} from './ports/index.js'

const CANDIDATES: readonly TargetCandidate[] = [
  { id: 'goal_1', name: 'Deen', kind: 'goal' },
  { id: 'goal_2', name: 'Fitness', kind: 'goal' },
]

const CLIP: AudioClip = { data: new Uint8Array([1]), mimeType: 'audio/webm' }

function voice() {
  return createEmbeddedVoice({ candidates: CANDIDATES })
}

describe('interpret', () => {
  it('answers a command it is sure of', async () => {
    const outcome = await voice().interpret('start tracking time for my deen goal')

    expect(outcome).toMatchObject({ kind: 'command', target: { id: 'goal_1' } })
  })

  it('asks about one it is not sure of', async () => {
    const outcome = await voice().interpret('done')

    expect(outcome.kind).toBe('confirm')
  })

  it('hands on an utterance meant for something smarter', async () => {
    const outcome = await voice().interpret('how much time did i spend on deen last week')

    expect(outcome).toMatchObject({
      kind: 'fallback',
      transcript: 'how much time did i spend on deen last week',
    })
  })

  it('hands on a command whose target it has never heard of', async () => {
    const outcome = await voice().interpret('start tracking my gardening goal')

    expect(outcome).toMatchObject({ kind: 'fallback', reason: 'no-matching-target' })
  })

  it('keeps the transcript exactly as it arrived, for forwarding', async () => {
    const said = 'Book me a flight to Karachi.'
    const outcome = await voice().interpret(said)

    expect(isFallback(outcome) && outcome.transcript).toBe(said)
  })

  describe('is total over transcripts', () => {
    const inputs = [
      '',
      '   ',
      'um',
      'what time is it',
      'start tracking',
      'log 30 minutes to deen',
      'delete everything',
      '!!!',
    ]

    it.each(inputs)('answers rather than throwing for %j', async (said) => {
      await expect(voice().interpret(said)).resolves.toHaveProperty('kind')
    })

    it('reports nothing at all as having heard nothing', async () => {
      await expect(voice().interpret('')).resolves.toMatchObject({
        kind: 'fallback',
        reason: 'nothing-heard',
      })
    })
  })

  it('still throws when something it depends on breaks', async () => {
    const broken = createEmbeddedVoice({
      resolver: {
        async resolve() {
          throw new Error('lookup is down')
        },
      },
    })

    await expect(broken.interpret('start tracking deen')).rejects.toBeInstanceOf(
      TargetResolutionFailedError,
    )
  })
})

describe('interpretAudio', () => {
  class FixedSpeechToText implements SpeechToText {
    constructor(private readonly transcript: string) {}

    async transcribe(): Promise<TranscriptionResult> {
      return { transcript: this.transcript, confidence: 0.9 }
    }
  }

  it('answers a spoken command', async () => {
    const spoken = createEmbeddedVoice({
      candidates: CANDIDATES,
      speechToText: new FixedSpeechToText('start tracking my deen goal'),
    })

    await expect(spoken.interpretAudio(CLIP)).resolves.toMatchObject({
      kind: 'command',
      target: { id: 'goal_1' },
    })
  })

  it('reports silence as having heard nothing', async () => {
    const silent = createEmbeddedVoice({
      candidates: CANDIDATES,
      speechToText: new FixedSpeechToText(''),
    })

    await expect(silent.interpretAudio(CLIP)).resolves.toMatchObject({
      kind: 'fallback',
      reason: 'nothing-heard',
    })
  })
})
