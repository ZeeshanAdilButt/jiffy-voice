import {
  clampConfidence,
  hasNamedTarget,
  isActionable,
  unknownIntent,
  type VoiceCommand,
  type VoiceIntent,
} from '../domain/index.js'
import type {
  AudioClip,
  IntentParser,
  SpeechToText,
  TargetResolver,
  TranscriptAlternative,
} from '../ports/index.js'
import {
  EmptyTranscriptError,
  SpeechToTextUnavailableError,
  TargetResolutionFailedError,
  TranscriptionFailedError,
} from './errors.js'

export interface VoiceCommandServiceOptions {
  readonly parser: IntentParser
  /** Without one, commands come back with the spoken name but no record. */
  readonly resolver?: TargetResolver
  /** Required only to accept audio. Text works without it. */
  readonly speechToText?: SpeechToText
  /**
   * Anything scoring below this is reported as UNKNOWN rather than acted on.
   * Defaults to 0, which acts on everything the parser recognized and leaves
   * the judgement to the host.
   */
  readonly minConfidence?: number
}

/**
 * A recognizer that reports zero is almost always saying it does not score
 * its output, not that it is certain the words are wrong. Taking it at face
 * value would multiply every command down to nothing, so an unusable score
 * is treated as no signal instead of as a bad one.
 */
function usableConfidence(reported: number): number {
  return Number.isFinite(reported) && reported > 0 ? clampConfidence(reported) : 1
}

/**
 * Audio or text in, a resolved command out. Depends on nothing but the
 * ports, so the same instance works against a cloud recognizer in
 * production and against fakes in a test with no change to what it does.
 */
export class VoiceCommandService {
  private readonly parser: IntentParser
  private readonly resolver: TargetResolver | undefined
  private readonly speechToText: SpeechToText | undefined
  private readonly minConfidence: number

  constructor(options: VoiceCommandServiceOptions) {
    this.parser = options.parser
    this.resolver = options.resolver
    this.speechToText = options.speechToText
    this.minConfidence = clampConfidence(options.minConfidence ?? 0)
  }

  async handleText(transcript: string): Promise<VoiceCommand> {
    if (transcript.trim().length === 0) throw new EmptyTranscriptError()

    return this.resolveCommand(await this.interpret(transcript, 1))
  }

  async handleAudio(clip: AudioClip): Promise<VoiceCommand> {
    if (this.speechToText === undefined) throw new SpeechToTextUnavailableError()

    let heard
    try {
      heard = await this.speechToText.transcribe(clip)
    } catch (error) {
      throw new TranscriptionFailedError(error)
    }

    const readings: readonly TranscriptAlternative[] = [
      { transcript: heard.transcript, confidence: heard.confidence },
      ...(heard.alternatives ?? []),
    ]

    let firstReading: VoiceIntent | null = null

    // A recognizer's second guess is often the one that parses, and trying
    // it costs a table lookup. The first reading is still what gets reported
    // if none of them parse, since it is what the recognizer believed.
    for (const reading of readings) {
      if (reading.transcript.trim().length === 0) continue

      const intent = await this.interpret(reading.transcript, reading.confidence)
      if (isActionable(intent)) return this.resolveCommand(intent)

      firstReading ??= intent
    }

    return { intent: firstReading ?? unknownIntent(heard.transcript), target: null }
  }

  private async interpret(transcript: string, transcribed: number): Promise<VoiceIntent> {
    const parsed = await this.parser.parse(transcript)

    // Two independent chances to be wrong: mishearing the words, and
    // misreading the words that were heard. Multiplying is the honest
    // combination of the two.
    const confidence = clampConfidence(parsed.confidence * usableConfidence(transcribed))

    if (confidence < this.minConfidence) return unknownIntent(transcript, confidence)

    return { ...parsed, confidence }
  }

  private async resolveCommand(intent: VoiceIntent): Promise<VoiceCommand> {
    if (this.resolver === undefined || !hasNamedTarget(intent)) {
      return { intent, target: null }
    }

    try {
      const target = await this.resolver.resolve(intent.target, {
        intentType: intent.type,
        transcript: intent.transcript,
      })
      return { intent, target }
    } catch (error) {
      throw new TargetResolutionFailedError(intent.target.name, error)
    }
  }
}
