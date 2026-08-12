import type { VoiceIntent } from '../../domain/index.js'
import type { IntentParser } from '../../ports/index.js'
import { parseCommand, type ParseOptions } from './parse.js'

/**
 * The default IntentParser: a fixed phrase table, no dependencies, no
 * network, and the same answer every time for the same input. Fast enough
 * to run on every interim transcript a recognizer emits while someone is
 * still talking.
 *
 * `parseCommand` is the same logic as a plain function, for callers that
 * have a transcript already and would rather not await anything.
 */
export class RuleBasedIntentParser implements IntentParser {
  constructor(private readonly options: ParseOptions = {}) {}

  async parse(transcript: string): Promise<VoiceIntent> {
    return parseCommand(transcript, this.options)
  }
}
