import { SignJWT } from 'jose'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

import { HttpSpeechToText } from '../adapters/http-speech/index.js'
import { NativeSpeechRecognizer, type NativeSpeechEvents } from '../adapters/native-speech/index.js'
import { JwtTokenVerifier } from '../adapters/jwt/index.js'
import { WebSpeechRecognizer } from '../adapters/web-speech/index.js'
import type {
  SpeechRecognitionAlternativeLike,
  SpeechRecognitionErrorEventLike,
  SpeechRecognitionEventLike,
  SpeechRecognitionLike,
  SpeechRecognitionResultLike,
  SpeechRecognitionScope,
} from '../adapters/web-speech/types.js'
import { createEmbeddedVoice } from '../embedded.js'
import { createHttpApp } from '../http/index.js'
import type { AudioClip, TargetCandidate } from '../ports/index.js'
import { VoiceSession, type VoiceSessionState } from '../session/index.js'
import type { VoiceOutcome } from '../core/index.js'

/**
 * Every other suite exercises one piece against fakes. These run the real
 * pieces together, faking only what genuinely cannot exist in a test
 * process: a browser's speech engine, a phone's, and somebody's cloud API.
 * Everything between the transcript and the answer is the shipped code.
 */

const CANDIDATES: readonly TargetCandidate[] = [
  { id: 'goal_42', name: 'Deen', kind: 'goal', aliases: ['Islamic Studies'] },
  { id: 'goal_43', name: 'Fitness', kind: 'goal' },
  { id: 'task_7', name: 'Invoices', kind: 'task' },
  { id: 'cat_3', name: 'Deep Work', kind: 'category' },
]

const CLIP: AudioClip = { data: new Uint8Array([1, 2, 3]), mimeType: 'audio/webm' }
const SECRET = new TextEncoder().encode('an-integration-secret-long-enough')

function speechResult(
  isFinal: boolean,
  readings: ReadonlyArray<readonly [string, number]>,
): SpeechRecognitionResultLike {
  const alternatives: Record<number, SpeechRecognitionAlternativeLike> = {}
  readings.forEach(([transcript, confidence], index) => {
    alternatives[index] = { transcript, confidence }
  })
  return Object.assign(alternatives, { isFinal, length: readings.length })
}

/** The browser's engine, and nothing else about the browser path. */
class FakeBrowserEngine implements SpeechRecognitionLike {
  lang = ''
  continuous = false
  interimResults = false
  maxAlternatives = 1
  onresult: ((event: SpeechRecognitionEventLike) => void) | null = null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null = null
  onend: (() => void) | null = null

  private readonly results: SpeechRecognitionResultLike[] = []

  start(): void {}
  stop(): void {}
  abort(): void {}

  hear(isFinal: boolean, ...readings: ReadonlyArray<readonly [string, number]>): void {
    const pending = this.results.length - 1
    const replacesInterim = isFinal && pending >= 0 && this.results[pending]?.isFinal === false

    if (replacesInterim) {
      this.results[pending] = speechResult(isFinal, readings)
    } else {
      this.results.push(speechResult(isFinal, readings))
    }

    const list = Object.assign(
      Object.fromEntries(this.results.map((result, index) => [index, result])),
      { length: this.results.length },
    )
    this.onresult?.({ resultIndex: this.results.length - 1, results: list })
  }

  finish(): void {
    this.onend?.()
  }
}

function browserScope(engine: FakeBrowserEngine): SpeechRecognitionScope {
  return {
    SpeechRecognition: function FakeConstructor(): SpeechRecognitionLike {
      return engine
    } as unknown as SpeechRecognitionScope['SpeechRecognition'],
  }
}

function jsonFetch(body: unknown): typeof globalThis.fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof globalThis.fetch
}

