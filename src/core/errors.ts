export class EmptyTranscriptError extends Error {
  constructor() {
    super('Transcript is empty')
    this.name = 'EmptyTranscriptError'
  }
}

export class SpeechToTextUnavailableError extends Error {
  constructor() {
    super('Audio was submitted but no SpeechToText adapter is configured')
    this.name = 'SpeechToTextUnavailableError'
  }
}

/**
 * The recognizer itself failed. Distinct from hearing nothing, which is an
 * unknown command and not an error: one means the microphone picked up
 * silence, the other means the service behind it is down.
 */
export class TranscriptionFailedError extends Error {
  constructor(cause: unknown) {
    super('Transcription failed', { cause })
    this.name = 'TranscriptionFailedError'
  }
}

/**
 * The lookup broke. Distinct from finding no match, which the resolver
 * reports by returning null and which is a normal answer.
 */
export class TargetResolutionFailedError extends Error {
  constructor(name: string, cause: unknown) {
    super(`Resolving target "${name}" failed`, { cause })
    this.name = 'TargetResolutionFailedError'
  }
}

/**
 * The errors below belong to no single recognizer. A host catching a denied
 * microphone should not have to know which adapter produced it, and one
 * class per adapter would mean handling the same condition twice. Adapters
 * raise these; the core only passes them along.
 */

export class MicrophonePermissionDeniedError extends Error {
  constructor() {
    super('Microphone access was denied')
    this.name = 'MicrophonePermissionDeniedError'
  }
}

export class AudioCaptureError extends Error {
  constructor() {
    super('No microphone was available to capture audio')
    this.name = 'AudioCaptureError'
  }
}

export class RecognizerNetworkError extends Error {
  constructor() {
    super('The recognition service could not be reached')
    this.name = 'RecognizerNetworkError'
  }
}

/** Anything a recognizer reported that does not map to one of the above. */
export class SpeechRecognitionFailedError extends Error {
  constructor(
    readonly code: string,
    detail?: string,
  ) {
    super(detail === undefined ? `Recognition failed: ${code}` : `Recognition failed: ${detail}`)
    this.name = 'SpeechRecognitionFailedError'
  }
}
