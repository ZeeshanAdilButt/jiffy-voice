export type DurationUnit = 'hours' | 'minutes' | 'seconds'

/** Larger units come first in a spoken duration: "an hour and ten minutes". */
const UNIT_RANK: Record<DurationUnit, number> = {
  hours: 3,
  minutes: 2,
  seconds: 1,
}

const UNIT_WORDS: Record<string, DurationUnit> = {
  h: 'hours',
  hr: 'hours',
  hrs: 'hours',
  hour: 'hours',
  hours: 'hours',
  m: 'minutes',
  min: 'minutes',
  mins: 'minutes',
  minute: 'minutes',
  minutes: 'minutes',
  s: 'seconds',
  sec: 'seconds',
  secs: 'seconds',
  second: 'seconds',
  seconds: 'seconds',
}

const SMALL_NUMBERS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
}

const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
}

const FRACTIONS: Record<string, number> = {
  half: 0.5,
  quarter: 0.25,
  quarters: 0.75,
}

const ARTICLES = new Set(['a', 'an'])
const NUMERIC = /^\d+(?:\.\d+)?$/
const COMPOUND = /^(\d+(?:\.\d+)?)([a-z]+)$/

export interface DurationMatch {
  readonly minutes: number
  /** Token index the duration starts at. */
  readonly start: number
  /** Token index just past the duration. */
  readonly end: number
  /** True when no unit was spoken and one had to be assumed. */
  readonly assumedUnit: boolean
}

export interface FindDurationOptions {
  /**
   * Unit to read a bare number as. "Log 45 to my deen goal" is a real thing
   * people say; a caller that would rather not guess leaves this unset and
   * gets no match instead.
   */
  readonly bareNumberUnit?: DurationUnit
}

interface Parsed<T> {
  readonly value: T
  readonly next: number
}

function at(tokens: readonly string[], index: number): string | undefined {
  return tokens[index]
}

/** A number as words or digits, without any of the fraction plumbing. */
function parsePlainNumber(tokens: readonly string[], index: number): Parsed<number> | null {
  const token = at(tokens, index)
  if (token === undefined) return null

  if (NUMERIC.test(token)) {
    return { value: Number(token), next: index + 1 }
  }

  const tens = TENS[token]
  if (tens !== undefined) {
    const ones = SMALL_NUMBERS[at(tokens, index + 1) ?? '']
    if (ones !== undefined && ones > 0 && ones < 10) {
      return { value: tens + ones, next: index + 2 }
    }
    return { value: tens, next: index + 1 }
  }

  const small = SMALL_NUMBERS[token]
  if (small === undefined) return null

  if (at(tokens, index + 1) === 'hundred' && small > 0) {
    // "One hundred and twenty" is one number, not a hundred followed by an
    // unrelated twenty, so the "and" is part of it rather than a separator.
    const tail = at(tokens, index + 2) === 'and' ? index + 3 : index + 2
    const rest = parsePlainNumber(tokens, tail)
    if (rest !== null && rest.value < 100) {
      return { value: small * 100 + rest.value, next: rest.next }
    }
    return { value: small * 100, next: index + 2 }
  }

  return { value: small, next: index + 1 }
}

/**
 * A quantity, including the ways English says fractions out loud: "half",
 * "a quarter", "three quarters", and the trailing "and a half" that turns
 * one hour into ninety minutes.
 */
function parseAmount(tokens: readonly string[], index: number): Parsed<number> | null {
  let cursor = index
  const article = at(tokens, cursor)

  if (article !== undefined && ARTICLES.has(article)) {
    const following = at(tokens, cursor + 1) ?? ''
    // "an hour" is a quantity of one; "a half hour" is a quantity of a half.
    if (FRACTIONS[following] === undefined && SMALL_NUMBERS[following] === undefined) {
      return { value: 1, next: cursor + 1 }
    }
    cursor += 1
  }

  const base = parseFraction(tokens, cursor) ?? parsePlainNumber(tokens, cursor)
  if (base === null) return null

  if (at(tokens, base.next) === 'and') {
    const fraction = parseFraction(tokens, base.next + 1)
    if (fraction !== null) {
      return { value: base.value + fraction.value, next: fraction.next }
    }
  }

  return base
}

