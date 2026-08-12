import { Router } from 'express'

export interface HealthRouterConfig {
  /** True when this instance can serve traffic. Defaults to always ready. */
  readinessCheck?: () => Promise<boolean>
}

export function createHealthRouter(config: HealthRouterConfig = {}): Router {
  const router = Router()

  router.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' })
  })

  // Both endpoints exist because orchestrators expect both, but this service
  // holds no connection to anything: it computes an answer from the request
  // body and returns it. There is nothing for readiness to check that
  // liveness has not already proved, and inventing a check would be
  // pretending to a dependency that does not exist. A deployment that puts
  // one in front of this can supply its own.
  router.get('/ready', async (_req, res) => {
    let ready: boolean
    try {
      ready = config.readinessCheck === undefined ? true : await config.readinessCheck()
    } catch {
      ready = false
    }
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not ready' })
  })

  return router
}
