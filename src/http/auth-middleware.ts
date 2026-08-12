import type { NextFunction, Request, Response } from 'express'

import type { TokenVerifier } from '../ports/index.js'

/**
 * Every route past this can assume res.locals.userId is set, since a request
 * that fails verification never reaches the router.
 *
 * The service holds no per-user state and resolves against candidates the
 * request itself supplies, so the identity is not used to decide anything.
 * The check is here so the endpoint is not open, and so logs can say who
 * called it.
 */
export function createAuthMiddleware(tokenVerifier: TokenVerifier) {
  return async function authenticate(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const header = req.header('authorization')
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined

    if (token === undefined || token.length === 0) {
      res.status(401).json({ error: 'Missing bearer token' })
      return
    }

    try {
      const identity = await tokenVerifier.verify(token)
      res.locals.userId = identity.userId
      next()
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' })
    }
  }
}
