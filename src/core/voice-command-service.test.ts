import { describe, expect, it } from 'vitest'

import { FuzzyTargetResolver } from '../adapters/fuzzy/index.js'
import { RuleBasedIntentParser } from '../adapters/rule-based/index.js'
import { namedTarget, NO_TARGET, type NamedTarget, type VoiceIntent } from '../domain/index.js'
import type {
  AudioClip,
  IntentParser,
  ResolveContext,
  SpeechToText,
  TargetCandidate,
  TargetResolver,
  TranscriptionResult,
} from '../ports/index.js'
import {
  EmptyTranscriptError,
  SpeechToTextUnavailableError,
  TargetResolutionFailedError,
  TranscriptionFailedError,
} from './errors.js'
import { VoiceCommandService } from './voice-command-service.js'

const CLIP: AudioClip = { data: new Uint8Array([1, 2, 3]), mimeType: 'audio/webm' }

const CANDIDATES: readonly TargetCandidate[] = [
  { id: 'goal_1', name: 'Deen', kind: 'goal' },
  { id: 'goal_2', name: 'Fitness', kind: 'goal' },
]

function startTracking(name: string | null, confidence = 0.9): VoiceIntent {
  return {
    type: 'START_TRACKING',
    target: name === null ? NO_TARGET : namedTarget('goal', name),
    transcript: name === null ? 'start tracking' : `start tracking ${name}`,
    confidence,
  }
}

class StubParser implements IntentParser {
  readonly seen: string[] = []

  constructor(private readonly answers: ReadonlyMap<string, VoiceIntent>) {}

  async parse(transcript: string): Promise<VoiceIntent> {
    this.seen.push(transcript)
    return this.answers.get(transcript) ?? { type: 'UNKNOWN', transcript, confidence: 0 }
  }
}

class ScriptedSpeechToText implements SpeechToText {
  constructor(private readonly result: TranscriptionResult | Error) {}

  async transcribe(): Promise<TranscriptionResult> {
    if (this.result instanceof Error) throw this.result
    return this.result
  }
}

class RecordingResolver implements TargetResolver {
  readonly calls: Array<{ target: NamedTarget; context: ResolveContext | undefined }> = []

  async resolve(target: NamedTarget, context?: ResolveContext) {
    this.calls.push({ target, context })
    return {
      id: `id_${target.name}`,
      name: target.name,
      kind: 'goal' as const,
      score: 1,
      matchedOn: target.name,
    }
  }
}

class FailingResolver implements TargetResolver {
  async resolve(): Promise<never> {
    throw new Error('database is down')
  }
}

function parserFor(...intents: readonly VoiceIntent[]): StubParser {
  return new StubParser(new Map(intents.map((intent) => [intent.transcript, intent])))
}

describe('handleText', () => {
  it('parses a transcript into a command', async () => {
    const service = new VoiceCommandService({ parser: parserFor(startTracking(null)) })

    const command = await service.handleText('start tracking')
    expect(command.intent.type).toBe('START_TRACKING')
  })

  it('resolves a named target through the resolver', async () => {
    const resolver = new RecordingResolver()
    const service = new VoiceCommandService({ parser: parserFor(startTracking('deen')), resolver })

    const command = await service.handleText('start tracking deen')
    expect(command.target).toMatchObject({ id: 'id_deen' })
  })

  it('tells the resolver which command the name came from', async () => {
    const resolver = new RecordingResolver()
    const service = new VoiceCommandService({ parser: parserFor(startTracking('deen')), resolver })

    await service.handleText('start tracking deen')
    expect(resolver.calls[0]?.context).toEqual({
      intentType: 'START_TRACKING',
      transcript: 'start tracking deen',
    })
  })

  it('does not call the resolver when nothing was named', async () => {
    const resolver = new RecordingResolver()
    const service = new VoiceCommandService({ parser: parserFor(startTracking(null)), resolver })

    const command = await service.handleText('start tracking')
    expect(resolver.calls).toEqual([])
    expect(command.target).toBeNull()
  })

  it('returns the intent with no target when no resolver is configured', async () => {
    const service = new VoiceCommandService({ parser: parserFor(startTracking('deen')) })

    const command = await service.handleText('start tracking deen')
    expect(command.intent.type).toBe('START_TRACKING')
    expect(command.target).toBeNull()
  })

  it('returns no target when the resolver matched nothing', async () => {
    const resolver: TargetResolver = { resolve: async () => null }
    const service = new VoiceCommandService({ parser: parserFor(startTracking('deen')), resolver })

    await expect(service.handleText('start tracking deen')).resolves.toMatchObject({ target: null })
  })

  it('rejects an empty transcript rather than parsing nothing', async () => {
    const service = new VoiceCommandService({ parser: parserFor() })

    await expect(service.handleText('')).rejects.toBeInstanceOf(EmptyTranscriptError)
    await expect(service.handleText('   ')).rejects.toBeInstanceOf(EmptyTranscriptError)
  })

  it('reports an unparsed command rather than throwing', async () => {
    const service = new VoiceCommandService({ parser: parserFor() })

    const command = await service.handleText('what time is it')
    expect(command.intent).toMatchObject({ type: 'UNKNOWN', transcript: 'what time is it' })
  })

  it('wraps a resolver failure, since a broken lookup is not a failed match', async () => {
    const service = new VoiceCommandService({
      parser: parserFor(startTracking('deen')),
      resolver: new FailingResolver(),
    })

    await expect(service.handleText('start tracking deen')).rejects.toBeInstanceOf(
      TargetResolutionFailedError,
    )
  })

  it('keeps the original failure as the cause', async () => {
    const service = new VoiceCommandService({
      parser: parserFor(startTracking('deen')),
      resolver: new FailingResolver(),
    })

    await expect(service.handleText('start tracking deen')).rejects.toMatchObject({
      cause: expect.objectContaining({ message: 'database is down' }),
    })
  })
})

