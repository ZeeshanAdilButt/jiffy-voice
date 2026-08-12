/**
 * The recognizer is not there. Thrown from `start`, never at import time: a
 * bundle that includes this adapter must still load in a browser that cannot
 * run it, so the host can feature-detect and offer a text field instead.
 *
 * The failures that are not specific to this adapter live in src/core, so a
 * host handling a denied microphone handles it once however it was recorded.
 */
export class SpeechRecognitionUnsupportedError extends Error {
  constructor() {
    super('This environment has no SpeechRecognition implementation')
    this.name = 'SpeechRecognitionUnsupportedError'
  }
}
