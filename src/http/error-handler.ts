import type { NextFunction, Request, Response } from 'express'

import { EmptyTranscriptError, TargetResolutionFailedError } from '../core/index.js'
import { BadRequestError } from './request.js'

// Express only treats a four-argument function as an error handler, so _req
// and _next stay in the signature even though this one does not use them.
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof BadRequestError || error instanceof EmptyTranscriptError) {
    res.status(400).json({ error: error.message })
    return
  }

  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({ error: 'Malformed JSON body' })
    return
  }

  if (error instanceof TargetResolutionFailedError) {
    res.status(500).json({ error: error.message })
    return
  }

  res.status(500).json({ error: 'Internal server error' })
}
