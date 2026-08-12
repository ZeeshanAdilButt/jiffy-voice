import {
  FuzzyTargetResolver,
  type FuzzyTargetResolverOptions,
  type TargetCandidateSource,
} from './adapters/fuzzy/index.js'
import {
  RuleBasedIntentParser,
  type KindWordOverrides,
  type Vocabulary,
} from './adapters/rule-based/index.js'
import {
  fallbackFor,
  toOutcome,
  VoiceCommandService,
  type ConfidencePolicy,
  type VoiceOutcome,
} from './core/index.js'
import type { VoiceCommand } from './domain/index.js'
import type {
  AudioClip,
  IntentParser,
  SpeechToText,
  TargetCandidate,
  TargetResolver,
  TranscriptionResult,
} from './ports/index.js'

export interface EmbeddedVoiceConfig {
  /**
   * Candidates for the built-in resolver. A function is called on every
   * command, which is what you want when the set of things worth matching
   * against changes as the user works. Without this and without `resolver`,
   * commands carry the spoken name and no record.
   */
  readonly candidates?: readonly TargetCandidate[] | TargetCandidateSource
  /** Required only to accept audio. Text works without one. */
  readonly speechToText?: SpeechToText
  /** Replaces the rule-based parser. `wakeWords` then no longer applies. */
  readonly parser?: IntentParser
  /** Replaces the fuzzy resolver. `candidates` and `matching` then no longer apply. */
  readonly resolver?: TargetResolver
  /** Below this, a command is reported as UNKNOWN. Defaults to 0. */
  readonly minConfidence?: number
  /** Words your app is addressed by, stripped off the front of an utterance. */
  readonly wakeWords?: readonly string[]
  /**
   * What your users call each kind of thing, merged over the built-in set
   * and used by both built-in adapters. A null value drops a built-in word.
   */
  readonly kindWords?: KindWordOverrides
  /** Phrasings and filler on top of the built-in table. */
  readonly vocabulary?: Vocabulary
  /** Thresholds for the built-in resolver. */
  readonly matching?: Pick<FuzzyTargetResolverOptions, 'minScore' | 'ambiguityMargin'>
  /**
   * Where the lines sit between running a command, asking about it, and
   * handing it on.
   */
  readonly policy?: ConfidencePolicy
}

export interface EmbeddedVoice {
  readonly voice: VoiceCommandService
  /**
   * The fast path. Answers for anything it is sure of and hands everything
   * else back as a fallback carrying the transcript. Total over transcripts:
   * it does not throw because of what was said, only because something it
   * depends on broke.
   *
   * Takes a whole TranscriptionResult as well as a bare string, so a live
   * recognizer's alternatives are not thrown away on the way in. A reading
   * that does not parse falls through to the next one.
   */
  interpret(input: string | TranscriptionResult): Promise<VoiceOutcome>
  interpretAudio(clip: AudioClip): Promise<VoiceOutcome>
  /** What matched, without the judgement about what to do with it. */
  handleText(transcript: string): Promise<VoiceCommand>
  handleAudio(clip: AudioClip): Promise<VoiceCommand>
}

function buildResolver(config: EmbeddedVoiceConfig): TargetResolver | undefined {
  if (config.resolver !== undefined) return config.resolver
  if (config.candidates === undefined) return undefined

  return new FuzzyTargetResolver(config.candidates, {
    ...config.matching,
    kindWords: config.kindWords,
  })
}

/**
 * Wires the shipped adapters into one object for embedding directly in a
 * host process: no HTTP, no network hop, just calls against whatever the
 * host passes in. Every part is replaceable, and a config of nothing but a
 * candidate list is enough to start.
 */
export function createEmbeddedVoice(config: EmbeddedVoiceConfig = {}): EmbeddedVoice {
  const parser =
    config.parser ??
    new RuleBasedIntentParser({
      wakeWords: config.wakeWords,
      kindWords: config.kindWords,
      vocabulary: config.vocabulary,
    })

  const voice = new VoiceCommandService({
    parser,
    resolver: buildResolver(config),
    speechToText: config.speechToText,
    minConfidence: config.minConfidence,
    policy: config.policy,
  })

  return {
    voice,

    interpret: async (input) => {
      if (typeof input !== 'string') return toOutcome(await voice.decideHeard(input))
      if (input.trim().length === 0) return fallbackFor(input, 'nothing-heard')

      return toOutcome(await voice.decideText(input))
    },

    interpretAudio: async (clip) => toOutcome(await voice.decideAudio(clip)),

    handleText: (transcript) => voice.handleText(transcript),
    handleAudio: (clip) => voice.handleAudio(clip),
  }
}
