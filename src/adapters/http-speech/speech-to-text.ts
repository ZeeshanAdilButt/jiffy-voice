import type { AudioClip, SpeechToText, TranscriptionResult } from '../../ports/index.js'

type FetchInit = NonNullable<Parameters<typeof globalThis.fetch>[1]>

/**
 * Derived from whatever the runtime's own fetch accepts rather than named
 * as BodyInit, which only exists once the DOM lib is in scope. This package
 * targets Node and the browser from one build and does not pull that in.
 */
export type SpeechRequestBody = NonNullable<FetchInit['body']>

export class SpeechServiceError extends Error {
  constructor(
    readonly status: number,
    detail?: string,
  ) {
    super(
      detail === undefined
        ? `Recognition service returned ${status}`
        : `Recognition service returned ${status}: ${detail}`,
    )
    this.name = 'SpeechServiceError'
  }
}

export class SpeechServiceTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Recognition service did not answer within ${timeoutMs}ms`)
    this.name = 'SpeechServiceTimeoutError'
  }
}

export interface SpeechRequest {
  readonly body: SpeechRequestBody
  readonly headers?: Readonly<Record<string, string>>
}

export interface HttpSpeechToTextOptions {
  readonly url: string
  readonly headers?: Readonly<Record<string, string>>
  /** Defaults to 15 seconds, which is long for speech and short for a hang. */
  readonly timeoutMs?: number
  /**
   * Turn the provider's response into a result. Required, because this is
   * the one part no two providers agree on and guessing at a shape would
   * fail at runtime for everyone it guessed wrong about.
   */
  readonly parse: (body: unknown) => TranscriptionResult
  /** Defaults to posting the raw bytes under the clip's own media type. */
  readonly buildRequest?: (clip: AudioClip) => SpeechRequest
  /** Injectable for tests, and for a host with its own instrumented client. */
  readonly fetch?: typeof globalThis.fetch
}

const DEFAULT_TIMEOUT_MS = 15_000

function defaultRequest(clip: AudioClip): SpeechRequest {
  return {
    body: clip.data,
    headers: { 'content-type': clip.mimeType },
  }
}

async function readDetail(response: Response): Promise<string | undefined> {
  try {
    const text = await response.text()
    return text.length === 0 ? undefined : text.slice(0, 500)
  } catch {
    return undefined
  }
}

/**
 * SpeechToText over a cloud recognition API. Owns the parts every provider
 * shares, which is transport: posting the bytes, applying a timeout,
 * turning a non-2xx into a typed error. The provider-specific parts, the
 * request shape and the response shape, stay as two functions the host
 * supplies rather than as a config format that would only ever approximate
 * them.
 *
 * Uses the runtime's own fetch and nothing else, so it adds no dependency
 * to a package that has none.
 */
export class HttpSpeechToText implements SpeechToText {
  private readonly timeoutMs: number

  constructor(private readonly options: HttpSpeechToTextOptions) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  async transcribe(clip: AudioClip): Promise<TranscriptionResult> {
    const send = this.options.fetch ?? globalThis.fetch
    const request = (this.options.buildRequest ?? defaultRequest)(clip)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    let response: Response
    try {
      response = await send(this.options.url, {
        method: 'POST',
        body: request.body,
        headers: { ...request.headers, ...this.options.headers },
        signal: controller.signal,
      })
    } catch (error) {
      // An abort here is this adapter's own timer firing, not the caller
      // cancelling: the caller has no way to reach this signal.
      if (controller.signal.aborted) throw new SpeechServiceTimeoutError(this.timeoutMs)
      throw error
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      throw new SpeechServiceError(response.status, await readDetail(response))
    }

    return this.options.parse(await response.json())
  }
}
