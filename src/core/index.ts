export { VoiceCommandService, type VoiceCommandServiceOptions } from './voice-command-service.js'
export {
  classifyCommand,
  DEFAULT_CONFIDENCE_POLICY,
  type CommandDecision,
  type ConfidencePolicy,
  type DecisionInput,
  type DecisionKind,
  type DecisionReason,
} from './decision.js'
export {
  fallbackFor,
  isCommand,
  isFallback,
  needsConfirmation,
  toOutcome,
  type CommandOutcome,
  type ConfirmOutcome,
  type FallbackOutcome,
  type FallbackReason,
  type VoiceOutcome,
} from './outcome.js'
export {
  AudioCaptureError,
  EmptyTranscriptError,
  MicrophonePermissionDeniedError,
  RecognizerNetworkError,
  SpeechRecognitionFailedError,
  SpeechToTextUnavailableError,
  TargetResolutionFailedError,
  TranscriptionFailedError,
} from './errors.js'
