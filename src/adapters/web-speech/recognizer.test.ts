import { describe, expect, it, vi } from 'vitest'

import type { RecognitionHandlers, TranscriptionResult } from '../../ports/index.js'
import {
  AudioCaptureError,
  MicrophonePermissionDeniedError,
  RecognizerNetworkError,
  SpeechRecognitionFailedError,
  SpeechRecognitionUnsupportedError,
} from './errors.js'
import { isWebSpeechSupported, WebSpeechRecognizer } from './recognizer.js'
import type {
  SpeechRecognitionAlternativeLike,
  SpeechRecognitionErrorEventLike,
  SpeechRecognitionEventLike,
  SpeechRecognitionLike,
  SpeechRecognitionResultLike,
  SpeechRecognitionResultListLike,
  SpeechRecognitionScope,
} from './types.js'

type Reading = readonly [transcript: string, confidence: number]

function speechResult(isFinal: boolean, readings: readonly Reading[]): SpeechRecognitionResultLike {
  const alternatives: Record<number, SpeechRecognitionAlternativeLike> = {}
  readings.forEach(([transcript, confidence], index) => {
    alternatives[index] = { transcript, confidence }
  })

  return Object.assign(alternatives, { isFinal, length: readings.length })
}

function resultList(
  results: readonly SpeechRecognitionResultLike[],
): SpeechRecognitionResultListLike {
  const list: Record<number, SpeechRecognitionResultLike> = {}
  results.forEach((result, index) => {
    list[index] = result
  })

  return Object.assign(list, { length: results.length })
}

/**
 * Models the event sequence a real engine produces rather than the answer it
 * eventually gives, because every case worth testing here is about ordering:
 * an error arriving before the end, an end arriving without one, results
 * landing after an abort.
 */
class FakeRecognition implements SpeechRecognitionLike {
  lang = ''
  continuous = false
  interimResults = false
  maxAlternatives = 1
  onresult: ((event: SpeechRecognitionEventLike) => void) | null = null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null = null
  onend: (() => void) | null = null

  starts = 0
  stops = 0
  aborts = 0
  startThrows: Error | null = null

  private readonly results: SpeechRecognitionResultLike[] = []

  start(): void {
    this.starts += 1
    if (this.startThrows !== null) throw this.startThrows
  }

  stop(): void {
    this.stops += 1
  }

  abort(): void {
    this.aborts += 1
  }

  hear(isFinal: boolean, ...readings: readonly Reading[]): void {
    const resultIndex = this.results.length
    this.results.push(speechResult(isFinal, readings))
    this.onresult?.({ resultIndex, results: resultList(this.results) })
  }

  /** Replaces the pending interim, the way an engine revises its guess. */
  revise(...readings: readonly Reading[]): void {
    const resultIndex = Math.max(this.results.length - 1, 0)
    this.results[resultIndex] = speechResult(false, readings)
    this.onresult?.({ resultIndex, results: resultList(this.results) })
  }

  fail(error: string, message?: string): void {
    this.onerror?.(message === undefined ? { error } : { error, message })
  }

  finish(): void {
    this.onend?.()
  }
}

function constructorFor(recognition: FakeRecognition): SpeechRecognitionScope['SpeechRecognition'] {
  return function FakeConstructor(): SpeechRecognitionLike {
    return recognition
  } as unknown as SpeechRecognitionScope['SpeechRecognition']
}

interface Harness {
  readonly recognition: FakeRecognition
  readonly recognizer: WebSpeechRecognizer
  readonly interim: string[]
  readonly results: TranscriptionResult[]
  readonly errors: Error[]
  readonly ends: number[]
  readonly handlers: RecognitionHandlers
}

