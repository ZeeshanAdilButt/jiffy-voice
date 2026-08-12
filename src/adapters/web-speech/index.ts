export {
  isWebSpeechSupported,
  WebSpeechRecognizer,
  type WebSpeechRecognizerOptions,
} from './recognizer.js'
export {
  AudioCaptureError,
  MicrophonePermissionDeniedError,
  RecognizerNetworkError,
  SpeechRecognitionFailedError,
  SpeechRecognitionUnsupportedError,
} from './errors.js'
export type {
  SpeechRecognitionConstructor,
  SpeechRecognitionErrorEventLike,
  SpeechRecognitionEventLike,
  SpeechRecognitionLike,
  SpeechRecognitionResultLike,
  SpeechRecognitionScope,
} from './types.js'
