const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 3600

/**
 * Durations are carried as minutes, and may be fractional: "log 45 seconds"
 * is a legitimate thing to say, and rounding it to a whole minute at the
 * parsing layer would quietly change what the user asked for. Formatting is
 * where that gets turned back into something readable.
 */
export function formatDurationMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0m'

  const totalSeconds = Math.round(minutes * SECONDS_PER_MINUTE)
  const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR)
  const wholeMinutes = Math.floor((totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)
  const seconds = totalSeconds % SECONDS_PER_MINUTE

  const parts: string[] = []
  if (hours > 0) parts.push(`${hours}h`)
  if (wholeMinutes > 0) parts.push(`${wholeMinutes}m`)
  if (seconds > 0) parts.push(`${seconds}s`)

  return parts.length > 0 ? parts.join(' ') : '0m'
}