function harness(options: { prefixed?: boolean } = {}): Harness {
  const recognition = new FakeRecognition()
  const constructor = constructorFor(recognition)

  const scope: SpeechRecognitionScope =
    options.prefixed === true
      ? { webkitSpeechRecognition: constructor }
      : { SpeechRecognition: constructor }

  const interim: string[] = []
  const results: TranscriptionResult[] = []
  const errors: Error[] = []
  const ends: number[] = []

  return {
    recognition,
    recognizer: new WebSpeechRecognizer({ scope }),
    interim,
    results,
    errors,
    ends,
    handlers: {
      onInterim: (text) => interim.push(text),
      onResult: (result) => results.push(result),
      onError: (error) => errors.push(error),
      onEnd: () => ends.push(ends.length),
    },
  }
}

describe('isWebSpeechSupported', () => {
  it('is false when the environment has no recognizer', () => {
    expect(isWebSpeechSupported({})).toBe(false)
  })

  it('is true for the standard name', () => {
    expect(isWebSpeechSupported({ SpeechRecognition: constructorFor(new FakeRecognition()) })).toBe(
      true,
    )
    expect(harness().recognizer.supported).toBe(true)
  })

  it('is true for the prefixed name engines still ship', () => {
    expect(harness({ prefixed: true }).recognizer.supported).toBe(true)
  })
})

