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
  EmptyTranscriptError,
  SpeechToTextUnavailableError,
  TargetResolutionFailedError,
  TranscriptionFailedError,
} from './errors.js'
