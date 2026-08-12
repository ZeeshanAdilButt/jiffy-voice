import {
  clampConfidence,
  hasNamedTarget,
  isActionable,
  unknownIntent,
  type ActionableIntent,
  type ResolvedTarget,
  type VoiceCommand,
  type VoiceIntent,
} from '../domain/index.js'
import type {
  AudioClip,
  IntentParser,
  ResolveContext,
  SpeechToText,
  TargetResolver,
  TranscriptAlternative,
  TranscriptionResult,
} from '../ports/index.js'
import { classifyCommand, type CommandDecision, type ConfidencePolicy } from './decision.js'
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
  /**
   * Where the lines sit between running a command, asking about it, and
   * handing it on. Only consulted by the decide methods.
   */
  readonly policy?: ConfidencePolicy
}

/**
 * A recognizer that reports zero is almost always saying it does not score
 * its output, not that it is certain the words are wrong. Taking it at face
 * value would drag every command to nothing, so an unusable score is
 * treated as no signal instead of as a bad one.
 */
function usableConfidence(reported: number): number {
  return Number.isFinite(reported) && reported > 0 ? clampConfidence(reported) : 1
}

/**
 * How well it was heard and how well it parsed, as one number.
 *
 * Hearing a phrase clearly does not make an ambiguous phrase less
 * ambiguous, so the recognizer can only lower the parser's score, never
 * raise it. Below that ceiling the two are averaged geometrically rather
 * than multiplied, because they are two estimates of the same thing and not
 * two gates that both have to pass. Multiplying throws away commands that
 * were understood perfectly well and merely heard at half confidence, which
 * is most of what a phone in a pocket produces.
 */
function combine(parsed: number, transcribed: number): number {
  return Math.min(parsed, Math.sqrt(parsed * transcribed))
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
  private readonly policy: ConfidencePolicy

  constructor(options: VoiceCommandServiceOptions) {
    this.parser = options.parser
    this.resolver = options.resolver
    this.speechToText = options.speechToText
    this.minConfidence = clampConfidence(options.minConfidence ?? 0)
    this.policy = options.policy ?? {}
  }

  async handleText(transcript: string): Promise<VoiceCommand> {
    if (transcript.trim().length === 0) throw new EmptyTranscriptError()

    return this.resolveCommand(await this.interpret(transcript, 1))
  }

  async handleAudio(clip: AudioClip): Promise<VoiceCommand> {
    return this.resolveCommand(await this.hear(clip))
  }

  /**
   * What to do about the utterance, rather than only what matched in it.
   * Uses the resolver's ranking where it has one, so a near miss comes back
   * as a short list to choose from instead of as nothing.
   */
  async decideText(transcript: string): Promise<CommandDecision> {
    if (transcript.trim().length === 0) throw new EmptyTranscriptError()

    return this.decide(await this.interpret(transcript, 1))
  }

  async decideAudio(clip: AudioClip): Promise<CommandDecision> {
    return this.decide(await this.hear(clip))
  }

  /**
   * For a transcript that arrived from a live recognizer, which has already
   * done the transcribing but still has alternatives worth trying.
   */
  async decideHeard(heard: TranscriptionResult): Promise<CommandDecision> {
    return this.decide(await this.readBest(heard))
  }

  private async decide(intent: VoiceIntent): Promise<CommandDecision> {
    return classifyCommand({ intent, options: await this.rankTargets(intent) }, this.policy)
  }

  /** Transcribe, then read the best sense anything heard can be made of. */
  private async hear(clip: AudioClip): Promise<VoiceIntent> {
    if (this.speechToText === undefined) throw new SpeechToTextUnavailableError()

    let heard: TranscriptionResult
    try {
      heard = await this.speechToText.transcribe(clip)
    } catch (error) {
      throw new TranscriptionFailedError(error)
    }

    return this.readBest(heard)
  }

  private async readBest(heard: TranscriptionResult): Promise<VoiceIntent> {
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
      if (isActionable(intent)) return intent

      firstReading ??= intent
    }

    return firstReading ?? unknownIntent(heard.transcript)
  }

  private async interpret(transcript: string, transcribed: number): Promise<VoiceIntent> {
    const parsed = await this.parser.parse(transcript)

    const confidence = clampConfidence(combine(parsed.confidence, usableConfidence(transcribed)))

    if (confidence < this.minConfidence) return unknownIntent(transcript, confidence)

    return { ...parsed, confidence }
  }

  private async resolveCommand(intent: VoiceIntent): Promise<VoiceCommand> {
    const resolver = this.resolver
    if (resolver === undefined || !hasNamedTarget(intent)) {
      return { intent, target: null }
    }

    try {
      const target = await resolver.resolve(intent.target, this.contextFor(intent))
      return { intent, target }
    } catch (error) {
      throw new TargetResolutionFailedError(intent.target.name, error)
    }
  }

  private async rankTargets(intent: VoiceIntent): Promise<readonly ResolvedTarget[]> {
    const resolver = this.resolver
    if (resolver === undefined || !hasNamedTarget(intent)) return []

    try {
      // A resolver that can only answer yes or no still contributes: its one
      // answer is a list of one, and the policy reads it the same way.
      if (resolver.rank !== undefined) {
        return await resolver.rank(intent.target, this.contextFor(intent))
      }

      const match = await resolver.resolve(intent.target, this.contextFor(intent))
      return match === null ? [] : [match]
    } catch (error) {
      throw new TargetResolutionFailedError(intent.target.name, error)
    }
  }

  private contextFor(intent: ActionableIntent): ResolveContext {
    return { intentType: intent.type, transcript: intent.transcript }
  }
}