describe('WebSpeechRecognizer', () => {
  it('constructs without touching the environment', () => {
    expect(() => new WebSpeechRecognizer({ scope: {} })).not.toThrow()
  })

  it('refuses to start where there is no recognizer', () => {
    const recognizer = new WebSpeechRecognizer({ scope: {} })

    expect(() => recognizer.start({})).toThrow(SpeechRecognitionUnsupportedError)
  })

  it('starts listening', () => {
    const { recognizer, recognition, handlers } = harness()
    recognizer.start(handlers)

    expect(recognition.starts).toBe(1)
  })

  it('uses the prefixed constructor when that is all there is', () => {
    const { recognizer, recognition, handlers } = harness({ prefixed: true })
    recognizer.start(handlers)

    expect(recognition.starts).toBe(1)
  })

  describe('interim results', () => {
    it('reports words while they are still being spoken', () => {
      const { recognizer, recognition, handlers, interim } = harness()
      recognizer.start(handlers)

      recognition.hear(false, ['start', 0.4])
      recognition.revise(['start tracking', 0.5])

      expect(interim).toEqual(['start', 'start tracking'])
    })

    it('does not report an interim as a result', () => {
      const { recognizer, recognition, handlers, results } = harness()
      recognizer.start(handlers)

      recognition.hear(false, ['start', 0.4])
      expect(results).toEqual([])
    })

    it('asks the engine for them by default', () => {
      const { recognizer, recognition, handlers } = harness()
      recognizer.start(handlers)

      expect(recognition.interimResults).toBe(true)
    })

    it('can be turned off', () => {
      const recognition = new FakeRecognition()
      const scope = { SpeechRecognition: constructorFor(recognition) }

      new WebSpeechRecognizer({ scope, interimResults: false }).start({})
      expect(recognition.interimResults).toBe(false)
    })
  })

  describe('the final result', () => {
    it('arrives when the engine ends, not when the words are final', () => {
      const { recognizer, recognition, handlers, results } = harness()
      recognizer.start(handlers)

      recognition.hear(true, ['start tracking deen', 0.92])
      expect(results).toEqual([])

      recognition.finish()
      expect(results[0]?.transcript).toBe('start tracking deen')
    })

    it('carries the engine confidence', () => {
      const { recognizer, recognition, handlers, results } = harness()
      recognizer.start(handlers)

      recognition.hear(true, ['stop tracking', 0.87])
      recognition.finish()

      expect(results[0]?.confidence).toBe(0.87)
    })

    it('carries the alternatives the engine offered', () => {
      const { recognizer, recognition, handlers, results } = harness()
      recognizer.start(handlers)

      recognition.hear(true, ['star tracking dean', 0.6], ['start tracking deen', 0.5])
      recognition.finish()

      expect(results[0]?.alternatives).toEqual([
        { transcript: 'start tracking deen', confidence: 0.5 },
      ])
    })

    it('leaves alternatives off when the engine offered only one reading', () => {
      const { recognizer, recognition, handlers, results } = harness()
      recognizer.start(handlers)

      recognition.hear(true, ['stop', 0.9])
      recognition.finish()

      expect(results[0]).not.toHaveProperty('alternatives')
    })

    it('drops an alternative identical to the best reading', () => {
      const { recognizer, recognition, handlers, results } = harness()
      recognizer.start(handlers)

      recognition.hear(true, ['stop', 0.9], ['stop', 0.4])
      recognition.finish()

      expect(results[0]?.alternatives).toBeUndefined()
    })

    it('joins several final phrases when the engine keeps listening', () => {
      const { recognizer, recognition, handlers, results } = harness()
      recognizer.start(handlers)

      recognition.hear(true, ['log thirty minutes', 0.9])
      recognition.hear(true, ['to my deen goal', 0.8])
      recognition.finish()

      expect(results[0]?.transcript).toBe('log thirty minutes to my deen goal')
      expect(results[0]?.confidence).toBe(0.85)
    })

    it('keeps a phrase the engine finalized earlier', () => {
      const { recognizer, recognition, handlers, results } = harness()
      recognizer.start(handlers)

      recognition.hear(true, ['stop tracking', 0.9])
      recognition.hear(false, ['and', 0.2])
      recognition.finish()

      expect(results[0]?.transcript).toBe('stop tracking')
    })
  })

  describe('hearing nothing', () => {
    it('is a result, not an error', () => {
      const { recognizer, recognition, handlers, results, errors } = harness()
      recognizer.start(handlers)

      recognition.fail('no-speech')
      recognition.finish()

      expect(errors).toEqual([])
      expect(results[0]).toEqual({ transcript: '', confidence: 0 })
    })

    it('still ends the session', () => {
      const { recognizer, recognition, handlers, ends } = harness()
      recognizer.start(handlers)

      recognition.fail('no-speech')
      recognition.finish()

      expect(ends).toHaveLength(1)
    })
  })

  describe('failures', () => {
    const cases: ReadonlyArray<readonly [string, new () => Error]> = [
      ['not-allowed', MicrophonePermissionDeniedError],
      ['service-not-allowed', MicrophonePermissionDeniedError],
      ['audio-capture', AudioCaptureError],
      ['network', RecognizerNetworkError],
    ]

    it.each(cases)('reports %s as a typed error', (code, expected) => {
      const { recognizer, recognition, handlers, errors } = harness()
      recognizer.start(handlers)

      recognition.fail(code)
      expect(errors[0]).toBeInstanceOf(expected)
    })

    it('keeps the engine code for anything it does not recognize', () => {
      const { recognizer, recognition, handlers, errors } = harness()
      recognizer.start(handlers)

      recognition.fail('language-not-supported')

      const error = errors[0]
      expect(error).toBeInstanceOf(SpeechRecognitionFailedError)
      expect(error).toMatchObject({ code: 'language-not-supported' })
    })

    it('does not also deliver a result', () => {
      const { recognizer, recognition, handlers, results } = harness()
      recognizer.start(handlers)

      recognition.fail('network')
      recognition.finish()

      expect(results).toEqual([])
    })

    it('ends the session even when the engine never fires its end event', () => {
      const { recognizer, recognition, handlers, ends } = harness()
      recognizer.start(handlers)

      recognition.fail('network')
      expect(ends).toHaveLength(1)
    })

    it('ends the session exactly once when the engine does fire both', () => {
      const { recognizer, recognition, handlers, ends } = harness()
      recognizer.start(handlers)

      recognition.fail('network')
      recognition.finish()

      expect(ends).toHaveLength(1)
    })

    it('reports a refusal to start through the same channel', () => {
      const { recognizer, recognition, handlers, errors, ends } = harness()
      recognition.startThrows = new Error('already started')

      recognizer.start(handlers)

      expect(errors[0]?.message).toBe('already started')
      expect(ends).toHaveLength(1)
    })
  })

  describe('stopping', () => {
    it('asks the engine to stop and waits for what it heard', () => {
      const { recognizer, recognition, handlers, results } = harness()
      const session = recognizer.start(handlers)

      recognition.hear(true, ['stop tracking', 0.9])
      session.stop()
      expect(recognition.stops).toBe(1)
      expect(results).toEqual([])

      recognition.finish()
      expect(results[0]?.transcript).toBe('stop tracking')
    })
  })

  describe('aborting', () => {
    it('throws away what was heard', () => {
      const { recognizer, recognition, handlers, results } = harness()
      const session = recognizer.start(handlers)

      recognition.hear(true, ['start tracking deen', 0.9])
      session.abort()
      recognition.finish()

      expect(results).toEqual([])
    })

    it('ends the session immediately rather than waiting on the engine', () => {
      const { recognizer, handlers, ends } = harness()
      const session = recognizer.start(handlers)

      session.abort()
      expect(ends).toHaveLength(1)
    })

    it('ends the session once even when the engine follows up', () => {
      const { recognizer, recognition, handlers, ends } = harness()
      const session = recognizer.start(handlers)

      session.abort()
      recognition.finish()

      expect(ends).toHaveLength(1)
    })

    it('ignores anything the engine reports afterwards', () => {
      const { recognizer, recognition, handlers, interim } = harness()
      const session = recognizer.start(handlers)

      session.abort()
      recognition.hear(false, ['too late', 0.5])

      expect(interim).toEqual([])
    })

    it('treats an engine-reported abort as a cancellation, not a failure', () => {
      const { recognizer, recognition, handlers, errors, results } = harness()
      recognizer.start(handlers)

      recognition.fail('aborted')
      recognition.finish()

      expect(errors).toEqual([])
      expect(results).toEqual([])
    })
  })

  describe('options', () => {
    it('passes the language through', () => {
      const { recognizer, recognition, handlers } = harness()
      recognizer.start(handlers, { language: 'en-GB' })

      expect(recognition.lang).toBe('en-GB')
    })

    it('prefers the per-session language over the constructed one', () => {
      const recognition = new FakeRecognition()
      const scope = { SpeechRecognition: constructorFor(recognition) }

      new WebSpeechRecognizer({ scope, language: 'en-US' }).start({}, { language: 'ur-PK' })
      expect(recognition.lang).toBe('ur-PK')
    })

    it('leaves the language alone when none was given', () => {
      const { recognizer, recognition, handlers } = harness()
      recognizer.start(handlers)

      expect(recognition.lang).toBe('')
    })

    it('asks for several readings by default', () => {
      const { recognizer, recognition, handlers } = harness()
      recognizer.start(handlers)

      expect(recognition.maxAlternatives).toBeGreaterThan(1)
    })

    it('takes the number of readings from the session', () => {
      const { recognizer, recognition, handlers } = harness()
      recognizer.start(handlers, { maxAlternatives: 1 })

      expect(recognition.maxAlternatives).toBe(1)
    })
  })

  it('works with no handlers at all', () => {
    const { recognizer, recognition } = harness()

    expect(() => {
      recognizer.start({})
      recognition.hear(true, ['stop', 0.9])
      recognition.finish()
    }).not.toThrow()
  })

  it('gives each session its own recognizer state', () => {
    const { recognizer, recognition, handlers, results } = harness()
    const listener = vi.fn()

    recognizer.start(handlers)
    recognition.hear(true, ['stop', 0.9])
    recognition.finish()

    recognizer.start({ onResult: listener })
    recognition.finish()

    expect(results).toHaveLength(1)
    expect(listener).toHaveBeenCalledWith({ transcript: '', confidence: 0 })
  })
})
