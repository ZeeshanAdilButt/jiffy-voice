import {
  clampConfidence,
  namedTarget,
  NO_TARGET,
  unknownIntent,
  type IntentTarget,
  type SpokenTargetKind,
  type TargetKind,
  type VoiceIntent,
} from '../../domain/index.js'
import { DEFAULT_KIND_WORDS } from '../../text/kind-words.js'
import { findDuration } from './duration.js'
import { matchesAt, normalizeUtterance, type NormalizeOptions } from './normalize.js'
import { COMMAND_RULES, type CommandRule } from './rules.js'

const BASE_CONFIDENCE = 0.9
const EXACT_PHRASE_BONUS = 0.05
const LEADING_NOISE_PENALTY = 0.1
const WEAK_PHRASE_PENALTY = 0.15
const ASSUMED_UNIT_PENALTY = 0.1

/**
 * How far past the start a command phrase may sit and still be believed.
 * Beyond a few words of preamble the match is more likely a coincidence
 * inside a sentence about something else than a command.
 */
const MAX_LEAD_TOKENS = 3

const DETERMINERS = new Set(['my', 'our', 'the', 'a', 'an', 'this', 'that', 'some', 'more', 'it'])

const CONNECTIVES = new Set([
  'on',
  'in',
  'at',
  'to',
  'for',
  'of',
  'from',
  'into',
  'onto',
  'against',
  'toward',
  'towards',
  'with',
  'over',
  'up',
])

/**
 * Dropped only when what follows is itself connective tissue. "Start
 * tracking my time on the deen goal" has a throwaway "time"; "start
 * tracking my time management goal" does not, and stripping unconditionally
 * would rename the goal.
 */
const CONTEXTUAL_NOISE = new Set(['time'])

const TRAILING_NOISE = new Set(['now', 'today', 'tonight', 'again', 'already'])

/**
 * A question is not a command, whatever verbs it happens to contain. "What
 * did I work on yesterday" would otherwise match the "work on" rule and
 * start a timer on something called yesterday.
 *
 * "Can" and "could" are absent on purpose: "can you start tracking deen" is
 * a request, and normalization has already taken the polite opening off it.
 */
const INTERROGATIVES = new Set([
  'what',
  'whats',
  'when',
  'where',
  'why',
  'how',
  'who',
  'whom',
  'whose',
  'which',
  'did',
  'do',
  'does',
  'am',
  'is',
  'are',
  'was',
  'were',
  'should',
])

/**
 * Words for "a short unspecified while". "Pause for a moment" is a bare
 * pause, not a pause on something called "moment".
 */
const VAGUE_TIME = new Set([
  'moment',
  'moments',
  'sec',
  'secs',
  'second',
  'seconds',
  'minute',
  'minutes',
  'min',
  'mins',
  'bit',
  'while',
  'break',
  'breather',
])

export interface ParseOptions extends NormalizeOptions {
  /**
   * Words that say what type of thing was named, mapped to the kind they
   * mean. Supplying this replaces the defaults, which is the seam for an app
   * whose users say "sprint" or "client" instead of "project".
   */
  readonly kindWords?: Readonly<Record<string, TargetKind>>
}

function stripTargetNoise(tokens: readonly string[]): readonly string[] {
  let start = 0
  let end = tokens.length

  while (start < end) {
    const token = tokens[start]
    if (token === undefined) break

    if (DETERMINERS.has(token) || CONNECTIVES.has(token)) {
      start += 1
      continue
    }

    if (CONTEXTUAL_NOISE.has(token)) {
      const next = tokens[start + 1]
      if (next === undefined || CONNECTIVES.has(next) || DETERMINERS.has(next)) {
        start += 1
        continue
      }
    }

    break
  }

  while (end > start) {
    const token = tokens[end - 1]
    if (token === undefined || !TRAILING_NOISE.has(token)) break
    end -= 1
  }

  return tokens.slice(start, end)
}

