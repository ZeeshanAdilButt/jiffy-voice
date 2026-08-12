import type { Express } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'

import type { TokenVerifier, VerifiedIdentity } from '../ports/index.js'
import { createHttpApp, type HttpAppConfig } from './app.js'

class StubTokenVerifier implements TokenVerifier {
  async verify(token: string): Promise<VerifiedIdentity> {
    if (token !== 'good-token') throw new Error('nope')
    return { userId: 'user_1' }
  }
}

const CANDIDATES = [
  { id: 'goal_42', name: 'Deen', kind: 'goal' },
  { id: 'goal_43', name: 'Fitness', kind: 'goal' },
  { id: 'task_7', name: 'Invoices', kind: 'task' },
]

function app(config: Partial<HttpAppConfig> = {}): Express {
  return createHttpApp({ tokenVerifier: new StubTokenVerifier(), ...config })
}

function post(body: object | string, token = 'good-token') {
  return request(app()).post('/commands').set('authorization', `Bearer ${token}`).send(body)
}

describe('POST /commands', () => {
  it('answers a command it is sure of', async () => {
    const response = await post({
      transcript: 'start tracking time for my deen goal',
      candidates: CANDIDATES,
    })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      kind: 'command',
      intent: { type: 'START_TRACKING' },
      target: { id: 'goal_42' },
    })
  })

  it('carries a duration through', async () => {
    const response = await post({
      transcript: 'log an hour and a half to my deen goal',
      candidates: CANDIDATES,
    })

    expect(response.body.intent).toMatchObject({ type: 'LOG_TIME', durationMinutes: 90 })
  })

  it('asks about a command it is not sure of, with ranked options', async () => {
    const response = await post({
      transcript: 'start tracking dee',
      candidates: CANDIDATES,
    })

    expect(response.body.kind).toBe('confirm')
    expect(Array.isArray(response.body.options)).toBe(true)
  })

  it('hands back an utterance for something smarter', async () => {
    const response = await post({
      transcript: 'how much time did i spend on deen last week',
      candidates: CANDIDATES,
    })

    expect(response.body).toMatchObject({
      kind: 'fallback',
      transcript: 'how much time did i spend on deen last week',
    })
  })

  it('works with no candidates at all', async () => {
    const response = await post({ transcript: 'stop tracking' })

    expect(response.status).toBe(200)
    expect(response.body.kind).toBe('command')
  })

  it('takes per-request wake words', async () => {
    const response = await post({ transcript: 'jiffy stop', wakeWords: ['jiffy'] })

    expect(response.body).toMatchObject({ kind: 'command', intent: { type: 'STOP_TRACKING' } })
  })

  it('takes per-request kind words', async () => {
    const response = await post({
      transcript: 'start tracking the deen client',
      candidates: CANDIDATES,
      kindWords: { client: 'goal' },
    })

    expect(response.body).toMatchObject({ kind: 'command', target: { id: 'goal_42' } })
  })

  it('takes a per-request policy', async () => {
    const response = await post({
      transcript: 'stop tracking',
      policy: { autoIntentConfidence: 0.99 },
    })

    expect(response.body.kind).toBe('confirm')
  })

  it('applies deployment defaults when a request says nothing', async () => {
    const response = await request(app({ defaults: { wakeWords: ['jiffy'] } }))
      .post('/commands')
      .set('authorization', 'Bearer good-token')
      .send({ transcript: 'jiffy pause' })

    expect(response.body).toMatchObject({ kind: 'command', intent: { type: 'PAUSE' } })
  })

  it('reports an empty transcript as having heard nothing rather than failing', async () => {
    const response = await post({ transcript: '' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ kind: 'fallback', reason: 'nothing-heard' })
  })
})

describe('rejected requests', () => {
  const bad: ReadonlyArray<readonly [string, object | string]> = [
    ['a missing transcript', { candidates: [] }],
    ['a non-string transcript', { transcript: 42 }],
    ['candidates that are not an array', { transcript: 'stop', candidates: {} }],
    [
      'a candidate with no id',
      { transcript: 'stop', candidates: [{ name: 'Deen', kind: 'goal' }] },
    ],
    [
      'a candidate with an unknown kind',
      { transcript: 'stop', candidates: [{ id: 'a', name: 'Deen', kind: 'sprint' }] },
    ],
    [
      'aliases that are not strings',
      { transcript: 'stop', candidates: [{ id: 'a', name: 'D', kind: 'goal', aliases: [1] }] },
    ],
    ['kind words pointing at an unknown kind', { transcript: 'stop', kindWords: { x: 'sprint' } }],
    ['a policy that is not an object', { transcript: 'stop', policy: 'strict' }],
    [
      'a policy threshold that is not a number',
      { transcript: 'stop', policy: { maxOptions: 'x' } },
    ],
    ['wake words that are not strings', { transcript: 'stop', wakeWords: [7] }],
    ['a body that is not an object', 'stop'],
  ]

  it.each(bad)('rejects %s with 400', async (_label, body) => {
    const response = await post(body)
    expect(response.status).toBe(400)
  })

  it('says which field was wrong', async () => {
    const response = await post({ transcript: 'stop', candidates: [{ id: 'a', name: 'D' }] })

    expect(response.body.error).toContain('candidates[0].kind')
  })

  it('rejects malformed JSON', async () => {
    const response = await request(app())
      .post('/commands')
      .set('authorization', 'Bearer good-token')
      .set('content-type', 'application/json')
      .send('{ not json')

    expect(response.status).toBe(400)
  })
})

describe('authentication', () => {
  it('rejects a request with no token', async () => {
    const response = await request(app()).post('/commands').send({ transcript: 'stop' })

    expect(response.status).toBe(401)
  })

  it('rejects a token the verifier turns down', async () => {
    const response = await post({ transcript: 'stop' }, 'bad-token')

    expect(response.status).toBe(401)
  })

  it('rejects a header that is not a bearer token', async () => {
    const response = await request(app())
      .post('/commands')
      .set('authorization', 'Basic abc')
      .send({ transcript: 'stop' })

    expect(response.status).toBe(401)
  })

  it('does not verify before rejecting a malformed body, but does before parsing it', async () => {
    const response = await request(app()).post('/commands').send({ transcript: 42 })

    expect(response.status).toBe(401)
  })
})

describe('operational endpoints', () => {
  it('serves liveness without a token', async () => {
    const response = await request(app()).get('/health')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok' })
  })

  it('serves readiness without a token', async () => {
    const response = await request(app()).get('/ready')

    expect(response.status).toBe(200)
  })

  it('reports not ready when a supplied check says so', async () => {
    const response = await request(app({ readinessCheck: async () => false })).get('/ready')

    expect(response.status).toBe(503)
  })

  it('reports not ready when a supplied check throws', async () => {
    const failing = app({
      readinessCheck: async () => {
        throw new Error('down')
      },
    })

    await expect(request(failing).get('/ready')).resolves.toMatchObject({ status: 503 })
  })
})
