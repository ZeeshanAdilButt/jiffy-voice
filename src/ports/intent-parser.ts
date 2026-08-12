import type { VoiceIntent } from '../domain/index.js'

/**
 * Turns one transcript into one intent. Never throws for an utterance it
 * does not understand: an unparseable command is an UNKNOWN intent, not an
 * error, because "I did not catch that" is a normal outcome of listening to
 * people and the host still wants the transcript back to show them.
 *
 * Asynchronous even though the rule-based parser answers immediately, so a
 * model-backed parser is a drop-in replacement rather than a signature
 * change that ripples through every caller.
 */
export interface IntentParser {
  parse(transcript: string): Promise<VoiceIntent>
}
