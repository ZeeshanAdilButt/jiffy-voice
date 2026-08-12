import { formatDurationMinutes } from './duration.js'
import {
  describeTarget,
  isNamedTarget,
  NO_TARGET,
  type IntentTarget,
  type NamedTarget,
} from './target.js'

export const INTENT_TYPES = [
  'START_TRACKING',
  'STOP_TRACKING',
  'PAUSE',
  'RESUME',
  'LOG_TIME',
  'UNKNOWN',
] as const

export type IntentType = (typeof INTENT_TYPES)[number]

interface IntentFields {
  /** The transcript exactly as it arrived, before any normalization. */
  readonly transcript: string
  /** How sure the parser is, from 0 to 1. */
  readonly confidence: number
}

export interface StartTrackingIntent extends IntentFields {
  readonly type: 'START_TRACKING'
  readonly target: IntentTarget
}

export interface StopTrackingIntent extends IntentFields {
  readonly type: 'STOP_TRACKING'
  readonly target: IntentTarget
}

export interface PauseIntent extends IntentFields {
  readonly type: 'PAUSE'
  readonly target: IntentTarget
}

export interface ResumeIntent extends IntentFields {
  readonly type: 'RESUME'
  readonly target: IntentTarget
}

export interface LogTimeIntent extends IntentFields {
  readonly type: 'LOG_TIME'
  readonly target: IntentTarget
  /** May be fractional, so "log 45 seconds" survives the trip. */
  readonly durationMinutes: number
}

/**
 * The parser understood nothing it is willing to act on. Note that this
 * carries no target at all rather than a `none` target, so a host cannot
 * read a target off an intent that has no meaning without narrowing first.
 */
export interface UnknownIntent extends IntentFields {
  readonly type: 'UNKNOWN'
}

export type ActionableIntent =
  StartTrackingIntent | StopTrackingIntent | PauseIntent | ResumeIntent | LogTimeIntent

export type VoiceIntent = ActionableIntent | UnknownIntent

export function isIntentType(value: unknown): value is IntentType {
  return typeof value === 'string' && (INTENT_TYPES as readonly string[]).includes(value)
}

/**
 * Confidence is compared against thresholds by every caller, so a value
 * outside 0..1 or a NaN leaking out of an adapter would silently break
 * those comparisons rather than fail. Rounding keeps scores stable enough
 * to assert on and to log without noise.
 */
export function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0
  const bounded = Math.min(1, Math.max(0, value))
  return Math.round(bounded * 100) / 100
}

export function unknownIntent(transcript: string, confidence = 0): UnknownIntent {
  return { type: 'UNKNOWN', transcript, confidence: clampConfidence(confidence) }
}

export function isActionable(intent: VoiceIntent): intent is ActionableIntent {
  return intent.type !== 'UNKNOWN'
}

export function hasNamedTarget(
  intent: VoiceIntent,
): intent is ActionableIntent & { readonly target: NamedTarget } {
  return isActionable(intent) && isNamedTarget(intent.target)
}

export function intentTarget(intent: VoiceIntent): IntentTarget {
  return isActionable(intent) ? intent.target : NO_TARGET
}

const INTENT_VERBS: Record<Exclude<IntentType, 'UNKNOWN'>, string> = {
  START_TRACKING: 'start tracking',
  STOP_TRACKING: 'stop tracking',
  PAUSE: 'pause',
  RESUME: 'resume',
  LOG_TIME: 'log',
}

/**
 * A one-line rendering for logs and for the confirmation prompt a voice UI
 * usually wants to show before acting on something it only heard once.
 */
export function describeIntent(intent: VoiceIntent): string {
  if (!isActionable(intent)) return 'unknown command'

  const verb = INTENT_VERBS[intent.type]
  const isLog = intent.type === 'LOG_TIME'
  const duration = isLog ? ` ${formatDurationMinutes(intent.durationMinutes)}` : ''
  const preposition = isLog ? ' to ' : ' '
  const target = isNamedTarget(intent.target)
    ? `${preposition}${describeTarget(intent.target)}`
    : ''

  return `${verb}${duration}${target}`
}
