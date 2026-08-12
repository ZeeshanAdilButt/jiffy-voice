import type { IntentType, NamedTarget, ResolvedTarget, TargetKind } from '../domain/index.js'

/**
 * One of the host's records, flattened to the parts matching needs. Aliases
 * cover the names people actually say for a record that is stored under
 * something longer or more formal.
 */
export interface TargetCandidate {
  readonly id: string
  readonly name: string
  readonly kind: TargetKind
  readonly aliases?: readonly string[]
}

/**
 * Everything known about the command the name came from. A host can use it
 * to narrow the search: "stop tracking the deen goal" only ever refers to
 * something already running, which is a much smaller set than every goal
 * that exists.
 */
export interface ResolveContext {
  readonly intentType: IntentType
  readonly transcript: string
}

/**
 * The seam where this package hands a spoken name back to the host and asks
 * which record it was. This is the one interface a host almost always
 * implements or configures itself, because it is the only place the two
 * domains have to meet.
 *
 * Returning null means no confident match, which is a normal answer and not
 * a failure. Throw only when the lookup itself failed.
 */
export interface TargetResolver {
  resolve(target: NamedTarget, context?: ResolveContext): Promise<ResolvedTarget | null>
  /**
   * Every candidate worth considering, best first. Optional: a host whose
   * lookup can only answer yes or no implements `resolve` alone and the
   * layers above treat its answer as a list of one.
   *
   * Worth implementing when you can, because it is what turns "no match" into
   * "did you mean one of these three".
   */
  rank?(target: NamedTarget, context?: ResolveContext): Promise<readonly ResolvedTarget[]>
}