async function signedToken(): Promise<string> {
  return new SignJWT({ sub: 'user_1' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('5m')
    .sign(SECRET)
}

function app() {
  return createHttpApp({ tokenVerifier: new JwtTokenVerifier(SECRET) })
}

describe('the browser path, end to end', () => {
  it('carries a spoken command from the engine to a record id', async () => {
    const engine = new FakeBrowserEngine()
    const voice = createEmbeddedVoice({ candidates: CANDIDATES })
    const states: Array<VoiceSessionState<VoiceOutcome>> = []

    const session = new VoiceSession<VoiceOutcome>({
      recognizer: new WebSpeechRecognizer({ scope: browserScope(engine) }),
      handle: (transcript, heard) => voice.interpret(heard ?? transcript),
    })
    session.subscribe((state) => states.push(state))

    session.start()
    engine.hear(false, ['start tracking', 0.4])
    engine.hear(true, ['start tracking time for my deen goal', 0.94])
    engine.finish()

    await vi.waitFor(() => expect(session.state.status).toBe('result'))

    expect(session.state.result).toMatchObject({
      kind: 'command',
      intent: { type: 'START_TRACKING' },
      target: { id: 'goal_42', name: 'Deen' },
    })
    expect(states.map((state) => state.status)).toEqual([
      'listening',
      'listening',
      'processing',
      'result',
    ])
  })

  it('shows the words before it has an answer', async () => {
    const engine = new FakeBrowserEngine()
    const voice = createEmbeddedVoice({ candidates: CANDIDATES })

    const session = new VoiceSession<VoiceOutcome>({
      recognizer: new WebSpeechRecognizer({ scope: browserScope(engine) }),
      handle: (transcript, heard) => voice.interpret(heard ?? transcript),
    })

    session.start()
    engine.hear(false, ['stop tra', 0.3])
    expect(session.state.interimTranscript).toBe('stop tra')

    engine.hear(true, ['stop tracking', 0.9])
    engine.finish()
    await vi.waitFor(() => expect(session.state.status).toBe('result'))
    expect(session.state.interimTranscript).toBe('')
  })

  it('hands an utterance it cannot answer back with the words intact', async () => {
    const engine = new FakeBrowserEngine()
    const voice = createEmbeddedVoice({ candidates: CANDIDATES })

    const session = new VoiceSession<VoiceOutcome>({
      recognizer: new WebSpeechRecognizer({ scope: browserScope(engine) }),
      handle: (transcript, heard) => voice.interpret(heard ?? transcript),
    })

    session.start()
    engine.hear(true, ['how much time did i spend on deen last week', 0.9])
    engine.finish()

    await vi.waitFor(() => expect(session.state.status).toBe('result'))
    expect(session.state.result).toMatchObject({
      kind: 'fallback',
      transcript: 'how much time did i spend on deen last week',
    })
  })

  it('recovers the command from the engine second guess, and asks about it', async () => {
    const engine = new FakeBrowserEngine()
    const voice = createEmbeddedVoice({ candidates: CANDIDATES })

    const session = new VoiceSession<VoiceOutcome>({
      recognizer: new WebSpeechRecognizer({ scope: browserScope(engine) }),
      handle: (transcript, heard) => voice.interpret(heard ?? transcript),
    })

    session.start()
    engine.hear(true, ['what tracking dean', 0.51], ['start tracking deen', 0.44])
    engine.finish()

    await vi.waitFor(() => expect(session.state.status).toBe('result'))
    // Understood, but the recognizer ranked it second for a reason, so it
    // comes back as something to confirm rather than something to run.
    expect(session.state.result).toMatchObject({
      kind: 'confirm',
      intent: { type: 'START_TRACKING' },
      target: { id: 'goal_42' },
    })
  })
})

describe('the platform engine path, end to end', () => {
  it('carries a spoken command from a host module to a record id', async () => {
    const wired: { events: NativeSpeechEvents | null } = { events: null }
    const voice = createEmbeddedVoice({ candidates: CANDIDATES })

    const session = new VoiceSession<VoiceOutcome>({
      recognizer: new NativeSpeechRecognizer({
        subscribe: (handlers) => {
          wired.events = handlers
          return () => {
            wired.events = null
          }
        },
        start: () => {},
        stop: () => {},
        cancel: () => {},
      }),
      handle: (transcript, heard) => voice.interpret(heard ?? transcript),
    })

    session.start()
    await vi.waitFor(() => expect(wired.events).not.toBeNull())

    wired.events?.onResults(['log an hour and a half to my deen goal'], [0.95])

    await vi.waitFor(() => expect(session.state.status).toBe('result'))
    expect(session.state.result).toMatchObject({
      kind: 'command',
      intent: { type: 'LOG_TIME', durationMinutes: 90 },
      target: { id: 'goal_42' },
    })
  })
})

describe('the recorded audio path, end to end', () => {
  function voiceWith(body: unknown) {
    return createEmbeddedVoice({
      candidates: CANDIDATES,
      speechToText: new HttpSpeechToText({
        url: 'https://stt.test/v1',
        fetch: jsonFetch(body),
        parse: (payload) => {
          const answer = payload as { best: string; score: number; also?: string[] }
          return {
            transcript: answer.best,
            confidence: answer.score,
            alternatives: (answer.also ?? []).map((transcript) => ({
              transcript,
              confidence: 0.3,
            })),
          }
        },
      }),
    })
  }

  it('transcribes, parses, resolves, and decides', async () => {
    const outcome = await voiceWith({
      best: 'start tracking the invoices task',
      score: 0.9,
    }).interpretAudio(CLIP)

    expect(outcome).toMatchObject({
      kind: 'command',
      intent: { type: 'START_TRACKING' },
      target: { id: 'task_7' },
    })
  })

  it('multiplies the recognizer confidence into the answer', async () => {
    const outcome = await voiceWith({ best: 'stop tracking', score: 0.6 }).interpretAudio(CLIP)

    expect(outcome.kind).toBe('confirm')
  })

  it('falls through to an alternative the parser can read', async () => {
    const outcome = await voiceWith({
      best: 'star tracking dean',
      score: 0.6,
      also: ['start tracking deen'],
    }).interpretAudio(CLIP)

    expect(outcome).toMatchObject({
      kind: 'confirm',
      intent: { type: 'START_TRACKING' },
      target: { id: 'goal_42' },
    })
  })

  it('reports silence as having heard nothing', async () => {
    const outcome = await voiceWith({ best: '', score: 0 }).interpretAudio(CLIP)

    expect(outcome).toMatchObject({ kind: 'fallback', reason: 'nothing-heard' })
  })
})

describe('the service, booted', () => {
  it('answers a signed request with a resolved command', async () => {
    const response = await request(app())
      .post('/commands')
      .set('authorization', `Bearer ${await signedToken()}`)
      .send({ transcript: 'start tracking time for my deen goal', candidates: CANDIDATES })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      kind: 'command',
      intent: { type: 'START_TRACKING' },
      target: { id: 'goal_42' },
    })
  })

  it('answers an utterance beyond it with a fallback carrying the words', async () => {
    const response = await request(app())
      .post('/commands')
      .set('authorization', `Bearer ${await signedToken()}`)
      .send({
        transcript: 'move my deen block to thursday and tell me last week total',
        candidates: CANDIDATES,
      })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      kind: 'fallback',
      transcript: 'move my deen block to thursday and tell me last week total',
    })
  })

  it('offers a choice rather than guessing between two names that sound alike', async () => {
    const response = await request(app())
      .post('/commands')
      .set('authorization', `Bearer ${await signedToken()}`)
      .send({
        transcript: 'start tracking deen',
        candidates: [
          { id: 'a', name: 'Dean', kind: 'goal' },
          { id: 'b', name: 'Dan', kind: 'goal' },
        ],
      })

    expect(response.body).toMatchObject({ kind: 'confirm', target: null })
    expect(response.body.options).toHaveLength(2)
  })

  it('rejects a request with no token', async () => {
    const response = await request(app()).post('/commands').send({ transcript: 'stop' })

    expect(response.status).toBe(401)
  })

  it('rejects a token signed with the wrong key', async () => {
    const wrong = await new SignJWT({ sub: 'user_1' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('a-completely-different-secret'))

    const response = await request(app())
      .post('/commands')
      .set('authorization', `Bearer ${wrong}`)
      .send({ transcript: 'stop' })

    expect(response.status).toBe(401)
  })

  it('rejects an expired token', async () => {
    const expired = await new SignJWT({ sub: 'user_1' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('-1m')
      .sign(SECRET)

    const response = await request(app())
      .post('/commands')
      .set('authorization', `Bearer ${expired}`)
      .send({ transcript: 'stop' })

    expect(response.status).toBe(401)
  })

  it('rejects a malformed body, naming the field', async () => {
    const response = await request(app())
      .post('/commands')
      .set('authorization', `Bearer ${await signedToken()}`)
      .send({ transcript: 'stop', candidates: [{ id: 'a', name: 'Deen' }] })

    expect(response.status).toBe(400)
    expect(response.body.error).toContain('candidates[0].kind')
  })

  it('serves liveness and readiness without a token', async () => {
    await expect(request(app()).get('/health')).resolves.toMatchObject({ status: 200 })
    await expect(request(app()).get('/ready')).resolves.toMatchObject({ status: 200 })
  })
})

describe('both modes', () => {
  const transcripts = [
    'start tracking time for my deen goal',
    'log 30 minutes to my deen goal',
    'stop tracking',
    'done',
    'what did i work on yesterday',
    'start tracking my gardening goal',
  ]

  it.each(transcripts)('answer %j identically', async (transcript) => {
    const embedded = await createEmbeddedVoice({ candidates: CANDIDATES }).interpret(transcript)

    const response = await request(app())
      .post('/commands')
      .set('authorization', `Bearer ${await signedToken()}`)
      .send({ transcript, candidates: CANDIDATES })

    expect(response.body).toEqual(JSON.parse(JSON.stringify(embedded)))
  })
})
