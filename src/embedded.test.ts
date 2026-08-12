import { describe, expect, it } from 'vitest'

import { SpeechToTextUnavailableError } from './core/index.js'
import { intentTarget, type VoiceIntent } from './domain/index.js'
import { createEmbeddedVoice } from './embedded.js'
import type {
  AudioClip,
  IntentParser,
  SpeechToText,
  TargetCandidate,
  TargetResolver,
  TranscriptionResult,
} from './ports/index.js'

const CLIP: AudioClip = { data: new Uint8Array([1]), mimeType: 'audio/webm' }

const CANDIDATES: readonly TargetCandidate[] = [
  { id: 'goal_1', name: 'Deen', kind: 'goal', aliases: ['Islamic Studies'] },
  { id: 'goal_2', name: 'Fitness', kind: 'goal' },
  { id: 'task_1', name: 'Invoices', kind: 'task' },
]

class FixedSpeechToText implements SpeechToText {
  constructor(private readonly transcript: string) {}

  async transcribe(): Promise<TranscriptionResult> {
    return { transcript: this.transcript, confidence: 0.9 }
  }
}

describe('createEmbeddedVoice', () => {
  it('works with nothing configured at all', async () => {
    const voice = createEmbeddedVoice()

    const command = await voice.handleText('stop tracking')
    expect(command.intent.type).toBe('STOP_TRACKING')
  })

  it('resolves against a candidate list', async () => {
    const voice = createEmbeddedVoice({ candidates: CANDIDATES })

    const command = await voice.handleText('start tracking time for my deen goal')
    expect(command.intent.type).toBe('START_TRACKING')
    expect(command.target).toMatchObject({ id: 'goal_1', name: 'Deen' })
  })

  it('resolves against a candidate function, asked again on every command', async () => {
    let available: readonly TargetCandidate[] = []
    const voice = createEmbeddedVoice({ candidates: () => available })

    await expect(voice.handleText('start tracking deen')).resolves.toMatchObject({ target: null })
    available = CANDIDATES
    await expect(voice.handleText('start tracking deen')).resolves.toMatchObject({
      target: { id: 'goal_1' },
    })
  })

  it('leaves the target unresolved when no candidates were supplied', async () => {
    const voice = createEmbeddedVoice()

    const command = await voice.handleText('start tracking deen')
    expect(intentTarget(command.intent)).toEqual({ kind: 'unspecified', name: 'deen' })
    expect(command.target).toBeNull()
  })

  it('transcribes audio when a recognizer is configured', async () => {
    const voice = createEmbeddedVoice({
      candidates: CANDIDATES,
      speechToText: new FixedSpeechToText('start tracking my deen goal'),
    })

    const command = await voice.handleAudio(CLIP)
    expect(command.intent.type).toBe('START_TRACKING')
    expect(command.target).toMatchObject({ id: 'goal_1' })
  })

  it('refuses audio when no recognizer is configured', async () => {
    await expect(createEmbeddedVoice().handleAudio(CLIP)).rejects.toBeInstanceOf(
      SpeechToTextUnavailableError,
    )
  })

  describe('configuration', () => {
    it('passes wake words to the built-in parser', async () => {
      const voice = createEmbeddedVoice({ wakeWords: ['jiffy'] })

      await expect(voice.handleText('jiffy stop')).resolves.toMatchObject({
        intent: { type: 'STOP_TRACKING' },
      })
    })

    it('passes kind words to both built-in adapters', async () => {
      const voice = createEmbeddedVoice({
        candidates: CANDIDATES,
        kindWords: { client: 'goal' },
      })

      const command = await voice.handleText('start tracking the deen client')
      expect(intentTarget(command.intent)).toEqual({ kind: 'goal', name: 'deen' })
      expect(command.target).toMatchObject({ id: 'goal_1' })
    })

    it('passes match thresholds to the built-in resolver', async () => {
      const strict = createEmbeddedVoice({ candidates: CANDIDATES, matching: { minScore: 0.99 } })

      await expect(strict.handleText('start tracking my dean goal')).resolves.toMatchObject({
        target: null,
      })
    })

    it('applies a confidence floor', async () => {
      const voice = createEmbeddedVoice({ minConfidence: 0.9 })

      await expect(voice.handleText('done')).resolves.toMatchObject({
        intent: { type: 'UNKNOWN' },
      })
    })
  })

  describe('replacing the defaults', () => {
    it('uses a supplied parser instead of the rule-based one', async () => {
      const parser: IntentParser = {
        async parse(transcript): Promise<VoiceIntent> {
          return { type: 'PAUSE', target: { kind: 'none' }, transcript, confidence: 1 }
        },
      }

      const voice = createEmbeddedVoice({ parser })
      await expect(voice.handleText('anything at all')).resolves.toMatchObject({
        intent: { type: 'PAUSE' },
      })
    })

    it('uses a supplied resolver instead of the fuzzy one', async () => {
      const resolver: TargetResolver = {
        async resolve(target) {
          return { id: 'from_host', name: target.name, kind: 'goal', score: 1, matchedOn: 'host' }
        },
      }

      const voice = createEmbeddedVoice({ candidates: CANDIDATES, resolver })
      await expect(voice.handleText('start tracking deen')).resolves.toMatchObject({
        target: { id: 'from_host' },
      })
    })
  })

  it('exposes the underlying service for anything the shortcuts do not cover', async () => {
    const voice = createEmbeddedVoice({ candidates: CANDIDATES })

    await expect(voice.voice.handleText('stop tracking')).resolves.toMatchObject({
      intent: { type: 'STOP_TRACKING' },
    })
  })
})
