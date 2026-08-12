import { foldText, tokenize } from '../../text/fold.js'
import { stripLeading, stripTrailing } from './tokens.js'
import type { CompiledVocabulary } from './vocabulary.js'

/**
 * Sounds people make while thinking. Dropped wherever they appear, unlike
 * the vocabulary's filler phrases, which are only dropped at an edge. "Like"
 * and "so" are deliberately absent: both turn up inside real names, and a
 * parser that quietly edits the middle of a name is worse than one that
 * takes an extra word.
 */
const DISFLUENCIES = new Set(['um', 'uh', 'uhm', 'erm', 'er', 'ah', 'eh', 'hmm', 'mm', 'mmm'])

export interface NormalizeOptions {
  /**
   * Words an assistant is addressed by, dropped from the front of an
   * utterance. Configurable rather than fixed because the name of the thing
   * being spoken to belongs to the host application, not to this package.
   */
  readonly wakeWords?: readonly string[]
}

/**
 * Folds a transcript to tokens and removes everything that carries no
 * command meaning, so the rule table only has to describe how people phrase
 * commands and not every way they can pad one.
 */
export function normalizeUtterance(
  transcript: string,
  vocabulary: CompiledVocabulary,
  options: NormalizeOptions = {},
): readonly string[] {
  const wakeWords = (options.wakeWords ?? [])
    .map(foldText)
    .filter((word) => word.length > 0)
    .map((word) => word.split(' '))

  const tokens = tokenize(transcript).filter((token) => !DISFLUENCIES.has(token))
  const withoutLead = stripLeading(tokens, [...wakeWords, ...vocabulary.leading])

  return stripTrailing(withoutLead, vocabulary.trailing)
}
