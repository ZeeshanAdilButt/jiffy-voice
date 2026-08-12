import { foldText } from '../../text/fold.js'

/**
 * Awarded when two names reduce to the same consonant skeleton. This is the
 * transcription-error case the rest of the scoring handles badly: a
 * recognizer that hears "dean" for "deen" has produced a string that is
 * close in edit distance but exactly right in sound, and the vowels it got
 * wrong are the ones it is least reliable about.
 */
const PHONETIC_SCORE = 0.85

const PRECISION = 1000

function round(value: number): number {
  return Math.round(value * PRECISION) / PRECISION
}

/**
 * Optimal string alignment distance: Levenshtein plus adjacent
 * transpositions, so "detail" against "detial" costs one edit rather than
 * two. Transposition matters here because it is what a fast talker and a
 * recognizer working in real time both produce.
 */
function editDistance(a: string, b: string): number {
  const rows = a.length + 1
  const cols = b.length + 1
  const distance = new Array<number>(rows * cols).fill(0)

  const get = (row: number, col: number): number => distance[row * cols + col] ?? 0
  const set = (row: number, col: number, value: number): void => {
    distance[row * cols + col] = value
  }

  for (let row = 0; row < rows; row += 1) set(row, 0, row)
  for (let col = 0; col < cols; col += 1) set(0, col, col)

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = a[row - 1] === b[col - 1] ? 0 : 1

      let best = Math.min(
        get(row - 1, col) + 1,
        get(row, col - 1) + 1,
        get(row - 1, col - 1) + cost,
      )

      if (row > 1 && col > 1 && a[row - 1] === b[col - 2] && a[row - 2] === b[col - 1]) {
        best = Math.min(best, get(row - 2, col - 2) + 1)
      }

      set(row, col, best)
    }
  }

  return get(rows - 1, cols - 1)
}

function editRatio(a: string, b: string): number {
  if (a === b) return 1
  const longest = Math.max(a.length, b.length)
  if (longest === 0) return 0
  return 1 - editDistance(a, b) / longest
}

function sortTokens(text: string): string {
  return text.split(' ').sort().join(' ')
}

/** How much of `from`, weighted by word length, is accounted for by `to`. */
function coverage(from: readonly string[], to: readonly string[]): number {
  let matched = 0
  let total = 0

  for (const token of from) {
    let best = 0
    for (const other of to) {
      best = Math.max(best, editRatio(token, other))
    }
    matched += token.length * best
    total += token.length
  }

  return total === 0 ? 0 : matched / total
}

/**
 * Harmonic mean of the two coverages, which is what stops a single matching
 * word from carrying a much longer name: "deen" covers all of itself inside
 * "deen fitness tracker", but that name is mostly words the speaker never
 * said, and the low reverse coverage drags the result back down.
 */
function tokenOverlap(a: string, b: string): number {
  const left = a.split(' ')
  const right = b.split(' ')

  const forward = coverage(left, right)
  const backward = coverage(right, left)
  if (forward + backward === 0) return 0

  return (2 * forward * backward) / (forward + backward)
}

function consonantSkeleton(word: string): string {
  const collapsed = word.replace(/(.)\1+/g, '$1')
  const head = collapsed.slice(0, 1)
  return head + collapsed.slice(1).replace(/[aeiou]/g, '')
}

function skeleton(text: string): string {
  return text.split(' ').map(consonantSkeleton).join(' ')
}

function soundsTheSame(a: string, b: string): boolean {
  const left = skeleton(a)
  const right = skeleton(b)

  return left.length >= 2 && left === right && a.slice(0, 1) === b.slice(0, 1)
}

/**
 * How alike two names are, from 0 to 1, after folding both. Deterministic
 * and pure: the same pair always scores the same, which is what makes a
 * resolution decision reproducible from a log line.
 */
export function similarity(a: string, b: string): number {
  const left = foldText(a)
  const right = foldText(b)

  if (left.length === 0 || right.length === 0) return 0
  if (left === right) return 1

  const scores = [
    editRatio(left, right),
    editRatio(sortTokens(left), sortTokens(right)),
    tokenOverlap(left, right),
    soundsTheSame(left, right) ? PHONETIC_SCORE : 0,
  ]

  return round(Math.max(...scores))
}
