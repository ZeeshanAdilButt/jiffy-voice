import express, { type Express } from 'express'
import { pinoHttp } from 'pino-http'

import { logger } from '../observability/logger.js'
import type { TokenVerifier } from '../ports/index.js'
import { createAuthMiddleware } from './auth-middleware.js'
import { createCommandsRouter, type CommandDefaults } from './commands-router.js'
import { errorHandler } from './error-handler.js'
import { createHealthRouter } from './health-router.js'

export interface HttpAppConfig {
  tokenVerifier: TokenVerifier
  /** Applied to every request unless the request overrides them. */
  defaults?: CommandDefaults
  readinessCheck?: () => Promise<boolean>
}

/**
 * The REST surface over the same core the package exposes. This only builds
 * the Express app; binding it to a port is the standalone server's job, so
 * the app can be tested with supertest or mounted inside a larger process
 * without ever calling listen().
 */
export function createHttpApp(config: HttpAppConfig): Express {
  const app = express()

  app.use(pinoHttp({ logger }))
  app.use(express.json({ limit: '256kb' }))

  // Health and readiness sit ahead of auth: a kubelet or load balancer
  // probing them has no bearer token to send.
  app.use(createHealthRouter({ readinessCheck: config.readinessCheck }))
  app.use(createAuthMiddleware(config.tokenVerifier))
  app.use(createCommandsRouter(config.defaults))
  app.use(errorHandler)

  return app
}
