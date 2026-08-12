import { describe, expect, it, vi } from 'vitest'

import {
  AudioCaptureError,
  MicrophonePermissionDeniedError,
  RecognizerNetworkError,
  SpeechRecognitionFailedError,
} from '../../core/errors.js'
import type { RecognitionHandlers, TranscriptionResult } from '../../ports/index.js'
import type { NativeSpeechEvents, NativeSpeechModule, NativeSpeechStartOptions } from './module.js'
import { mapNativeError, NativeSpeechRecognizer } from './recognizer.js'

/** Stands in for whatever a host wrapped its platform engine in. */
class FakeModule implements NativeSpeechModule {
  events: NativeSpeechEvents | null = null
  started: NativeSpeechStartOptions[] = []
  stops = 0
  cancels = 0
  teardowns = 0
  startRejects: Error | null = null
  stopRejects: Error | null = null

  subscribe(events: NativeSpeechEvents): () => void {
    this.events = events
    return () => {
      this.teardowns += 1
    }
  }

  async start(options: NativeSpeechStartOptions): Promise<void> {
    this.started.push(options)
    if (this.startRejects !== null) throw this.startRejects
  }

  async stop(): Promise<void> {
    this.stops += 1
    if (this.stopRejects !== null) throw this.stopRejects
  }

  async cancel(): Promise<void> {
    this.cancels += 1
  }
}

function setup() {
  const speech = new FakeModule()
  const interim: string[] = []
  const results: TranscriptionResult[] = []
  const errors: Error[] = []
  let ends = 0

  const handlers: RecognitionHandlers = {
    onInterim: (text) => interim.push(text),
    onResult: (result) => results.push(result),
    onError: (error) => errors.push(error),
    onEnd: () => {
      ends += 1
    },
  }

  return {
    speech,
    interim,
    results,
    errors,
    endCount: () => ends,
    recognizer: new NativeSpeechRecognizer(speech),
    handlers,
  }
}

describe('mapNativeError', () => {
  const cases: ReadonlyArray<readonly [string | number, string]> = [
    ['no-speech', 'silence'],
    ['no_match', 'silence'],
    [7, 'silence'],
    [6, 'silence'],
    ['cancelled', 'cancelled'],
    ['aborted', 'cancelled'],
    ['not-allowed', 'failure'],
    ['insufficient_permissions', 'failure'],
    [9, 'failure'],
    ['network', 'failure'],
    ['audio', 'failure'],
    ['something-else', 'failure'],
  ]

  it.each(cases)('sorts %s as %s', (code, kind) => {
    expect(mapNativeError({ code }).kind).toBe(kind)
  })

  it('reads the numeric codes Android reports as the strings other engines do', () => {
    expect(mapNativeError({ code: 9 }).error).toBeInstanceOf(MicrophonePermissionDeniedError)
    expect(mapNativeError({ code: 3 }).error).toBeInstanceOf(AudioCaptureError)
    expect(mapNativeError({ code: 2 }).error).toBeInstanceOf(RecognizerNetworkError)
  })

  it('keeps an unrecognized code rather than losing it', () => {
    const mapped = mapNativeError({ code: 'BUSY', message: 'engine in use' })

    expect(mapped.error).toBeInstanceOf(SpeechRecognitionFailedError)
    expect(mapped.error).toMatchObject({ code: 'busy' })
    expect(mapped.error?.message).toContain('engine in use')
  })

  it('copes with an error carrying no code at all', () => {
    expect(mapNativeError({}).error).toMatchObject({ code: 'unknown' })
  })
})

