import {
  AudioCaptureError,
  MicrophonePermissionDeniedError,
  RecognizerNetworkError,
  SpeechRecognitionFailedError,
} from '../../core/errors.js'
import type {
  RecognitionHandlers,
  RecognitionOptions,
  RecognitionSession,
  SpeechRecognizer,
  TranscriptAlternative,
  TranscriptionResult,
} from '../../ports/index.js'
import type { NativeSpeechError, NativeSpeechModule } from './module.js'

const DEFAULT_MAX_ALTERNATIVES = 3

/**
 * Android's SpeechRecognizer reports numbers, iOS and the JavaScript
 * wrappers report strings, and no two libraries agree on the spelling. The
 * codes below are the union of what the common ones emit, normalized to
 * lowercase strings.
 */
const SILENCE_CODES = new Set(['no-speech', 'no_match', 'nomatch', 'speech_timeout', '6', '7'])
const CANCELLED_CODES = new Set(['aborted', 'canceled', 'cancelled'])
const PERMISSION_CODES = new Set([
  'not-allowed',
  'service-not-allowed',
  'permissions',
  'insufficient_permissions',
  'permission_denied',
  '9',
])
const CAPTURE_CODES = new Set(['audio', 'audio-capture', 'audio_error', '3'])
const NETWORK_CODES = new Set(['network', 'network_timeout', 'network-timeout', '1', '2'])

export type NativeErrorKind = 'silence' | 'cancelled' | 'failure'

export interface MappedNativeError {
  readonly kind: NativeErrorKind
  readonly error: Error | null
}

function normalizeCode(error: NativeSpeechError): string {
  return String(error.code ?? '')
    .trim()
    .toLowerCase()
}

/**
 * Neither silence nor a cancellation is a failure, so neither produces an
 * error. Both end the session with nothing, which is the same line every
 * other recognizer in here draws.
 */
export function mapNativeError(error: NativeSpeechError): MappedNativeError {
  const code = normalizeCode(error)

  if (SILENCE_CODES.has(code)) return { kind: 'silence', error: null }
  if (CANCELLED_CODES.has(code)) return { kind: 'cancelled', error: null }

  if (PERMISSION_CODES.has(code)) {
    return { kind: 'failure', error: new MicrophonePermissionDeniedError() }
  }
  if (CAPTURE_CODES.has(code)) return { kind: 'failure', error: new AudioCaptureError() }
  if (NETWORK_CODES.has(code)) return { kind: 'failure', error: new RecognizerNetworkError() }

  return {
    kind: 'failure',
    error: new SpeechRecognitionFailedError(code.length === 0 ? 'unknown' : code, error.message),
  }
}

export interface NativeSpeechRecognizerOptions {
  readonly language?: string
  readonly maxAlternatives?: number
  /** Replace the built-in code mapping for an engine that reports its own. */
  readonly mapError?: (error: NativeSpeechError) => MappedNativeError
}

function buildResult(
  transcripts: readonly string[],
  confidences: readonly number[] | undefined,
): TranscriptionResult {
  const best = transcripts[0]?.trim() ?? ''
  if (best.length === 0) return { transcript: '', confidence: 0 }

  const confidenceAt = (index: number): number => {
    const reported = confidences?.[index]
    // Most platform engines report nothing. Zero is read further in as "did
    // not score this", not as "certain it is wrong", so an absent value is
    // better left absent than invented.
    return typeof reported === 'number' && Number.isFinite(reported) ? reported : 0
  }

  const seen = new Set([best])
  const alternatives: TranscriptAlternative[] = []

  for (let index = 1; index < transcripts.length; index += 1) {
    const text = transcripts[index]?.trim() ?? ''
    if (text.length === 0 || seen.has(text)) continue

    seen.add(text)
    alternatives.push({ transcript: text, confidence: confidenceAt(index) })
  }

  if (alternatives.length === 0) return { transcript: best, confidence: confidenceAt(0) }

  return { transcript: best, confidence: confidenceAt(0), alternatives }
}

/**
 * SpeechRecognizer over a platform engine the host supplies. Built for
 * React Native, where there is no Web Speech API and no single library
 * worth depending on, but nothing in here is specific to it.
 *
 * The value is the lifecycle, which is the same awkward part the browser
 * adapter deals with: a session that ends exactly once, silence that is not
 * an error, a cancel that discards whatever arrives afterwards, and one
 * result per session however many events the engine emitted.
 */
export class NativeSpeechRecognizer implements SpeechRecognizer {
  constructor(
    private readonly speech: NativeSpeechModule,
    private readonly options: NativeSpeechRecognizerOptions = {},
  ) {}

  start(handlers: RecognitionHandlers, options: RecognitionOptions = {}): RecognitionSession {
    const mapError = this.options.mapError ?? mapNativeError

    let settled = false
    let ended = false
    let discarded = false
    let teardown: (() => void) | null = null

    const finish = (): void => {
      if (ended) return
      ended = true
      teardown?.()
      teardown = null
      handlers.onEnd?.()
    }

    const settleWithError = (error: Error): void => {
      if (settled) return
      settled = true
      handlers.onError?.(error)
      finish()
    }

    const settleWithResult = (result: TranscriptionResult): void => {
      if (settled) return
      settled = true
      handlers.onResult?.(result)
      finish()
    }

    teardown = this.speech.subscribe({
      onPartial: (transcripts) => {
        if (discarded || settled) return

        const words = transcripts[0]?.trim() ?? ''
        if (words.length > 0) handlers.onInterim?.(words)
      },

      onResults: (transcripts, confidences) => {
        if (discarded) return
        settleWithResult(buildResult(transcripts, confidences))
      },

      onError: (error) => {
        if (discarded) return

        const mapped = mapError(error)
        if (mapped.kind === 'cancelled') {
          discarded = true
          finish()
          return
        }

        if (mapped.kind === 'silence') {
          settleWithResult({ transcript: '', confidence: 0 })
          return
        }

        settleWithError(mapped.error ?? new SpeechRecognitionFailedError('unknown'))
      },

      onEnd: () => {
        if (discarded) {
          finish()
          return
        }
        // An engine that ends without ever reporting results heard nothing.
        settleWithResult({ transcript: '', confidence: 0 })
      },
    })

    void Promise.resolve()
      .then(() =>
        this.speech.start({
          language: options.language ?? this.options.language,
          maxAlternatives:
            options.maxAlternatives ?? this.options.maxAlternatives ?? DEFAULT_MAX_ALTERNATIVES,
        }),
      )
      .catch((error: unknown) => {
        settleWithError(error instanceof Error ? error : new Error(String(error)))
      })

    return {
      stop: () => {
        void Promise.resolve()
          .then(() => this.speech.stop())
          .catch(() => {
            // A stop that fails still has to end the session, otherwise a
            // caller who released the button waits forever.
            settleWithResult({ transcript: '', confidence: 0 })
          })
      },
      abort: () => {
        discarded = true
        void Promise.resolve()
          .then(() => this.speech.cancel())
          .catch(() => {})
        finish()
      },
    }
  }
}
