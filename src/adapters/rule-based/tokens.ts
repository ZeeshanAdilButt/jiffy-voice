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

export function stripLeading(
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

export function stripTrailing(
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
