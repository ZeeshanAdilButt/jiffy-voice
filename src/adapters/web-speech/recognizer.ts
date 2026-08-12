import type {
  RecognitionHandlers,
  RecognitionOptions,
  RecognitionSession,
  SpeechRecognizer,
  TranscriptAlternative,
  TranscriptionResult,
} from '../../ports/index.js'
import {
  AudioCaptureError,
  MicrophonePermissionDeniedError,
  RecognizerNetworkError,
  SpeechRecognitionFailedError,
} from '../../core/errors.js'
import { SpeechRecognitionUnsupportedError } from './errors.js'
import type {
  SpeechRecognitionConstructor,
  SpeechRecognitionErrorEventLike,
  SpeechRecognitionEventLike,
  SpeechRecognitionResultLike,
  SpeechRecognitionScope,
} from './types.js'

const DEFAULT_MAX_ALTERNATIVES = 3

function defaultScope(): SpeechRecognitionScope {
  return globalThis as unknown as SpeechRecognitionScope
}

function findConstructor(scope: SpeechRecognitionScope): SpeechRecognitionConstructor | undefined {
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition
}

/**
 * Whether this environment can listen at all. Worth calling before showing a
 * microphone button: Firefox and every non-browser runtime answer false, and
 * a host that knows that up front can offer a text field instead of a control
 * that fails when pressed.
 */
export function isWebSpeechSupported(scope: SpeechRecognitionScope = defaultScope()): boolean {
  return findConstructor(scope) !== undefined
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function alternativeAt(
  result: SpeechRecognitionResultLike,
  index: number,
): { transcript: string; confidence: number } {
  // Engines are inconsistent about how many alternatives they return per
  // result, so a result that ran out falls back to its own best reading
  // rather than contributing a hole to the joined text.
  const alternative = result[index] ?? result[0]
  return {
    transcript: alternative?.transcript ?? '',
    confidence: alternative?.confidence ?? 0,
  }
}

function buildResult(finals: readonly SpeechRecognitionResultLike[]): TranscriptionResult {
  if (finals.length === 0) return { transcript: '', confidence: 0 }

  const join = (index: number): string =>
    finals
      .map((result) => alternativeAt(result, index).transcript)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()

  const meanConfidence = (index: number): number =>
    round(
      finals.reduce((total, result) => total + alternativeAt(result, index).confidence, 0) /
        finals.length,
    )

  const transcript = join(0)
  const depth = Math.max(...finals.map((result) => result.length))
  const seen = new Set([transcript])
  const alternatives: TranscriptAlternative[] = []

  for (let index = 1; index < depth; index += 1) {
    const text = join(index)
    if (text.length === 0 || seen.has(text)) continue

    seen.add(text)
    alternatives.push({ transcript: text, confidence: meanConfidence(index) })
  }

  if (alternatives.length === 0) {
    return { transcript, confidence: meanConfidence(0) }
  }

  return { transcript, confidence: meanConfidence(0), alternatives }
}

/**
 * Silence and cancellation are not failures, so neither reaches onError. Both
 * end the session with nothing, which the layers above already know how to
 * read.
 */
function toError(event: SpeechRecognitionErrorEventLike): Error | null {
  switch (event.error) {
    case 'no-speech':
    case 'aborted':
      return null
    case 'not-allowed':
    case 'service-not-allowed':
      return new MicrophonePermissionDeniedError()
    case 'audio-capture':
      return new AudioCaptureError()
    case 'network':
      return new RecognizerNetworkError()
    default:
      return new SpeechRecognitionFailedError(event.error, event.message)
  }
}

export interface WebSpeechRecognizerOptions {
  /** Where to look for the constructor. Defaults to the global object. */
  readonly scope?: SpeechRecognitionScope
  readonly language?: string
  readonly maxAlternatives?: number
  /** Keep listening past the first final result. Off by default. */
  readonly continuous?: boolean
  /** Report words while they are still being spoken. On by default. */
  readonly interimResults?: boolean
}

/**
 * SpeechRecognizer over the browser's own recognition engine.
 *
 * Nothing is touched at construction and nothing is read from the global
 * object until `start`, so importing this in a server bundle or in a browser
 * that has no such API is harmless.
 */
export class WebSpeechRecognizer implements SpeechRecognizer {
  constructor(private readonly options: WebSpeechRecognizerOptions = {}) {}

  get supported(): boolean {
    return isWebSpeechSupported(this.options.scope ?? defaultScope())
  }

  start(handlers: RecognitionHandlers, options: RecognitionOptions = {}): RecognitionSession {
    const Recognition = findConstructor(this.options.scope ?? defaultScope())
    if (Recognition === undefined) throw new SpeechRecognitionUnsupportedError()

    const recognition = new Recognition()
    const language = options.language ?? this.options.language
    if (language !== undefined) recognition.lang = language

    recognition.continuous = this.options.continuous ?? false
    recognition.interimResults = this.options.interimResults ?? true
    recognition.maxAlternatives =
      options.maxAlternatives ?? this.options.maxAlternatives ?? DEFAULT_MAX_ALTERNATIVES

    // Kept by index rather than rebuilt from each event, so a phrase that has
    // already been finalized survives whatever the engine chooses to include
    // in the next event.
    const finals = new Map<number, SpeechRecognitionResultLike>()
    let settled = false
    let ended = false
    let discarded = false

    const emitEnd = (): void => {
      if (ended) return
      ended = true
      handlers.onEnd?.()
    }

    const settleWithError = (error: Error): void => {
      if (settled) return
      settled = true
      handlers.onError?.(error)
      // Emitted here rather than left to onend, because not every engine
      // fires onend after an error, and onEnd is documented to always run.
      emitEnd()
    }

    const settleWithResult = (): void => {
      if (settled) return
      settled = true
      const ordered = [...finals.entries()].sort(([a], [b]) => a - b).map(([, result]) => result)
      handlers.onResult?.(buildResult(ordered))
      emitEnd()
    }

    recognition.onresult = (event: SpeechRecognitionEventLike): void => {
      if (discarded) return

      const interim: string[] = []

      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index]
        if (result === undefined) continue

        if (result.isFinal) {
          finals.set(index, result)
        } else {
          interim.push(alternativeAt(result, 0).transcript)
        }
      }

      const pending = interim.join(' ').replace(/\s+/g, ' ').trim()
      if (pending.length > 0) handlers.onInterim?.(pending)
    }

    recognition.onerror = (event: SpeechRecognitionErrorEventLike): void => {
      const error = toError(event)
      if (error === null) {
        // Silence still ends with a result, an empty one. An abort ends with
        // nothing at all.
        if (event.error === 'aborted') discarded = true
        return
      }

      settleWithError(error)
    }

    recognition.onend = (): void => {
      if (discarded) {
        emitEnd()
        return
      }
      settleWithResult()
    }

    try {
      recognition.start()
    } catch (error) {
      settleWithError(
        error instanceof Error ? error : new SpeechRecognitionFailedError('start-failed'),
      )
    }

    return {
      stop: () => {
        recognition.stop()
      },
      abort: () => {
        discarded = true
        recognition.abort()
        emitEnd()
      },
    }
  }
}