describe('handleAudio', () => {
  it('transcribes and then parses', async () => {
    const service = new VoiceCommandService({
      parser: parserFor(startTracking('deen')),
      speechToText: new ScriptedSpeechToText({
        transcript: 'start tracking deen',
        confidence: 1,
      }),
    })

    const command = await service.handleAudio(CLIP)
    expect(command.intent.type).toBe('START_TRACKING')
  })

  it('refuses audio when no recognizer is configured', async () => {
    const service = new VoiceCommandService({ parser: parserFor() })

    await expect(service.handleAudio(CLIP)).rejects.toBeInstanceOf(SpeechToTextUnavailableError)
  })

  it('wraps a recognizer failure', async () => {
    const service = new VoiceCommandService({
      parser: parserFor(),
      speechToText: new ScriptedSpeechToText(new Error('upstream 503')),
    })

    await expect(service.handleAudio(CLIP)).rejects.toBeInstanceOf(TranscriptionFailedError)
  })

  it('reports silence as an unknown command rather than an error', async () => {
    const service = new VoiceCommandService({
      parser: parserFor(),
      speechToText: new ScriptedSpeechToText({ transcript: '', confidence: 0 }),
    })

    const command = await service.handleAudio(CLIP)
    expect(command.intent).toMatchObject({ type: 'UNKNOWN', transcript: '' })
  })

  describe('alternatives', () => {
    it('falls through to an alternative when the first reading does not parse', async () => {
      const parser = parserFor(startTracking('deen'))
      const service = new VoiceCommandService({
        parser,
        speechToText: new ScriptedSpeechToText({
          transcript: 'star tracking dean',
          confidence: 0.7,
          alternatives: [{ transcript: 'start tracking deen', confidence: 0.6 }],
        }),
      })

      const command = await service.handleAudio(CLIP)
      expect(command.intent.type).toBe('START_TRACKING')
      expect(parser.seen).toEqual(['star tracking dean', 'start tracking deen'])
    })

    it('stops at the first reading that parses', async () => {
      const parser = parserFor(startTracking('deen'))
      const service = new VoiceCommandService({
        parser,
        speechToText: new ScriptedSpeechToText({
          transcript: 'start tracking deen',
          confidence: 0.9,
          alternatives: [{ transcript: 'start tracking dean', confidence: 0.4 }],
        }),
      })

      await service.handleAudio(CLIP)
      expect(parser.seen).toEqual(['start tracking deen'])
    })

    it('reports what the recognizer believed when nothing parses', async () => {
      const service = new VoiceCommandService({
        parser: parserFor(),
        speechToText: new ScriptedSpeechToText({
          transcript: 'first guess',
          confidence: 0.5,
          alternatives: [{ transcript: 'second guess', confidence: 0.3 }],
        }),
      })

      const command = await service.handleAudio(CLIP)
      expect(command.intent).toMatchObject({ type: 'UNKNOWN', transcript: 'first guess' })
    })

    it('skips a blank alternative', async () => {
      const parser = parserFor(startTracking('deen'))
      const service = new VoiceCommandService({
        parser,
        speechToText: new ScriptedSpeechToText({
          transcript: 'nonsense',
          confidence: 0.5,
          alternatives: [
            { transcript: '  ', confidence: 0.4 },
            { transcript: 'start tracking deen', confidence: 0.3 },
          ],
        }),
      })

      await service.handleAudio(CLIP)
      expect(parser.seen).toEqual(['nonsense', 'start tracking deen'])
    })
  })

  describe('confidence', () => {
    it('combines how well it heard with how well it parsed', async () => {
      const service = new VoiceCommandService({
        parser: parserFor(startTracking('deen', 0.9)),
        speechToText: new ScriptedSpeechToText({
          transcript: 'start tracking deen',
          confidence: 0.8,
        }),
      })

      const command = await service.handleAudio(CLIP)
      expect(command.intent.confidence).toBe(0.85)
    })

    it('lets a recognizer lower the parser score but never raise it', async () => {
      const service = new VoiceCommandService({
        parser: parserFor(startTracking('deen', 0.75)),
        speechToText: new ScriptedSpeechToText({
          transcript: 'start tracking deen',
          confidence: 1,
        }),
      })

      const command = await service.handleAudio(CLIP)
      expect(command.intent.confidence).toBe(0.75)
    })

    it('keeps a well-understood command that was merely half heard', async () => {
      const service = new VoiceCommandService({
        parser: parserFor(startTracking('deen', 0.9)),
        speechToText: new ScriptedSpeechToText({
          transcript: 'start tracking deen',
          confidence: 0.5,
        }),
      })

      const command = await service.handleAudio(CLIP)
      expect(command.intent.confidence).toBeGreaterThan(0.6)
    })

    it('treats an unscored recognizer as no signal instead of as certainty of error', async () => {
      const service = new VoiceCommandService({
        parser: parserFor(startTracking('deen', 0.9)),
        speechToText: new ScriptedSpeechToText({
          transcript: 'start tracking deen',
          confidence: 0,
        }),
      })

      const command = await service.handleAudio(CLIP)
      expect(command.intent.confidence).toBe(0.9)
    })

    it('leaves a typed transcript at the parser score', async () => {
      const service = new VoiceCommandService({ parser: parserFor(startTracking('deen', 0.9)) })

      const command = await service.handleText('start tracking deen')
      expect(command.intent.confidence).toBe(0.9)
    })
  })
})

