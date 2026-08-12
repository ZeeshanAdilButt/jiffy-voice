import { describe, expect, it, vi } from 'vitest'

import type {
  RecognitionHandlers,
  RecognitionOptions,
  RecognitionSession,
  SpeechRecognizer,
  TranscriptionResult,
} from '../ports/index.js'
import { heardNothing, VoiceSession, type VoiceSessionState } from './voice-session.js'

/**
 * A recognizer whose events a test fires by hand, since everything worth
 * checking here is about what the session does between them.
 */
class DrivenRecognizer implements SpeechRecognizer {
  handlers: RecognitionHandlers = {}
  options: RecognitionOptions = {}
  starts = 0
  stops = 0
  aborts = 0
  startThrows: Error | null = null

  start(handlers: RecognitionHandlers, options: RecognitionOptions = {}): RecognitionSession {
    this.starts += 1
    if (this.startThrows !== null) throw this.startThrows

    this.handlers = handlers
    this.options = options

    return {
      stop: () => {
        this.stops += 1
      },
      abort: () => {
        this.aborts += 1
      },
    }
  }

  say(transcript: string): void {
    this.handlers.onInterim?.(transcript)
  }

  settle(transcript: string, confidence = 0.9): void {
    const result: TranscriptionResult = { transcript, confidence }
    this.handlers.onResult?.(result)
  }

  fail(error: Error): void {
    this.handlers.onError?.(error)
  }

