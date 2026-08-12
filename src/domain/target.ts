export const TARGET_KINDS = ['goal', 'task', 'category'] as const

/**
 * What a spoken name refers to in the host application. Deliberately three
 * broad buckets rather than the host's real taxonomy: this package never
 * learns what a goal is, it only carries the label far enough for the
 * host's TargetResolver to narrow the search.
 */
export type TargetKind = (typeof TARGET_KINDS)[number]

/**
 * A speaker can name something without saying what type it is ("start
 * tracking deen"). Guessing a kind there would be inventing host domain
 * knowledge, so the parser says so and the resolver searches everything.
 */
export type SpokenTargetKind = TargetKind | 'unspecified'

export interface NoTarget {
  readonly kind: 'none'
}

export interface NamedTarget {
  readonly kind: SpokenTargetKind
  readonly name: string
}

export type IntentTarget = NoTarget | NamedTarget

export const NO_TARGET: NoTarget = Object.freeze({ kind: 'none' })

export function namedTarget(kind: SpokenTargetKind, name: string): NamedTarget {
  return Object.freeze({ kind, name: name.trim().replace(/\s+/g, ' ') })
}

export function isNamedTarget(target: IntentTarget): target is NamedTarget {
  return target.kind !== 'none'
}

export function isTargetKind(value: unknown): value is TargetKind {
  return typeof value === 'string' && (TARGET_KINDS as readonly string[]).includes(value)
}

export function describeTarget(target: IntentTarget): string {
  if (!isNamedTarget(target)) return 'no target'
  if (target.kind === 'unspecified') return `"${target.name}"`
  return `${target.kind} "${target.name}"`
}
