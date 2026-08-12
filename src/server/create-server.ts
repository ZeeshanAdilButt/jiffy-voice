import { createServer as createHttpServer, type Server } from 'node:http'

import { createHttpApp, type CommandDefaults } from '../http/index.js'
import type { TokenVerifier } from '../ports/index.js'

export interface CreateServerConfig {
  tokenVerifier: TokenVerifier
  defaults?: CommandDefaults
}

/**
 * One runnable process. Takes an already-constructed TokenVerifier rather
 * than building one, so this stays testable against a fake; main.ts is the
 * thin layer above that reads the environment and builds the real adapter.
 *
 * Returns a Server without calling listen(), for the same reason
 * createHttpApp does not: binding to a port is a separate, later step, kept
 * out of the part worth testing.
 */
export function createServer(config: CreateServerConfig): Server {
  return createHttpServer(createHttpApp(config))
}
