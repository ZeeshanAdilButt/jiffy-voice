/**
 * The service-mode entry point, deliberately separate from the package one.
 * Importing jiffy-voice must never pull in a web framework, which is why
 * express lives behind this subpath and nothing under src/index.ts reaches
 * anything in here.
 */
export { createHttpApp, type HttpAppConfig } from './http/index.js'
export { createCommandsRouter, type CommandDefaults } from './http/index.js'
export { createHealthRouter, type HealthRouterConfig } from './http/index.js'
export { BadRequestError, parseCommandRequest, type CommandRequest } from './http/index.js'
export { createServer, type CreateServerConfig } from './server/create-server.js'
export {
  InvalidTokenError,
  JwtTokenVerifier,
  type JwtTokenVerifierOptions,
} from './adapters/jwt/index.js'
export type { TokenVerifier, VerifiedIdentity } from './ports/index.js'
export { logger } from './observability/logger.js'
