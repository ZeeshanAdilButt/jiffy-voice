import { hasNamedTarget, type ResolvedTarget, type VoiceIntent } from '../domain/index.js'

export type DecisionKind = 'confident' | 'needs-confirmation' | 'unresolved'

export type DecisionReason =
  | 'unrecognized-command'
  | 'low-intent-confidence'
  | 'no-matching-target'
  | 'ambiguous-target'
  | 'low-target-score'

export interface CommandDecision {
  readonly kind: DecisionKind
  readonly intent: VoiceIntent
  /** The record to act on. Null whenever acting would be a guess. */
  readonly target: ResolvedTarget | null
  /**
   * Ranked candidates for the spoken name, best first, capped by the policy.
   * Populated even for a confident decision, so "no, the other one" is
   * answerable without resolving again.
   */
  readonly options: readonly ResolvedTarget[]
  /** Why this is not confident. Null when it is. */
  readonly reason: DecisionReason | null
}

/**
 * Where the lines sit between running a command, asking about it, and
 * refusing it. Every default here is a judgement about cost: starting a
 * timer on the wrong goal is cheap to undo and expensive to interrupt for,
 * which is why the bar for asking is set low and the bar for refusing is set
 * lower still.
 */
export interface ConfidencePolicy {
  /** At or above this, run the command without asking. */
  readonly autoIntentConfidence?: number
  /** Below this, the command is not worth confirming either. */
  readonly minIntentConfidence?: number
  /** At or above this, use the matched record without asking. */
  readonly autoTargetScore?: number
  /** A runner-up this close to the winner means the audio did not choose. */
  readonly ambiguityMargin?: number
  /** How many candidates to carry for a "which one" prompt. */
  readonly maxOptions?: number
}

export const DEFAULT_CONFIDENCE_POLICY: Required<ConfidencePolicy> = {
  autoIntentConfidence: 0.8,
  minIntentConfidence: 0.5,
  autoTargetScore: 0.8,
  ambiguityMargin: 0.05,
  maxOptions: 3,
}

export interface DecisionInput {
  readonly intent: VoiceIntent
  /** Candidates for the spoken name, best first. Empty when none matched. */
  readonly options: readonly ResolvedTarget[]
}

function decision(
  kind: DecisionKind,
  intent: VoiceIntent,
  target: ResolvedTarget | null,
  options: readonly ResolvedTarget[],
  reason: DecisionReason | null,
): CommandDecision {
  return { kind, intent, target, options, reason }
}

/**
 * Sorts one understood utterance into run it, ask about it, or hand it on.
 *
 * Pure, so a host can re-run it against a different policy or a freshly
 * loaded candidate list without going back through recognition.
 */
export function classifyCommand(
  input: DecisionInput,
  policy: ConfidencePolicy = {},
): CommandDecision {
  const {
    autoIntentConfidence,
    minIntentConfidence,
    autoTargetScore,
    ambiguityMargin,
    maxOptions,
  } = { ...DEFAULT_CONFIDENCE_POLICY, ...policy }

  const { intent } = input
  const options = input.options.slice(0, Math.max(maxOptions, 0))

  if (intent.type === 'UNKNOWN') {
    return decision('unresolved', intent, null, [], 'unrecognized-command')
  }

  if (intent.confidence < minIntentConfidence) {
    return decision('unresolved', intent, null, options, 'low-intent-confidence')
  }

  let target: ResolvedTarget | null = null

  if (hasNamedTarget(intent)) {
    const best = options[0]
    if (best === undefined) {
      return decision('unresolved', intent, null, [], 'no-matching-target')
    }

    const runnerUp = options[1]
    if (
      runnerUp !== undefined &&
      runnerUp.id !== best.id &&
      best.score - runnerUp.score < ambiguityMargin
    ) {
      // Deliberately no target: the whole point of this branch is that the
      // recording did not pick one, so neither does this.
      return decision('needs-confirmation', intent, null, options, 'ambiguous-target')
    }

    if (best.score < autoTargetScore) {
      return decision('needs-confirmation', intent, best, options, 'low-target-score')
    }

    target = best
  }

  if (intent.confidence < autoIntentConfidence) {
    return decision('needs-confirmation', intent, target, options, 'low-intent-confidence')
  }

  return decision('confident', intent, target, options, null)
}