  finish(): void {
    this.handlers.onEnd?.()
  }
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: Error) => void
} {
  let resolve: (value: T) => void = () => {}
  let reject: (error: Error) => void = () => {}
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

function setup(handle?: (transcript: string) => Promise<string>) {
  const recognizer = new DrivenRecognizer()
  const seen: string[] = []
  const states: Array<VoiceSessionState<string>> = []

  const session = new VoiceSession<string>({
    recognizer,
    handle:
      handle ??
      (async (transcript) => {
        seen.push(transcript)
        return `handled:${transcript}`
      }),
  })

  session.subscribe((state) => states.push(state))

  return { recognizer, session, seen, states }
}

describe('VoiceSession', () => {
  it('starts idle', () => {
    const { session } = setup()

    expect(session.state).toEqual({
      status: 'idle',
      interimTranscript: '',
      transcript: null,
      result: null,
      error: null,
    })
  })

  it('listens when started', () => {
    const { session, recognizer } = setup()
    session.start()

    expect(session.state.status).toBe('listening')
    expect(recognizer.starts).toBe(1)
  })

  it('exposes words while they are still being spoken', () => {
    const { session, recognizer } = setup()
    session.start()

    recognizer.say('start')
    expect(session.state.interimTranscript).toBe('start')

    recognizer.say('start tracking deen')
    expect(session.state.interimTranscript).toBe('start tracking deen')
  })

  it('runs the handler on a settled transcript', async () => {
    const { session, recognizer, seen } = setup()
    session.start()

    recognizer.settle('start tracking deen')
    await vi.waitFor(() => expect(session.state.status).toBe('result'))

    expect(seen).toEqual(['start tracking deen'])
    expect(session.state.result).toBe('handled:start tracking deen')
    expect(session.state.transcript).toBe('start tracking deen')
  })

  it('clears the interim transcript once the words settle', async () => {
    const { session, recognizer } = setup()
    session.start()

    recognizer.say('start track')
    recognizer.settle('start tracking')
    await vi.waitFor(() => expect(session.state.status).toBe('result'))

    expect(session.state.interimTranscript).toBe('')
  })

  it('passes through processing on the way to a result', async () => {
    const pending = deferred<string>()
    const { session, recognizer, states } = setup(async () => pending.promise)

    session.start()
    recognizer.settle('stop tracking')
    await vi.waitFor(() => expect(session.state.status).toBe('processing'))

    pending.resolve('done')
    await vi.waitFor(() => expect(session.state.status).toBe('result'))

    expect(states.map((state) => state.status)).toEqual(['listening', 'processing', 'result'])
  })

  describe('stopping', () => {
    it('moves to processing as soon as the microphone is released', () => {
      const { session, recognizer } = setup()
      session.start()
      session.stop()

      expect(session.state.status).toBe('processing')
      expect(recognizer.stops).toBe(1)
    })

    it('still waits for the recognizer to settle', async () => {
      const { session, recognizer } = setup()
      session.start()
      session.stop()

      recognizer.settle('stop tracking')
      await vi.waitFor(() => expect(session.state.status).toBe('result'))
      expect(session.state.result).toBe('handled:stop tracking')
    })

    it('does nothing when there is nothing to stop', () => {
      const { session, recognizer } = setup()
      session.stop()

      expect(session.state.status).toBe('idle')
      expect(recognizer.stops).toBe(0)
    })
  })

  describe('hearing nothing', () => {
    it('finishes without an error and without a result', async () => {
      const { session, recognizer, seen } = setup()
      session.start()

      recognizer.settle('')
      await vi.waitFor(() => expect(session.state.status).toBe('result'))

      expect(session.state.error).toBeNull()
      expect(session.state.result).toBeNull()
      expect(seen).toEqual([])
      expect(heardNothing(session.state)).toBe(true)
    })

    it('is not confused with a handled command', async () => {
      const { session, recognizer } = setup()
      session.start()

      recognizer.settle('stop tracking')
      await vi.waitFor(() => expect(session.state.status).toBe('result'))

      expect(heardNothing(session.state)).toBe(false)
    })

    it('covers a recognizer that ends without settling at all', async () => {
      const { session, recognizer } = setup()
      session.start()
      recognizer.finish()

      await vi.waitFor(() => expect(session.state.status).toBe('result'))
      expect(heardNothing(session.state)).toBe(true)
    })

    it('covers a recognizer that ends without settling after a stop', async () => {
      const { session, recognizer } = setup()
      session.start()
      session.stop()
      recognizer.finish()

      await vi.waitFor(() => expect(heardNothing(session.state)).toBe(true))
    })
  })

  describe('failures', () => {
    it('reports a recognizer failure', () => {
      const { session, recognizer } = setup()
      session.start()

      const failure = new Error('microphone denied')
      recognizer.fail(failure)

      expect(session.state.status).toBe('error')
      expect(session.state.error).toBe(failure)
    })

    it('reports a handler failure', async () => {
      const { session, recognizer } = setup(async () => {
        throw new Error('resolver is down')
      })

      session.start()
      recognizer.settle('start tracking deen')

      await vi.waitFor(() => expect(session.state.status).toBe('error'))
      expect(session.state.error?.message).toBe('resolver is down')
    })

    it('reports a recognizer that refuses to start', () => {
      const { session, recognizer } = setup()
      recognizer.startThrows = new Error('unsupported')

      session.start()
      expect(session.state).toMatchObject({ status: 'error', error: { message: 'unsupported' } })
    })

    it('ignores the end event after a failure', () => {
      const { session, recognizer } = setup()
      session.start()

      recognizer.fail(new Error('network'))
      recognizer.finish()

      expect(session.state.status).toBe('error')
    })
  })

  describe('cancelling', () => {
    it('goes back to idle from listening and aborts the recognizer', () => {
      const { session, recognizer } = setup()
      session.start()

      recognizer.say('start tra')
      session.cancel()

      expect(session.state.status).toBe('idle')
      expect(session.state.interimTranscript).toBe('')
      expect(recognizer.aborts).toBe(1)
    })

    it('goes back to idle from processing', async () => {
      const pending = deferred<string>()
      const { session, recognizer } = setup(async () => pending.promise)

      session.start()
      recognizer.settle('start tracking deen')
      await vi.waitFor(() => expect(session.state.status).toBe('processing'))

      session.cancel()
      expect(session.state.status).toBe('idle')
    })

    it('throws away a handler result that lands after the cancel', async () => {
      const pending = deferred<string>()
      const { session, recognizer } = setup(async () => pending.promise)

      session.start()
      recognizer.settle('start tracking deen')
      await vi.waitFor(() => expect(session.state.status).toBe('processing'))

      session.cancel()
      pending.resolve('too late')
      await Promise.resolve()

      expect(session.state.status).toBe('idle')
      expect(session.state.result).toBeNull()
    })

    it('throws away a handler failure that lands after the cancel', async () => {
      const pending = deferred<string>()
      const { session, recognizer } = setup(async () => pending.promise)

      session.start()
      recognizer.settle('start tracking deen')
      await vi.waitFor(() => expect(session.state.status).toBe('processing'))

      session.cancel()
      pending.reject(new Error('too late'))
      await Promise.resolve()

      expect(session.state.status).toBe('idle')
      expect(session.state.error).toBeNull()
    })

    it('ignores recognizer events from the cancelled session', () => {
      const { session, recognizer } = setup()
      session.start()
      session.cancel()

      recognizer.say('too late')
      recognizer.fail(new Error('too late'))

      expect(session.state.status).toBe('idle')
    })

    it('works from a finished session', async () => {
      const { session, recognizer } = setup()
      session.start()
      recognizer.settle('stop')
      await vi.waitFor(() => expect(session.state.status).toBe('result'))

      session.cancel()
      expect(session.state.status).toBe('idle')
    })

    it('is quiet when there is nothing to cancel', () => {
      const { session, states } = setup()
      session.cancel()

      expect(states).toEqual([])
    })
  })

  describe('restarting', () => {
    it('clears the previous result', async () => {
      const { session, recognizer } = setup()
      session.start()
      recognizer.settle('stop')
      await vi.waitFor(() => expect(session.state.status).toBe('result'))

      session.start()
      expect(session.state).toMatchObject({
        status: 'listening',
        result: null,
        transcript: null,
      })
    })

    it('is ignored while already listening', () => {
      const { session, recognizer } = setup()
      session.start()
      session.start()

      expect(recognizer.starts).toBe(1)
    })

    it('is ignored while still processing', async () => {
      const pending = deferred<string>()
      const { session, recognizer } = setup(async () => pending.promise)

      session.start()
      recognizer.settle('stop')
      await vi.waitFor(() => expect(session.state.status).toBe('processing'))

      session.start()
      expect(recognizer.starts).toBe(1)
    })

    it('drops a result from the session it replaced', async () => {
      const pending = deferred<string>()
      const { session, recognizer } = setup(async () => pending.promise)

      session.start()
      recognizer.fail(new Error('network'))
      session.start()

      pending.resolve('stale')
      await Promise.resolve()

      expect(session.state.status).toBe('listening')
    })
  })

  describe('subscribers', () => {
    it('sees every state change', () => {
      const { session, states } = setup()
      session.start()

      expect(states.map((state) => state.status)).toEqual(['listening'])
    })

    it('stops hearing once unsubscribed', () => {
      const { session } = setup()
      const seen: string[] = []
      const unsubscribe = session.subscribe((state) => seen.push(state.status))

      session.start()
      unsubscribe()
      session.cancel()

      expect(seen).toEqual(['listening'])
    })

    it('gets a new state object each time, so identity checks work', () => {
      const { session, recognizer } = setup()
      session.start()
      const before = session.state

      recognizer.say('start')
      expect(session.state).not.toBe(before)
    })
  })

  it('passes recognition options through', () => {
    const recognizer = new DrivenRecognizer()
    const session = new VoiceSession<string>({
      recognizer,
      handle: async (transcript) => transcript,
      language: 'en-GB',
      maxAlternatives: 5,
    })

    session.start()
    expect(recognizer.options).toEqual({ language: 'en-GB', maxAlternatives: 5 })
  })
})
