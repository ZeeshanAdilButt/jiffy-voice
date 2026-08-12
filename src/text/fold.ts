const COMBINING_MARKS = /[̀-ͯ]/g
const APOSTROPHES = /['‘’ʼ]/g
const NON_DECIMAL_PERIOD = /(?<!\d)\.|\.(?!\d)/g
const NON_FOLDABLE = /[^a-z0-9.\s]/g

/**
 * Reduces text to the lowercase alphanumeric skeleton that matching works
 * on. Both sides of every comparison in this package go through here, which
 * is the point: a candidate stored as "Qur'an Study" and a transcript
 * reading "quran study" have to fold to the same thing or nothing else
 * matters.
 *
 * Apostrophes close up rather than becoming spaces, so "don't" stays one
 * token and "deen's" folds to "deens" on both sides of a comparison instead
 * of to a word only one side has.
 *
 * This is an English-language transform. Text in a script it cannot fold
 * comes back empty, which surfaces as an unparsed command rather than a
 * wrong one.
 */
export function foldText(input: string): string {
  return input
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(APOSTROPHES, '')
    .replace(NON_DECIMAL_PERIOD, ' ')
    .replace(NON_FOLDABLE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokenize(input: string): string[] {
  const folded = foldText(input)
  return folded.length === 0 ? [] : folded.split(' ')
}
