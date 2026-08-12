import {
  FuzzyTargetResolver,
  type FuzzyTargetResolverOptions,
  type TargetCandidateSource,
} from './adapters/fuzzy/index.js'
import { RuleBasedIntentParser } from './adapters/rule-based/index.js'
import { VoiceCommandService, type ConfidencePolicy } from './core/index.js'
import type { TargetKind, VoiceCommand } from './domain/index.js'
import type {
  AudioClip,
  IntentParser,
  SpeechToText,
  TargetCandidate,
  TargetResolver,
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
  /** What your users call each kind of thing. Used by both built-in adapters. */
  readonly kindWords?: Readonly<Record<string, TargetKind>>
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
    new RuleBasedIntentParser({ wakeWords: config.wakeWords, kindWords: config.kindWords })

  const voice = new VoiceCommandService({
    parser,
    resolver: buildResolver(config),
    speechToText: config.speechToText,
    minConfidence: config.minConfidence,
    policy: config.policy,
  })

  return {
    voice,
    handleText: (transcript) => voice.handleText(transcript),
    handleAudio: (clip) => voice.handleAudio(clip),
  }
}
