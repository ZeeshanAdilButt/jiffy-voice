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
