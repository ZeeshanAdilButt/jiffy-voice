export interface AudioClip {
  /** Encoded audio bytes exactly as captured. Nothing here decodes them. */
  readonly data: Uint8Array
  /** IANA media type of `data`, such as `audio/webm;codecs=opus`. */
  readonly mimeType: string
  readonly sampleRate?: number
  /** BCP 47 language tag, such as `en-US`. */
  readonly language?: string
}

export interface TranscriptAlternative {
  readonly transcript: string
  readonly confidence: number
}

/**
 * Alternatives are worth carrying because a recognizer's second guess is
 * often the one that parses. "Start tracking Dean" and "start tracking
 * deen" are the same utterance to a human and different strings here, and
 * an engine that offers both should not have that thrown away before
 * anything has tried to make sense of it.
 */
export interface TranscriptionResult {
  readonly transcript: string
  readonly confidence: number
  /** Ranked best first, not including `transcript` itself. */
  readonly alternatives?: readonly TranscriptAlternative[]
}

/**
 * Whatever turns recorded audio into words. Implementations wrap a cloud
 * recognizer, a local model, or the browser's own speech API; none of that
 * is visible past this interface.
 */
export interface SpeechToText {
  transcribe(clip: AudioClip): Promise<TranscriptionResult>
}