function extractTarget(
  tokens: readonly string[],
  kindWords: Readonly<Record<string, TargetKind>>,
): IntentTarget {
  const cleaned = stripTargetNoise(tokens)
  const first = cleaned[0]
  if (first === undefined) return NO_TARGET

  // A lone kind word names a type, not an instance: "start tracking my goal"
  // has not said which one.
  if (cleaned.length === 1) {
    return kindWords[first] === undefined ? namedTarget('unspecified', first) : NO_TARGET
  }

  const last = cleaned[cleaned.length - 1]
  const suffixKind = last === undefined ? undefined : kindWords[last]
  const prefixKind = kindWords[first]

  let kind: SpokenTargetKind = 'unspecified'
  let name = cleaned

  if (suffixKind !== undefined) {
    kind = suffixKind
    name = cleaned.slice(0, -1)
  } else if (prefixKind !== undefined) {
    kind = prefixKind
    name = cleaned.slice(1)
  }

  const trimmed = stripTargetNoise(name)
  if (trimmed.length === 0) return NO_TARGET

  return namedTarget(kind, trimmed.join(' '))
}

/**
 * True when what follows the command phrase is only a vague or literal
 * quantity of time, which qualifies the command rather than naming anything.
 */
function isTimeQualifierOnly(tokens: readonly string[]): boolean {
  const cleaned = stripTargetNoise(tokens)
  if (cleaned.length === 0) return true
  if (cleaned.every((token) => VAGUE_TIME.has(token))) return true

  const duration = findDuration(cleaned)
  return duration !== null && duration.start === 0 && duration.end === cleaned.length
}

interface RuleMatch {
  readonly rule: CommandRule
  readonly lead: number
}

function findRule(tokens: readonly string[]): RuleMatch | null {
  const maxLead = Math.min(MAX_LEAD_TOKENS, Math.max(tokens.length - 1, 0))

  for (let lead = 0; lead <= maxLead; lead += 1) {
    for (const rule of COMMAND_RULES) {
      if (matchesAt(tokens, lead, rule.phrase)) return { rule, lead }
    }
  }

  return null
}

/**
 * Turns one transcript into one intent, deterministically and without
 * touching anything outside this module. Anything it cannot account for
 * comes back as UNKNOWN rather than as a guess: acting on the wrong command
 * costs a user more than being asked to repeat themselves.
 */
export function parseCommand(transcript: string, options: ParseOptions = {}): VoiceIntent {
  const kindWords = options.kindWords ?? DEFAULT_KIND_WORDS
  const tokens = normalizeUtterance(transcript, options)

  const opening = tokens[0]
  if (opening !== undefined && INTERROGATIVES.has(opening)) return unknownIntent(transcript)

  const match = findRule(tokens)
  if (match === null) return unknownIntent(transcript)

  const { rule, lead } = match
  let rest = tokens.slice(lead + rule.phrase.length)
  let durationMinutes = 0
  let assumedUnit = false

  if (rule.needsDuration) {
    const duration = findDuration(rest, { bareNumberUnit: 'minutes' })
    // "Log time for my deen goal" is an unfinished sentence, not a request
    // to start a timer. Guessing which one the speaker meant is how a voice
    // interface loses trust.
    if (duration === null) return unknownIntent(transcript)

    durationMinutes = duration.minutes
    assumedUnit = duration.assumedUnit
    rest = [...rest.slice(0, duration.start), ...rest.slice(duration.end)]
  } else if (isTimeQualifierOnly(rest)) {
    rest = []
  }

  const target = extractTarget(rest, kindWords)

  let score = BASE_CONFIDENCE
  if (lead > 0) score -= LEADING_NOISE_PENALTY
  if (rule.weak) score -= WEAK_PHRASE_PENALTY
  if (assumedUnit) score -= ASSUMED_UNIT_PENALTY
  if (lead === 0 && !rule.weak && tokens.length === rule.phrase.length) score += EXACT_PHRASE_BONUS

  const confidence = clampConfidence(score)

  switch (rule.type) {
    case 'START_TRACKING':
      return { type: 'START_TRACKING', target, transcript, confidence }
    case 'STOP_TRACKING':
      return { type: 'STOP_TRACKING', target, transcript, confidence }
    case 'PAUSE':
      return { type: 'PAUSE', target, transcript, confidence }
    case 'RESUME':
      return { type: 'RESUME', target, transcript, confidence }
    case 'LOG_TIME':
      return { type: 'LOG_TIME', target, transcript, confidence, durationMinutes }
  }
}
