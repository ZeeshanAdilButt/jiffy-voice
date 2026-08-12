import request from 'supertest'
import { describe, expect, it } from 'vitest'

import type { TokenVerifier, VerifiedIdentity } from '../ports/index.js'
import { createServer } from './create-server.js'

class AcceptAnything implements TokenVerifier {
  async verify(token: string): Promise<VerifiedIdentity> {
    return { userId: token }
  }
}

describe('createServer', () => {
  it('returns a server that has not been bound to a port', () => {
    const server = createServer({ tokenVerifier: new AcceptAnything() })

    expect(server.listening).toBe(false)
  })

  it('serves the command endpoint', async () => {
    const server = createServer({ tokenVerifier: new AcceptAnything() })

    const response = await request(server)
      .post('/commands')
      .set('authorization', 'Bearer user_1')
      .send({
        transcript: 'start tracking my deen goal',
        candidates: [{ id: 'goal_42', name: 'Deen', kind: 'goal' }],
      })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ kind: 'command', target: { id: 'goal_42' } })
  })

  it('passes deployment defaults down to the endpoint', async () => {
    const server = createServer({
      tokenVerifier: new AcceptAnything(),
      defaults: { wakeWords: ['jiffy'] },
    })

    const response = await request(server)
      .post('/commands')
      .set('authorization', 'Bearer user_1')
      .send({ transcript: 'jiffy stop tracking' })

    expect(response.body).toMatchObject({ kind: 'command', intent: { type: 'STOP_TRACKING' } })
  })

  it('serves liveness', async () => {
    const server = createServer({ tokenVerifier: new AcceptAnything() })

    await expect(request(server).get('/health')).resolves.toMatchObject({ status: 200 })
  })
})
