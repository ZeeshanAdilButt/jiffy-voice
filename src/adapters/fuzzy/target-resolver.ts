import type { NamedTarget, ResolvedTarget, TargetKind } from '../../domain/index.js'
import type { TargetCandidate, TargetResolver } from '../../ports/index.js'
import { compileKindWords, type KindWordOverrides } from '../rule-based/vocabulary.js'
import { foldText } from '../../text/fold.js'
import { similarity } from './similarity.js'

/**
 * Below this, a match is a coincidence. Chosen against the transcription
 * errors this is meant to survive: a one-letter miss on a short name lands
 * near 0.75, so 0.6 leaves room for a worse recognizer without letting an
 * unrelated name through.
 */
const DEFAULT_MIN_SCORE = 0.6

/**
 * How far ahead of the runner-up the winner has to be. Two names this close
 * mean the recording did not distinguish them, and starting a timer on a
 * coin flip is worse than asking.
 */
const DEFAULT_AMBIGUITY_MARGIN = 0.05

export type TargetCandidateSource = () =>
  readonly TargetCandidate[] | Promise<readonly TargetCandidate[]>

export interface FuzzyTargetResolverOptions {
  readonly minScore?: number
  readonly ambiguityMargin?: number
  /** Merged over the built-in set, the same way the parser merges them. */
  readonly kindWords?: KindWordOverrides
}

function compareStrings(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}

/**
 * Ties are broken by name and then by id so a list of equally good matches
 * always comes back in the same order. Without it the answer would depend on
 * whatever order the host happened to hand its records over in, and the same
 * utterance could resolve differently between two calls.
 */
function byScoreThenName(a: ResolvedTarget, b: ResolvedTarget): number {
  return b.score - a.score || compareStrings(a.name, b.name) || compareStrings(a.id, b.id)
}

interface Match {
  readonly score: number
  readonly matchedOn: string
}

export class FuzzyTargetResolver implements TargetResolver {
  private readonly candidates: readonly TargetCandidate[] | TargetCandidateSource
  private readonly minScore: number
  private readonly ambiguityMargin: number
  private readonly kindWords: Readonly<Record<string, TargetKind>>

  constructor(
    candidates: readonly TargetCandidate[] | TargetCandidateSource,
    options: FuzzyTargetResolverOptions = {},
  ) {
    this.candidates = candidates
    this.minScore = options.minScore ?? DEFAULT_MIN_SCORE
    this.ambiguityMargin = options.ambiguityMargin ?? DEFAULT_AMBIGUITY_MARGIN
    this.kindWords = compileKindWords(options.kindWords)
  }

  /**
   * The best match, or null when nothing scored well enough or when the top
   * two are too close to tell apart. A host that would rather offer a choice
   * than a guess can call `rank` and show the list instead.
   */
  async resolve(target: NamedTarget): Promise<ResolvedTarget | null> {
    const ranked = await this.rank(target)

    const best = ranked[0]
    if (best === undefined) return null

    const runnerUp = ranked[1]
    if (
      runnerUp !== undefined &&
      runnerUp.id !== best.id &&
      best.score - runnerUp.score < this.ambiguityMargin
    ) {
      return null
    }

    return best
  }

  /** Every candidate that scored at or above the threshold, best first. */
  async rank(target: NamedTarget): Promise<readonly ResolvedTarget[]> {
    const candidates = await this.load()
    const spoken = this.variantsOf(target.name)
    const matches: ResolvedTarget[] = []

    for (const candidate of candidates) {
      if (target.kind !== 'unspecified' && candidate.kind !== target.kind) continue

      const match = bestMatch(spoken, candidate)
      if (match.score < this.minScore) continue

      matches.push({
        id: candidate.id,
        name: candidate.name,
        kind: candidate.kind,
        score: match.score,
        matchedOn: match.matchedOn,
      })
    }

    return matches.sort(byScoreThenName)
  }

  private async load(): Promise<readonly TargetCandidate[]> {
    return typeof this.candidates === 'function' ? this.candidates() : this.candidates
  }

  /**
   * The spoken name, plus the same name without the word saying what kind of
   * thing it is. A host calling this directly may not have stripped "goal"
   * off "dean goal", and that trailing word should not cost it the match.
   */
  private variantsOf(name: string): readonly string[] {
    const folded = foldText(name)
    if (folded.length === 0) return []

    const tokens = folded.split(' ')
    const variants = new Set([folded])

    if (tokens.length > 1) {
      const last = tokens[tokens.length - 1]
      if (last !== undefined && this.kindWords[last] !== undefined) {
        variants.add(tokens.slice(0, -1).join(' '))
      }

      const first = tokens[0]
      if (first !== undefined && this.kindWords[first] !== undefined) {
        variants.add(tokens.slice(1).join(' '))
      }
    }

    return [...variants]
  }
}

function bestMatch(spoken: readonly string[], candidate: TargetCandidate): Match {
  let best: Match = { score: 0, matchedOn: candidate.name }

  for (const known of [candidate.name, ...(candidate.aliases ?? [])]) {
    for (const said of spoken) {
      const score = similarity(said, known)
      if (score > best.score) {
        best = { score, matchedOn: known }
      }
    }
  }

  return best
}
