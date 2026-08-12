import { describe, expect, it, vi } from 'vitest'

import type { AudioClip, TranscriptionResult } from '../../ports/index.js'
import {
  HttpSpeechToText,
  SpeechServiceError,
  SpeechServiceTimeoutError,
} from './speech-to-text.js'

const CLIP: AudioClip = { data: new Uint8Array([1, 2, 3]), mimeType: 'audio/webm' }

interface ProviderBody {
  readonly best: string
  readonly score: number
}

function parse(body: unknown): TranscriptionResult {
  const answer = body as ProviderBody
  return { transcript: answer.best, confidence: answer.score }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function recorder(response: Response | (() => Promise<Response>)) {
  const calls: Array<{ url: string; init: RequestInit }> = []

  const send = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return typeof response === 'function' ? response() : response
  }) as unknown as typeof globalThis.fetch

  return { calls, send }
}

describe('HttpSpeechToText', () => {
  it('posts the clip and returns what the provider said', async () => {
    const { calls, send } = recorder(jsonResponse({ best: 'stop tracking', score: 0.91 }))
    const stt = new HttpSpeechToText({ url: 'https://stt.test/v1', parse, fetch: send })

    await expect(stt.transcribe(CLIP)).resolves.toEqual({
      transcript: 'stop tracking',
      confidence: 0.91,
    })
    expect(calls[0]?.url).toBe('https://stt.test/v1')
    expect(calls[0]?.init.method).toBe('POST')
  })

  it('sends the bytes under the clip media type by default', async () => {
    const { calls, send } = recorder(jsonResponse({ best: 'stop', score: 1 }))
    await new HttpSpeechToText({ url: 'https://stt.test/v1', parse, fetch: send }).transcribe(CLIP)

    expect(calls[0]?.init.headers).toMatchObject({ 'content-type': 'audio/webm' })
    expect(calls[0]?.init.body).toBe(CLIP.data)
  })

  it('adds the configured headers', async () => {
    const { calls, send } = recorder(jsonResponse({ best: 'stop', score: 1 }))
    const stt = new HttpSpeechToText({
      url: 'https://stt.test/v1',
      headers: { authorization: 'Bearer key' },
      parse,
      fetch: send,
    })

    await stt.transcribe(CLIP)
    expect(calls[0]?.init.headers).toMatchObject({ authorization: 'Bearer key' })
  })

  it('takes a host request shape for a provider that wants one', async () => {
    const { calls, send } = recorder(jsonResponse({ best: 'stop', score: 1 }))
    const stt = new HttpSpeechToText({
      url: 'https://stt.test/v1',
      parse,
      buildRequest: (clip) => ({
        body: JSON.stringify({ audio: [...clip.data], format: clip.mimeType }),
        headers: { 'content-type': 'application/json' },
      }),
      fetch: send,
    })

    await stt.transcribe(CLIP)
    expect(calls[0]?.init.headers).toMatchObject({ 'content-type': 'application/json' })
    expect(String(calls[0]?.init.body)).toContain('"audio":[1,2,3]')
  })

  it('lets the host mapping produce alternatives', async () => {
    const { send } = recorder(jsonResponse({ readings: ['stop', 'stomp'] }))
    const stt = new HttpSpeechToText({
      url: 'https://stt.test/v1',
      fetch: send,
      parse: (body) => {
        const readings = (body as { readings: string[] }).readings
        return {
          transcript: readings[0] ?? '',
          confidence: 0.7,
          alternatives: readings.slice(1).map((transcript) => ({ transcript, confidence: 0.4 })),
        }
      },
    })

    await expect(stt.transcribe(CLIP)).resolves.toMatchObject({
      transcript: 'stop',
      alternatives: [{ transcript: 'stomp', confidence: 0.4 }],
    })
  })

  describe('failures', () => {
    it('turn a non-2xx into a typed error carrying the status', async () => {
      const { send } = recorder(new Response('quota exceeded', { status: 429 }))
      const stt = new HttpSpeechToText({ url: 'https://stt.test/v1', parse, fetch: send })

      await expect(stt.transcribe(CLIP)).rejects.toBeInstanceOf(SpeechServiceError)
      await expect(stt.transcribe(CLIP)).rejects.toMatchObject({ status: 429 })
    })

    it('keep the body as the detail, so the provider message survives', async () => {
      const { send } = recorder(new Response('quota exceeded', { status: 429 }))
      const stt = new HttpSpeechToText({ url: 'https://stt.test/v1', parse, fetch: send })

      await expect(stt.transcribe(CLIP)).rejects.toThrow(/quota exceeded/)
    })

    it('report a timeout as a timeout rather than as an abort', async () => {
      const never = () => new Promise<Response>(() => {})
      const stt = new HttpSpeechToText({
        url: 'https://stt.test/v1',
        parse,
        timeoutMs: 10,
        fetch: (async (_url: string, init?: RequestInit) => {
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
            void never()
          })
        }) as unknown as typeof globalThis.fetch,
      })

      await expect(stt.transcribe(CLIP)).rejects.toBeInstanceOf(SpeechServiceTimeoutError)
    })

    it('pass a transport failure through untouched', async () => {
      const stt = new HttpSpeechToText({
        url: 'https://stt.test/v1',
        parse,
        fetch: (async () => {
          throw new Error('dns failure')
        }) as unknown as typeof globalThis.fetch,
      })

      await expect(stt.transcribe(CLIP)).rejects.toThrow('dns failure')
    })
  })

  it('does not leave a timer running after a successful call', async () => {
    vi.useFakeTimers()
    try {
      const { send } = recorder(jsonResponse({ best: 'stop', score: 1 }))
      const stt = new HttpSpeechToText({ url: 'https://stt.test/v1', parse, fetch: send })

      await stt.transcribe(CLIP)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
