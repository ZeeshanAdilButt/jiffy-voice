import type { TargetKind } from '../../domain/index.js'
import { foldText } from '../../text/fold.js'
import { DEFAULT_KIND_WORDS } from '../../text/kind-words.js'
import {
  BASE_RULES,
  LEADING_PHRASES,
  sortRules,
  TRAILING_PHRASES,
  type BuiltInIntentType,
  type CommandRule,
} from './rules.js'
import { stripLeading, stripTrailing } from './tokens.js'

interface PhraseFields {
  /** The words, as someone would say them. Folded the same way a transcript is. */
  readonly phrase: string
  /** Discount the confidence, for a phrase that is ordinary speech too. */
  readonly weak?: boolean
  /** Only a command when a quantity of time follows it. */
  readonly needsDuration?: boolean
}

export interface BuiltInPhrase extends PhraseFields {
  readonly type: BuiltInIntentType
}

export interface CustomPhrase extends PhraseFields {
  readonly type: 'CUSTOM'
  /** What the resulting intent is called. Carried through to `intent.name`. */
  readonly name: string
}

export type VocabularyPhrase = BuiltInPhrase | CustomPhrase

/**
 * Additions to the built-in table rather than a replacement for it. An app
 * that says "clock on" as well as "clock in" wants both, and an app whose
 * users say "sprint" for a category wants that word to work alongside the
 * ones everybody uses. Forking the table to add a synonym is the outcome
 * this exists to avoid.
 */
export interface Vocabulary {
  /** Extra phrasings. A phrase already in the table is replaced, not doubled. */
  readonly phrases?: readonly VocabularyPhrase[]
  /** Built-in phrasings to drop, by the words themselves. */
  readonly removePhrases?: readonly string[]
  /** Extra filler, stripped from either end of an utterance. */
  readonly fillers?: readonly string[]
  /** Built-in filler to stop stripping. */
  readonly removeFillers?: readonly string[]
}

export interface CompiledVocabulary {
  readonly rules: readonly CommandRule[]
  readonly leading: readonly (readonly string[])[]
  readonly trailing: readonly (readonly string[])[]
}

function tokenizePhrase(phrase: string): readonly string[] {
  const folded = foldText(phrase)
  return folded.length === 0 ? [] : folded.split(' ')
}

function toRule(phrase: VocabularyPhrase, fillers: Fillers): CommandRule | null {
  // Put the phrase through the same stripping a transcript gets, so an entry
  // written the way someone would say it ("please start the timer") still
  // matches the tokens that survive normalization. Without this, any phrase
  // opening or closing on a filler word could never match anything.
  const tokens = stripTrailing(
    stripLeading(tokenizePhrase(phrase.phrase), fillers.leading),
    fillers.trailing,
  )
  if (tokens.length === 0) return null

  const shared = {
    phrase: tokens,
    weak: phrase.weak ?? false,
    needsDuration: phrase.needsDuration ?? false,
  }

  if (phrase.type === 'CUSTOM') {
    return phrase.name.length === 0 ? null : { ...shared, type: 'CUSTOM', name: phrase.name }
  }

  return { ...shared, type: phrase.type }
}

function splitPhrases(phrases: readonly string[]): readonly (readonly string[])[] {
  return phrases.map(tokenizePhrase).filter((tokens) => tokens.length > 0)
}

interface Fillers {
  readonly leading: readonly (readonly string[])[]
  readonly trailing: readonly (readonly string[])[]
}

const DEFAULT_FILLERS: Fillers = {
  leading: splitPhrases(LEADING_PHRASES),
  trailing: splitPhrases(TRAILING_PHRASES),
}

const DEFAULT_COMPILED: CompiledVocabulary = {
  rules: sortRules(BASE_RULES),
  ...DEFAULT_FILLERS,
}

function buildRules(vocabulary: Vocabulary, fillers: Fillers): readonly CommandRule[] {
  const removed = new Set((vocabulary.removePhrases ?? []).map(foldText))
  const added = (vocabulary.phrases ?? [])
    .map((phrase) => toRule(phrase, fillers))
    .filter((rule): rule is CommandRule => rule !== null)

  // A custom phrase that repeats a built-in one wins, so overriding the
  // meaning of a phrasing is a matter of declaring it rather than removing
  // the old one first.
  const replaced = new Set(added.map((rule) => rule.phrase.join(' ')))

  const kept = BASE_RULES.filter((rule) => {
    const phrase = rule.phrase.join(' ')
    return !removed.has(phrase) && !replaced.has(phrase)
  })

  return sortRules([...kept, ...added])
}

function buildFillers(
  base: readonly string[],
  vocabulary: Vocabulary,
): readonly (readonly string[])[] {
  const removed = new Set((vocabulary.removeFillers ?? []).map(foldText))
  const kept = base.filter((phrase) => !removed.has(foldText(phrase)))

  return splitPhrases([...kept, ...(vocabulary.fillers ?? [])])
}

// Keyed on the vocabulary object rather than its contents, because a parser
// holds one for its lifetime and this runs on every utterance, including
// every interim transcript a recognizer emits while someone is still
// talking.
const vocabularyCache = new WeakMap<Vocabulary, CompiledVocabulary>()

export function compileVocabulary(vocabulary?: Vocabulary): CompiledVocabulary {
  if (vocabulary === undefined) return DEFAULT_COMPILED

  const cached = vocabularyCache.get(vocabulary)
  if (cached !== undefined) return cached

  const fillers: Fillers = {
    leading: buildFillers(LEADING_PHRASES, vocabulary),
    trailing: buildFillers(TRAILING_PHRASES, vocabulary),
  }

  const compiled: CompiledVocabulary = { rules: buildRules(vocabulary, fillers), ...fillers }

  vocabularyCache.set(vocabulary, compiled)
  return compiled
}

/**
 * Words for what kind of thing was named, merged over the built-in set. A
 * null value drops a built-in word, which is the only way an app whose users
 * mean something else by "project" can say so.
 */
export type KindWordOverrides = Readonly<Record<string, TargetKind | null>>

const kindWordCache = new WeakMap<object, Readonly<Record<string, TargetKind>>>()

export function compileKindWords(
  overrides?: KindWordOverrides,
): Readonly<Record<string, TargetKind>> {
  if (overrides === undefined) return DEFAULT_KIND_WORDS

  const cached = kindWordCache.get(overrides)
  if (cached !== undefined) return cached

  const merged: Record<string, TargetKind> = { ...DEFAULT_KIND_WORDS }

  for (const [word, kind] of Object.entries(overrides)) {
    const folded = foldText(word)
    if (folded.length === 0) continue

    if (kind === null) {
      delete merged[folded]
    } else {
      merged[folded] = kind
    }
  }

  kindWordCache.set(overrides, merged)
  return merged
}
