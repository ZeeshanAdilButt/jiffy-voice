import { foldText, tokenize } from '../../text/fold.js'

/**
 * Sounds people make while thinking. Dropped wherever they appear, unlike
 * the phrases below, which are only dropped at an edge. "like" and "so" are
 * deliberately absent from this set: both turn up inside real names, and a
 * parser that quietly edits the middle of a name is worse than one that
 * takes an extra word.
 */
const DISFLUENCIES = new Set(['um', 'uh', 'uhm', 'erm', 'er', 'ah', 'eh', 'hmm', 'mm', 'mmm'])

/** Politeness and throat-clearing, only ever stripped from the front. */
const LEADING_PHRASES: readonly string[] = [
  'hey there',
  'hey',
  'hi',
  'hello',
  'yo',
  'yeah',
  'yep',
  'ok',
  'okay',
  'so',
  'well',
  'alright',
  'all right',
  'please',
  'just',
  'now',
  'can you',
  'could you',
  'would you',
  'will you',
  'can we',
  'i want to',
  'i want you to',
  'i would like to',
  'id like to',
  'i need to',
  'i need you to',
  'we need to',
  'lets',
  'let us',
  'go ahead and',
  'you can',
]

/** Only ever stripped from the end. */
const TRAILING_PHRASES: readonly string[] = [
  'please',
  'thanks',
  'thank you',
  'for me',
  'will you',
  'would you',
  'ok',
  'okay',
  'alright',
]

export interface NormalizeOptions {
  /**
   * Words an assistant is addressed by, dropped from the front of an
   * utterance. Configurable rather than fixed because the name of the thing
   * being spoken to belongs to the host application, not to this package.
   */
  readonly wakeWords?: readonly string[]
}

function splitPhrases(phrases: readonly string[]): readonly (readonly string[])[] {
  return phrases.map((phrase) => phrase.split(' '))
}

const LEADING = splitPhrases(LEADING_PHRASES)
const TRAILING = splitPhrases(TRAILING_PHRASES)

export function matchesAt(
  tokens: readonly string[],
  index: number,
  phrase: readonly string[],
): boolean {
  if (index < 0 || index + phrase.length > tokens.length) return false
  for (let offset = 0; offset < phrase.length; offset += 1) {
    if (tokens[index + offset] !== phrase[offset]) return false
  }
  return true
}

function stripLeading(
  tokens: readonly string[],
  phrases: readonly (readonly string[])[],
): readonly string[] {
  let result = tokens
  let stripping = true

  while (stripping && result.length > 0) {
    stripping = false
    for (const phrase of phrases) {
      if (matchesAt(result, 0, phrase)) {
        result = result.slice(phrase.length)
        stripping = true
        break
      }
    }
  }

  return result
}

function stripTrailing(
  tokens: readonly string[],
  phrases: readonly (readonly string[])[],
): readonly string[] {
  let result = tokens
  let stripping = true

  while (stripping && result.length > 0) {
    stripping = false
    for (const phrase of phrases) {
      if (matchesAt(result, result.length - phrase.length, phrase)) {
        result = result.slice(0, result.length - phrase.length)
        stripping = true
        break
      }
    }
  }

  return result
}

/**
 * Folds a transcript to tokens and removes everything that carries no
 * command meaning, so the rule table only has to describe how people phrase
 * commands and not every way they can pad one.
 */
export function normalizeUtterance(
  transcript: string,
  options: NormalizeOptions = {},
): readonly string[] {
  const wakeWords = splitPhrases(
    (options.wakeWords ?? []).map(foldText).filter((word) => word.length > 0),
  )

  const tokens = tokenize(transcript).filter((token) => !DISFLUENCIES.has(token))
  const withoutLead = stripLeading(tokens, [...wakeWords, ...LEADING])

  return stripTrailing(withoutLead, TRAILING)
}
