import type { VoiceCommand } from '../domain/index.js'
import type { RecognitionSession, SpeechRecognizer } from '../ports/index.js'

export type VoiceSessionStatus = 'idle' | 'listening' | 'processing' | 'result' | 'error'

export interface VoiceSessionState<TResult> {
  readonly status: VoiceSessionStatus
  /**
   * Words heard so far. Present only while listening, and only worth
   * showing: nothing should be acted on until the transcript settles.
   */
  readonly interimTranscript: string
  /** What the recognizer settled on. Empty string means it heard nothing. */
  readonly transcript: string | null
  readonly result: TResult | null
  readonly error: Error | null
}

export type TranscriptHandler<TResult> = (transcript: string) => Promise<TResult>

export interface VoiceSessionOptions<TResult> {
  readonly recognizer: SpeechRecognizer
  /**
   * What to do with a settled transcript. Deliberately a plain function
   * rather than the service itself, so the session stays a description of
   * the interaction and knows nothing about what a command is.
   */
  readonly handle: TranscriptHandler<TResult>
  readonly language?: string
  readonly maxAlternatives?: number
}

const IDLE = {
  status: 'idle',
  interimTranscript: '',
  transcript: null,
  result: null,
  error: null,
} as const

/**
 * The interaction behind a microphone button, as a state machine:
 *
 *   idle --start--> listening --stop or a settled transcript--> processing
 *   processing --handled--> result
 *   listening or processing --a real failure--> error
 *   anything --cancel--> idle
 *
 * No UI framework anywhere in here, which is the point: the same object
 * drives a web app, a React Native app, or a CLI. It is shaped for
 * useSyncExternalStore without knowing that it is, since state is one frozen
 * object replaced on every change and subscribe returns its own unsubscribe.
 */
export class VoiceSession<TResult = VoiceCommand> {
  private readonly listeners = new Set<(state: VoiceSessionState<TResult>) => void>()
  private current: VoiceSessionState<TResult> = IDLE
  private recognition: RecognitionSession | null = null

  /**
   * Bumped whenever a session is abandoned, so a recognizer callback or a
   * handler promise that lands after a cancel cannot write over the state
   * that replaced it.
   */
  private generation = 0

  constructor(private readonly options: VoiceSessionOptions<TResult>) {}

  get state(): VoiceSessionState<TResult> {
    return this.current
  }

  subscribe(listener: (state: VoiceSessionState<TResult>) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Ignored while a session is already running. */
  start(): void {
    if (this.current.status === 'listening' || this.current.status === 'processing') return

    const generation = this.nextGeneration()
    this.set({ ...IDLE, status: 'listening' })

    try {
      this.recognition = this.options.recognizer.start(
        {
          onInterim: (transcript) => {
            if (this.stale(generation) || this.current.status !== 'listening') return
            this.set({ ...this.current, interimTranscript: transcript })
          },
          onResult: (result) => {
            if (this.stale(generation)) return
            void this.process(generation, result.transcript)
          },
          onError: (error) => {
            if (this.stale(generation)) return
            this.set({ ...this.current, status: 'error', interimTranscript: '', error })
          },
          onEnd: () => {
            // A recognizer that ends without ever settling has heard nothing,
            // whatever it chose not to say about it. Without this the session
            // would sit in listening or processing forever waiting on an
            // implementation that has already finished.
            if (this.stale(generation) || this.current.transcript !== null) return
            if (this.current.status !== 'listening' && this.current.status !== 'processing') return
            void this.process(generation, '')
          },
        },
        { language: this.options.language, maxAlternatives: this.options.maxAlternatives },
      )
    } catch (error) {
      this.set({
        ...IDLE,
        status: 'error',
        error: error instanceof Error ? error : new Error(String(error)),
      })
    }
  }

  /** Stop listening and work with whatever was heard. */
  stop(): void {
    if (this.current.status !== 'listening') return

    this.set({ ...this.current, status: 'processing' })
    this.recognition?.stop()
  }

  /** Abandon the session wherever it is and go back to idle. */
  cancel(): void {
    this.nextGeneration()
    this.recognition?.abort()
    this.recognition = null
    if (this.current.status !== 'idle') this.set(IDLE)
  }

  private async process(generation: number, transcript: string): Promise<void> {
    const heard = { ...this.current, interimTranscript: '', transcript }

    // Silence is not an error and there is nothing to hand on, so the session
    // finishes with an empty transcript and no result.
    if (transcript.trim().length === 0) {
      this.set({ ...heard, status: 'result' })
      return
    }

    this.set({ ...heard, status: 'processing' })

    try {
      const result = await this.options.handle(transcript)
      if (this.stale(generation)) return
      this.set({ ...this.current, status: 'result', result })
    } catch (error) {
      if (this.stale(generation)) return
      this.set({
        ...this.current,
        status: 'error',
        error: error instanceof Error ? error : new Error(String(error)),
      })
    }
  }

  private nextGeneration(): number {
    this.generation += 1
    return this.generation
  }

  private stale(generation: number): boolean {
    return generation !== this.generation
  }

  private set(state: VoiceSessionState<TResult>): void {
    this.current = Object.freeze(state)
    for (const listener of [...this.listeners]) {
      listener(this.current)
    }
  }
}

/** The session settled without hearing anything worth acting on. */
export function heardNothing(state: VoiceSessionState<unknown>): boolean {
  return state.status === 'result' && state.transcript === '' && state.result === null
}
