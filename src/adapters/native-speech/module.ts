export interface NativeSpeechError {
  readonly code?: string | number
  readonly message?: string
}

export interface NativeSpeechEvents {
  /** Words heard so far, best reading first. Replaced on every call. */
  onPartial(transcripts: readonly string[]): void
  /**
   * What the engine settled on, best reading first. Confidences are
   * positional and optional, because most platform engines do not report
   * them and the ones that do disagree about the scale.
   */
  onResults(transcripts: readonly string[], confidences?: readonly number[]): void
  onError(error: NativeSpeechError): void
  onEnd(): void
}

export interface NativeSpeechStartOptions {
  readonly language?: string
  readonly maxAlternatives?: number
}

/**
 * The shape a host wraps its platform speech engine in. Deliberately the
 * smallest surface that covers what those engines actually offer, so the
 * wrapper a React Native app writes over @react-native-voice/voice or
 * expo-speech-recognition is a dozen lines of forwarding rather than a
 * reimplementation of this adapter.
 *
 * Kept as an interface the host implements rather than a dependency this
 * package takes, because there is no one library to depend on: the field
 * has three of them, they disagree, and pulling in any of them would put a
 * native module in the install path of every consumer including the ones
 * running in a browser.
 */
export interface NativeSpeechModule {
  /** Attach handlers for one session and return a teardown. */
  subscribe(events: NativeSpeechEvents): () => void
  start(options: NativeSpeechStartOptions): void | Promise<void>
  /** Stop listening and let whatever was heard come through. */
  stop(): void | Promise<void>
  /** Stop listening and discard it. */
  cancel(): void | Promise<void>
}
