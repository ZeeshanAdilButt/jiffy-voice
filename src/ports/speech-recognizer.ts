import type { TranscriptionResult } from './speech-to-text.js'

export interface RecognitionHandlers {
  /**
   * Words heard so far, replaced in full on every call. A UI shows these
   * while someone is still talking; nothing should act on them.
   */
  readonly onInterim?: (transcript: string) => void
  /**
   * What was heard, called at most once per session. An empty transcript
   * means silence, which is an answer and not a failure.
   */
  readonly onResult?: (result: TranscriptionResult) => void
  /** The recognizer failed. Hearing nothing does not come through here. */
  readonly onError?: (error: Error) => void
  /** Always called last, whatever else happened. */
  readonly onEnd?: () => void
}

export interface RecognitionSession {
  /** Stop listening and deliver what was heard. */
  stop(): void
  /** Stop listening and throw away what was heard. */
  abort(): void
}

export interface RecognitionOptions {
  /** BCP 47 language tag, such as `en-US`. */
  readonly language?: string
  /**
   * How many readings to ask for. More than one costs nothing and gives the
   * parser a second string to try when the first does not resolve.
   */
  readonly maxAlternatives?: number
}

/**
 * Live recognition: opens a microphone, reports words as they arrive, and
 * ends with one result.
 *
 * Separate from SpeechToText because the two are genuinely different shapes,
 * not two spellings of the same one. A cloud recognizer takes bytes you
 * already have and answers once. A browser or on-device recognizer owns the
 * microphone, has no bytes to hand over, and produces a stream of revisions
 * before it settles. Forcing the second through a `transcribe(bytes)`
 * signature would mean inventing an audio buffer nobody has.
 */
export interface SpeechRecognizer {
  start(handlers: RecognitionHandlers, options?: RecognitionOptions): RecognitionSession
}
