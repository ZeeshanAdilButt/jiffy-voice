import type { ConfidencePolicy } from '../core/index.js'
import type { KindWordOverrides } from '../adapters/rule-based/index.js'
import { isTargetKind, type TargetKind } from '../domain/index.js'
import type { TargetCandidate } from '../ports/index.js'

export interface CommandRequest {
  readonly transcript: string
  readonly candidates: readonly TargetCandidate[]
  readonly wakeWords?: readonly string[]
  readonly kindWords?: KindWordOverrides
  readonly minConfidence?: number
  readonly policy?: ConfidencePolicy
}

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BadRequestError'
  }
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BadRequestError(`${field} must be an object`)
  }
  return value as Record<string, unknown>
}

function optionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BadRequestError(`${field} must be a number`)
  }
  return value
}

function optionalStrings(value: unknown, field: string): readonly string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new BadRequestError(`${field} must be an array of strings`)
  }
  return value as readonly string[]
}

function parseCandidate(value: unknown, index: number): TargetCandidate {
  const candidate = asRecord(value, `candidates[${index}]`)
  const { id, name, kind } = candidate

  if (typeof id !== 'string' || id.length === 0) {
    throw new BadRequestError(`candidates[${index}].id must be a non-empty string`)
  }
  if (typeof name !== 'string' || name.length === 0) {
    throw new BadRequestError(`candidates[${index}].name must be a non-empty string`)
  }
  if (!isTargetKind(kind)) {
    throw new BadRequestError(`candidates[${index}].kind must be goal, task, or category`)
  }

  const aliases = optionalStrings(candidate.aliases, `candidates[${index}].aliases`)
  return aliases === undefined ? { id, name, kind } : { id, name, kind, aliases }
}

function parseKindWords(value: unknown): KindWordOverrides | undefined {
  if (value === undefined) return undefined

  const source = asRecord(value, 'kindWords')
  const result: Record<string, TargetKind | null> = {}

  for (const [word, kind] of Object.entries(source)) {
    // Null is how a caller drops a built-in word rather than adding one.
    if (kind !== null && !isTargetKind(kind)) {
      throw new BadRequestError(`kindWords.${word} must be goal, task, category, or null`)
    }
    result[word] = kind
  }

  return result
}

function parsePolicy(value: unknown): ConfidencePolicy | undefined {
  if (value === undefined) return undefined

  const source = asRecord(value, 'policy')
  return {
    autoIntentConfidence: optionalNumber(
      source.autoIntentConfidence,
      'policy.autoIntentConfidence',
    ),
    minIntentConfidence: optionalNumber(source.minIntentConfidence, 'policy.minIntentConfidence'),
    autoTargetScore: optionalNumber(source.autoTargetScore, 'policy.autoTargetScore'),
    ambiguityMargin: optionalNumber(source.ambiguityMargin, 'policy.ambiguityMargin'),
    maxOptions: optionalNumber(source.maxOptions, 'policy.maxOptions'),
  }
}

/**
 * Validates a request body into the shape the core takes, throwing
 * BadRequestError with the offending field rather than letting a malformed
 * candidate list turn into a confusing resolution result further in.
 */
export function parseCommandRequest(body: unknown): CommandRequest {
  const source = asRecord(body, 'body')

  if (typeof source.transcript !== 'string') {
    throw new BadRequestError('transcript must be a string')
  }

  const rawCandidates = source.candidates
  if (rawCandidates !== undefined && !Array.isArray(rawCandidates)) {
    throw new BadRequestError('candidates must be an array')
  }

  return {
    transcript: source.transcript,
    candidates: (rawCandidates ?? []).map(parseCandidate),
    wakeWords: optionalStrings(source.wakeWords, 'wakeWords'),
    kindWords: parseKindWords(source.kindWords),
    minConfidence: optionalNumber(source.minConfidence, 'minConfidence'),
    policy: parsePolicy(source.policy),
  }
}
