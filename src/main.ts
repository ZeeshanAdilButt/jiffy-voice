import { createRemoteJWKSet } from 'jose'
import { pathToFileURL } from 'node:url'

import { JwtTokenVerifier } from './adapters/jwt/index.js'
import { logger } from './observability/logger.js'
import { createServer } from './server/create-server.js'

export type JwtEnvConfig =
  | { kind: 'secret'; secret: string; issuer?: string; audience?: string; userIdClaim?: string }
  | { kind: 'jwks'; uri: string; issuer?: string; audience?: string; userIdClaim?: string }

export interface ParsedEnv {
  port: number
  jwt: JwtEnvConfig
  wakeWords?: readonly string[]
  minConfidence?: number
}

function parseNumber(raw: string | undefined, name: string): number | undefined {
  if (raw === undefined) return undefined

  const value = Number(raw)
  if (!Number.isFinite(value)) throw new Error(`Invalid ${name}: ${raw}`)

  return value
}

/**
 * Reads and validates the environment this process needs, without touching a
 * network. Kept pure and separate from run() so a bad config fails fast with
 * a clear message and can be tested without standing anything up.
 */
export function parseEnv(env: NodeJS.ProcessEnv): ParsedEnv {
  const port = env.PORT !== undefined ? Number(env.PORT) : 8080
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT: ${env.PORT}`)
  }

  const issuer = env.JWT_ISSUER
  const audience = env.JWT_AUDIENCE
  const userIdClaim = env.JWT_USER_ID_CLAIM

  const wakeWords = env.WAKE_WORDS?.split(',')
    .map((word) => word.trim())
    .filter((word) => word.length > 0)

  const minConfidence = parseNumber(env.MIN_CONFIDENCE, 'MIN_CONFIDENCE')

  // JWT_JWKS_URI wins if both are set, since a platform that has moved to
  // rotating keys behind a JWKS endpoint has no reason to keep a static
  // secret configured as well.
  if (env.JWT_JWKS_URI) {
    return {
      port,
      wakeWords,
      minConfidence,
      jwt: { kind: 'jwks', uri: env.JWT_JWKS_URI, issuer, audience, userIdClaim },
    }
  }

  if (env.JWT_SECRET) {
    return {
      port,
      wakeWords,
      minConfidence,
      jwt: { kind: 'secret', secret: env.JWT_SECRET, issuer, audience, userIdClaim },
    }
  }

  throw new Error('Set either JWT_JWKS_URI or JWT_SECRET')
}

/**
 * Whether the platform in front of this signs with a static secret or
 * rotates keys behind a JWKS endpoint is exactly the choice
 * JwtTokenVerifier's constructor accepts without caring which. This makes
 * that choice from environment variables instead of from code.
 */
export function buildTokenVerifier(jwt: JwtEnvConfig): JwtTokenVerifier {
  const options = { issuer: jwt.issuer, audience: jwt.audience, userIdClaim: jwt.userIdClaim }

  if (jwt.kind === 'jwks') {
    return new JwtTokenVerifier(createRemoteJWKSet(new URL(jwt.uri)), options)
  }

  return new JwtTokenVerifier(new TextEncoder().encode(jwt.secret), options)
}

export function run(): void {
  const config = parseEnv(process.env)

  const server = createServer({
    tokenVerifier: buildTokenVerifier(config.jwt),
    defaults: { wakeWords: config.wakeWords, minConfidence: config.minConfidence },
  })

  server.listen(config.port, () => {
    logger.info({ port: config.port }, 'jiffy-voice listening')
  })

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'shutting down')
    server.close(() => process.exit(0))
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

// Only run when this file is the process entry point, not when it is
// imported, which is what lets the tests exercise parseEnv and
// buildTokenVerifier without starting a real server.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
}