describe('minConfidence', () => {
  it('reports a command below the floor as unknown', async () => {
    const service = new VoiceCommandService({
      parser: parserFor(startTracking('deen', 0.7)),
      minConfidence: 0.8,
    })

    const command = await service.handleText('start tracking deen')
    expect(command.intent.type).toBe('UNKNOWN')
  })

  it('keeps the score and the transcript on a command it turned down', async () => {
    const service = new VoiceCommandService({
      parser: parserFor(startTracking('deen', 0.7)),
      minConfidence: 0.8,
    })

    const command = await service.handleText('start tracking deen')
    expect(command.intent).toMatchObject({ confidence: 0.7, transcript: 'start tracking deen' })
  })

  it('lets a command at the floor through', async () => {
    const service = new VoiceCommandService({
      parser: parserFor(startTracking('deen', 0.8)),
      minConfidence: 0.8,
    })

    await expect(service.handleText('start tracking deen')).resolves.toMatchObject({
      intent: { type: 'START_TRACKING' },
    })
  })

  it('does not resolve a target for a command it turned down', async () => {
    const resolver = new RecordingResolver()
    const service = new VoiceCommandService({
      parser: parserFor(startTracking('deen', 0.5)),
      resolver,
      minConfidence: 0.8,
    })

    await service.handleText('start tracking deen')
    expect(resolver.calls).toEqual([])
  })

  it('accepts everything the parser recognized by default', async () => {
    const service = new VoiceCommandService({ parser: parserFor(startTracking('deen', 0.1)) })

    await expect(service.handleText('start tracking deen')).resolves.toMatchObject({
      intent: { type: 'START_TRACKING' },
    })
  })
})

describe('against the shipped adapters', () => {
  function service(): VoiceCommandService {
    return new VoiceCommandService({
      parser: new RuleBasedIntentParser(),
      resolver: new FuzzyTargetResolver(CANDIDATES),
    })
  }

  it('takes a spoken command all the way to a record id', async () => {
    const command = await service().handleText('start tracking time for my deen goal')

    expect(command.intent.type).toBe('START_TRACKING')
    expect(command.target).toMatchObject({ id: 'goal_1', name: 'Deen' })
  })

  it('survives a misheard name', async () => {
    const command = await service().handleText('start tracking my dean goal')

    expect(command.target).toMatchObject({ id: 'goal_1' })
  })

  it('carries a logged duration through to the host', async () => {
    const command = await service().handleText('log an hour and a half to my deen goal')

    expect(command.intent).toMatchObject({ type: 'LOG_TIME', durationMinutes: 90 })
    expect(command.target).toMatchObject({ id: 'goal_1' })
  })

  it('reports a name that matched nothing without inventing one', async () => {
    const command = await service().handleText('start tracking my gardening goal')

    expect(command.intent.type).toBe('START_TRACKING')
    expect(command.target).toBeNull()
  })

  it('handles a command that names nothing', async () => {
    const command = await service().handleText('stop tracking')

    expect(command.intent.type).toBe('STOP_TRACKING')
    expect(command.target).toBeNull()
  })
})
