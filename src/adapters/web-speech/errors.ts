/**
 * The recognizer is not there. Thrown from `start`, never at import time: a
 * bundle that includes this adapter must still load in a browser that cannot
 * run it, so the host can feature-detect and offer a text field instead.
 */
export class SpeechRecognitionUnsupportedError extends Error {
  constructor() {
    super('This environment has no SpeechRecognition implementation')
    this.name = 'SpeechRecognitionUnsupportedError'
  }
}

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

/** Anything the engine reported that does not map to one of the above. */
export class SpeechRecognitionFailedError extends Error {
  constructor(
    readonly code: string,
    detail?: string,
  ) {
    super(detail === undefined ? `Recognition failed: ${code}` : `Recognition failed: ${detail}`)
    this.name = 'SpeechRecognitionFailedError'
  }
}