function parseFraction(tokens: readonly string[], index: number): Parsed<number> | null {
  let cursor = index
  const article = at(tokens, cursor)
  if (article !== undefined && ARTICLES.has(article)) cursor += 1

  const token = at(tokens, cursor)
  if (token === undefined) return null

  // "three quarters" needs the count; a bare "quarters" is meaningless.
  const count = SMALL_NUMBERS[token]
  if (count !== undefined) {
    const next = at(tokens, cursor + 1)
    if (next === 'quarters' && count > 0 && count < 4) {
      return { value: count * 0.25, next: cursor + 2 }
    }
    return null
  }

  const fraction = FRACTIONS[token]
  if (fraction === undefined || token === 'quarters') return null

  return { value: fraction, next: cursor + 1 }
}

function parseUnit(tokens: readonly string[], index: number): Parsed<DurationUnit> | null {
  let cursor = index

  // "quarter of an hour", "half an hour"
  if (at(tokens, cursor) === 'of') cursor += 1
  const article = at(tokens, cursor)
  if (article !== undefined && ARTICLES.has(article)) cursor += 1

  const unit = UNIT_WORDS[at(tokens, cursor) ?? '']
  if (unit === undefined) return null

  return { value: unit, next: cursor + 1 }
}

interface Group {
  readonly amount: number
  readonly unit: DurationUnit | null
  readonly next: number
}

function parseGroup(tokens: readonly string[], index: number): Group | null {
  const token = at(tokens, index)
  if (token === undefined) return null

  const compound = COMPOUND.exec(token)
  if (compound !== null) {
    const [, amount = '', suffix = ''] = compound
    const unit = UNIT_WORDS[suffix]
    if (unit !== undefined) {
      return { amount: Number(amount), unit, next: index + 1 }
    }
  }

  const amount = parseAmount(tokens, index)
  if (amount === null) return null

  const unit = parseUnit(tokens, amount.next)
  if (unit === null) {
    return { amount: amount.value, unit: null, next: amount.next }
  }

  return { amount: amount.value, unit: unit.value, next: unit.next }
}

function toMinutes(amount: number, unit: DurationUnit): number {
  switch (unit) {
    case 'hours':
      return amount * 60
    case 'minutes':
      return amount
    // Divided rather than multiplied by a reciprocal, so 45 seconds is
    // exactly 0.75 minutes and not 0.7499999999999999.
    case 'seconds':
      return amount / 60
  }
}

function parseDurationAt(
  tokens: readonly string[],
  index: number,
  options: FindDurationOptions,
): DurationMatch | null {
  const first = parseGroup(tokens, index)
  if (first === null) return null

  let unit = first.unit
  let assumedUnit = false

  if (unit === null) {
    if (options.bareNumberUnit === undefined) return null
    unit = options.bareNumberUnit
    assumedUnit = true
  }

  let minutes = toMinutes(first.amount, unit)
  let end = first.next

  // Smaller units may follow: "one hour and thirty minutes", "an hour and a
  // half". Requiring each unit to be smaller than the last is what stops a
  // second, unrelated quantity from being swallowed into the first.
  for (;;) {
    const cursor = at(tokens, end) === 'and' ? end + 1 : end
    const group = parseGroup(tokens, cursor)
    if (group === null) break

    if (group.unit === null) {
      if (group.amount >= 1 || cursor === end) break
      minutes += toMinutes(group.amount, unit)
      end = group.next
      continue
    }

    if (UNIT_RANK[group.unit] >= UNIT_RANK[unit]) break

    minutes += toMinutes(group.amount, group.unit)
    unit = group.unit
    end = group.next
  }

  return { minutes, start: index, end, assumedUnit }
}

/**
 * Finds the first spoken duration in a token run, reporting where it sat so
 * the caller can lift it out and read what is left as the target name.
 */
export function findDuration(
  tokens: readonly string[],
  options: FindDurationOptions = {},
): DurationMatch | null {
  for (let index = 0; index < tokens.length; index += 1) {
    const match = parseDurationAt(tokens, index, options)
    if (match !== null && match.minutes > 0) return match
  }

  return null
}