describe('NativeSpeechRecognizer', () => {
  it('starts the module', async () => {
    const { recognizer, speech, handlers } = setup()
    recognizer.start(handlers)

    await vi.waitFor(() => expect(speech.started).toHaveLength(1))
  })

  it('passes the language and reading count through', async () => {
    const { recognizer, speech, handlers } = setup()
    recognizer.start(handlers, { language: 'ur-PK', maxAlternatives: 2 })

    await vi.waitFor(() =>
      expect(speech.started[0]).toEqual({ language: 'ur-PK', maxAlternatives: 2 }),
    )
  })

  it('asks for several readings by default', async () => {
    const { recognizer, speech, handlers } = setup()
    recognizer.start(handlers)

    await vi.waitFor(() => expect(speech.started[0]?.maxAlternatives).toBeGreaterThan(1))
  })

  it('reports words while they are still being spoken', () => {
    const { recognizer, speech, handlers, interim } = setup()
    recognizer.start(handlers)

    speech.events?.onPartial(['start tracking'])
    expect(interim).toEqual(['start tracking'])
  })

  it('ignores an empty partial', () => {
    const { recognizer, speech, handlers, interim } = setup()
    recognizer.start(handlers)

    speech.events?.onPartial([' '])
    speech.events?.onPartial([])
    expect(interim).toEqual([])
  })

  it('delivers the settled transcript', () => {
    const { recognizer, speech, handlers, results } = setup()
    recognizer.start(handlers)

    speech.events?.onResults(['start tracking deen'], [0.8])
    expect(results[0]).toEqual({ transcript: 'start tracking deen', confidence: 0.8 })
  })

  it('carries the other readings as alternatives', () => {
    const { recognizer, speech, handlers, results } = setup()
    recognizer.start(handlers)

    speech.events?.onResults(['star tracking dean', 'start tracking deen'], [0.6, 0.5])
    expect(results[0]?.alternatives).toEqual([
      { transcript: 'start tracking deen', confidence: 0.5 },
    ])
  })

  it('drops a repeated reading', () => {
    const { recognizer, speech, handlers, results } = setup()
    recognizer.start(handlers)

    speech.events?.onResults(['stop', 'stop'])
    expect(results[0]?.alternatives).toBeUndefined()
  })

  it('reports no confidence rather than inventing one', () => {
    const { recognizer, speech, handlers, results } = setup()
    recognizer.start(handlers)

    speech.events?.onResults(['stop tracking'])
    expect(results[0]).toEqual({ transcript: 'stop tracking', confidence: 0 })
  })

  it('delivers one result however many events arrive', () => {
    const { recognizer, speech, handlers, results } = setup()
    recognizer.start(handlers)

    speech.events?.onResults(['stop'])
    speech.events?.onResults(['start'])
    speech.events?.onEnd()

    expect(results).toHaveLength(1)
    expect(results[0]?.transcript).toBe('stop')
  })

  describe('hearing nothing', () => {
    it('is a result, not an error', () => {
      const { recognizer, speech, handlers, results, errors } = setup()
      recognizer.start(handlers)

      speech.events?.onError({ code: 'no-speech' })

      expect(errors).toEqual([])
      expect(results[0]).toEqual({ transcript: '', confidence: 0 })
    })

    it('covers an engine that ends without reporting anything', () => {
      const { recognizer, speech, handlers, results } = setup()
      recognizer.start(handlers)

      speech.events?.onEnd()
      expect(results[0]).toEqual({ transcript: '', confidence: 0 })
    })

    it('covers results that are all empty', () => {
      const { recognizer, speech, handlers, results } = setup()
      recognizer.start(handlers)

      speech.events?.onResults(['  '])
      expect(results[0]).toEqual({ transcript: '', confidence: 0 })
    })
  })

  describe('failures', () => {
    it('are typed the same way whichever recognizer produced them', () => {
      const { recognizer, speech, handlers, errors } = setup()
      recognizer.start(handlers)

      speech.events?.onError({ code: 9 })
      expect(errors[0]).toBeInstanceOf(MicrophonePermissionDeniedError)
    })

    it('do not also deliver a result', () => {
      const { recognizer, speech, handlers, results } = setup()
      recognizer.start(handlers)

      speech.events?.onError({ code: 'network' })
      speech.events?.onEnd()

      expect(results).toEqual([])
    })

    it('cover a module that refuses to start', async () => {
      const { recognizer, speech, handlers, errors } = setup()
      speech.startRejects = new Error('engine unavailable')

      recognizer.start(handlers)
      await vi.waitFor(() => expect(errors[0]?.message).toBe('engine unavailable'))
    })

    it('cover a stop that fails, rather than leaving the caller waiting', async () => {
      const { recognizer, speech, handlers, results } = setup()
      speech.stopRejects = new Error('engine gone')

      const session = recognizer.start(handlers)
      session.stop()

      await vi.waitFor(() => expect(results[0]).toEqual({ transcript: '', confidence: 0 }))
    })

    it('take a host mapping over the built-in one', () => {
      const speech = new FakeModule()
      const errors: Error[] = []
      const recognizer = new NativeSpeechRecognizer(speech, {
        mapError: () => ({ kind: 'silence', error: null }),
      })

      recognizer.start({ onError: (error) => errors.push(error) })
      speech.events?.onError({ code: 'network' })

      expect(errors).toEqual([])
    })
  })

  describe('the session lifecycle', () => {
    it('ends exactly once', () => {
      const { recognizer, speech, handlers, endCount } = setup()
      recognizer.start(handlers)

      speech.events?.onResults(['stop'])
      speech.events?.onEnd()

      expect(endCount()).toBe(1)
    })

    it('ends after a failure even when the engine says nothing more', () => {
      const { recognizer, speech, handlers, endCount } = setup()
      recognizer.start(handlers)

      speech.events?.onError({ code: 'network' })
      expect(endCount()).toBe(1)
    })

    it('unsubscribes from the module when it ends', () => {
      const { recognizer, speech, handlers } = setup()
      recognizer.start(handlers)

      speech.events?.onResults(['stop'])
      expect(speech.teardowns).toBe(1)
    })

    it('stops the module on request', async () => {
      const { recognizer, speech, handlers } = setup()
      recognizer.start(handlers).stop()

      await vi.waitFor(() => expect(speech.stops).toBe(1))
    })
  })

  describe('aborting', () => {
    it('cancels the module and throws away what was heard', async () => {
      const { recognizer, speech, handlers, results } = setup()
      const session = recognizer.start(handlers)

      session.abort()
      speech.events?.onResults(['start tracking deen'])

      await vi.waitFor(() => expect(speech.cancels).toBe(1))
      expect(results).toEqual([])
    })

    it('ends the session immediately', () => {
      const { recognizer, handlers, endCount } = setup()
      recognizer.start(handlers).abort()

      expect(endCount()).toBe(1)
    })

    it('treats an engine-reported cancellation the same way', () => {
      const { recognizer, speech, handlers, results, errors, endCount } = setup()
      recognizer.start(handlers)

      speech.events?.onError({ code: 'cancelled' })
      speech.events?.onEnd()

      expect(results).toEqual([])
      expect(errors).toEqual([])
      expect(endCount()).toBe(1)
    })
  })
})
