import { Router, type NextFunction, type Request, type Response } from 'express'

import { createEmbeddedVoice, type EmbeddedVoiceConfig } from '../embedded.js'
import { parseCommandRequest, type CommandRequest } from './request.js'

/**
 * Settings applied to every request, for a deployment that serves one
 * application. A request may override any of them.
 */
export type CommandDefaults = Pick<
  EmbeddedVoiceConfig,
  'wakeWords' | 'kindWords' | 'minConfidence' | 'matching' | 'policy'
>

function configFor(request: CommandRequest, defaults: CommandDefaults): EmbeddedVoiceConfig {
  return {
    ...defaults,
    candidates: request.candidates,
    wakeWords: request.wakeWords ?? defaults.wakeWords,
    kindWords: request.kindWords ?? defaults.kindWords,
    minConfidence: request.minConfidence ?? defaults.minConfidence,
    policy: request.policy ?? defaults.policy,
  }
}

export function createCommandsRouter(defaults: CommandDefaults = {}): Router {
  const router = Router()

  // Built per request rather than once, because the candidate list arrives
  // with the request. That costs nothing worth measuring: no adapter here
  // opens a connection, reads a file, or holds state between calls.
  router.post('/commands', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const request = parseCommandRequest(req.body)
      const voice = createEmbeddedVoice(configFor(request, defaults))

      res.status(200).json(await voice.interpret(request.transcript))
    } catch (error) {
      next(error)
    }
  })

  return router
}
