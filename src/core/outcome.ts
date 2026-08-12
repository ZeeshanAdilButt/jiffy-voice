import {
  isActionable,
  type ActionableIntent,
  type ResolvedTarget,
  type VoiceIntent,
} from '../domain/index.js'
import type { CommandDecision, DecisionReason } from './decision.js'

export type FallbackReason = DecisionReason | 'nothing-heard'

/** Understood well enough to run. */
export interface CommandOutcome {
  readonly kind: 'command'
  readonly intent: ActionableIntent
  readonly target: ResolvedTarget | null
  readonly decision: CommandDecision
}

/** Understood, but not well enough to run without asking first. */
export interface ConfirmOutcome {
  readonly kind: 'confirm'
  readonly intent: ActionableIntent
  /** The best guess, or null when the point is that there was no best. */
  readonly target: ResolvedTarget | null
  /** Ranked candidates, best first, for a "did you mean" prompt. */
  readonly options: readonly ResolvedTarget[]
  readonly decision: CommandDecision
}

/**
 * Not something this package should be answering. The transcript is the
 * payload: forward it to whatever handles the general case, which for most
 * hosts is the assistant they already have.
 *
 * This is a first-class result, not an error and not a null. Falling through
 * is the expected fate of most of what people say, and the design only works
 * if handing an utterance on is as ordinary a return value as handling it.
 */
export interface FallbackOutcome {
  readonly kind: 'fallback'
  readonly transcript: string
  readonly reason: FallbackReason
  /** Whatever partial sense was made of it, for logging or for a hint. */
  readonly intent: VoiceIntent | null
  readonly decision: CommandDecision | null
}

export type VoiceOutcome = CommandOutcome | ConfirmOutcome | FallbackOutcome

export function isCommand(outcome: VoiceOutcome): outcome is CommandOutcome {
  return outcome.kind === 'command'
}

export function needsConfirmation(outcome: VoiceOutcome): outcome is ConfirmOutcome {
  return outcome.kind === 'confirm'
}

export function isFallback(outcome: VoiceOutcome): outcome is FallbackOutcome {
  return outcome.kind === 'fallback'
}

export function fallbackFor(
  transcript: string,
  reason: FallbackReason = 'unrecognized-command',
  intent: VoiceIntent | null = null,
  decision: CommandDecision | null = null,
): FallbackOutcome {
  return {
    kind: 'fallback',
    transcript,
    reason: transcript.trim().length === 0 ? 'nothing-heard' : reason,
    intent,
    decision,
  }
}

/**
 * Turns a decision into the thing a host acts on. The two are separate
 * because they answer different questions: a decision says how well the
 * utterance was understood, an outcome says whose problem it is now.
 *
 * The narrowing is the payoff. On a command or confirm outcome the intent is
 * an ActionableIntent, so reaching its target needs no further checking,
 * which is not true of the decision it came from.
 */
export function toOutcome(decision: CommandDecision): VoiceOutcome {
  const { intent } = decision

  if (decision.kind !== 'unresolved' && isActionable(intent)) {
    if (decision.kind === 'confident') {
      return { kind: 'command', intent, target: decision.target, decision }
    }

    return {
      kind: 'confirm',
      intent,
      target: decision.target,
      options: decision.options,
      decision,
    }
  }

  return fallbackFor(intent.transcript, decision.reason ?? 'unrecognized-command', intent, decision)
}
