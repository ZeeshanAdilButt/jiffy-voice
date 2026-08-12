import { hasNamedTarget, type VoiceIntent } from './intent.js'
import type { TargetKind } from './target.js'

/**
 * One of the host's records, matched to the name the speaker used. `score`
 * and `matchedOn` exist so a host can decide to confirm rather than act:
 * a 0.62 match on an alias is a very different thing from an exact hit on
 * the record's own name, and only the host knows how expensive being wrong
 * is for a given command.
 */
export interface ResolvedTarget {
  readonly id: string
  readonly name: string
  readonly kind: TargetKind
  readonly score: number
  readonly matchedOn: string
}

export interface VoiceCommand {
  readonly intent: VoiceIntent
  readonly target: ResolvedTarget | null
}

/** The speaker named something, so a target is expected to come back. */
export function namesTarget(command: VoiceCommand): boolean {
  return hasNamedTarget(command.intent)
}

/**
 * The speaker named something and nothing matched it. Worth distinguishing
 * from a command that never had a target: the first needs a "which one did
 * you mean" prompt, the second is complete as it stands.
 */
export function isUnresolved(command: VoiceCommand): boolean {
  return namesTarget(command) && command.target === null
}
