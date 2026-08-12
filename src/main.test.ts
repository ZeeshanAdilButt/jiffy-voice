import { describe, expect, it } from 'vitest'

import { buildTokenVerifier, parseEnv } from './main.js'

describe('parseEnv', () => {
  it('reads a secret-based configuration', () => {
    expect(parseEnv({ JWT_SECRET: 'shh' })).toMatchObject({
      port: 8080,
      jwt: { kind: 'secret', secret: 'shh' },
    })
  })

  it('reads a JWKS-based configuration', () => {
    expect(parseEnv({ JWT_JWKS_URI: 'https://example.test/jwks' })).toMatchObject({
      jwt: { kind: 'jwks', uri: 'https://example.test/jwks' },
    })
  })

  it('prefers JWKS when both are set', () => {
    const config = parseEnv({ JWT_SECRET: 'shh', JWT_JWKS_URI: 'https://example.test/jwks' })

    expect(config.jwt.kind).toBe('jwks')
  })

  it('carries the optional claim settings through', () => {
    const config = parseEnv({
      JWT_SECRET: 'shh',
      JWT_ISSUER: 'https://issuer.test',
      JWT_AUDIENCE: 'jiffy',
      JWT_USER_ID_CLAIM: 'uid',
    })

    expect(config.jwt).toMatchObject({
      issuer: 'https://issuer.test',
      audience: 'jiffy',
      userIdClaim: 'uid',
    })
  })

  it('reads the port', () => {
    expect(parseEnv({ JWT_SECRET: 'shh', PORT: '9000' }).port).toBe(9000)
  })

  it('splits wake words on commas and trims them', () => {
    expect(parseEnv({ JWT_SECRET: 'shh', WAKE_WORDS: ' jiffy , hey jiffy ' }).wakeWords).toEqual([
      'jiffy',
      'hey jiffy',
    ])
  })

  it('leaves wake words unset when the variable is absent', () => {
    expect(parseEnv({ JWT_SECRET: 'shh' }).wakeWords).toBeUndefined()
  })

  it('reads a confidence floor', () => {
    expect(parseEnv({ JWT_SECRET: 'shh', MIN_CONFIDENCE: '0.6' }).minConfidence).toBe(0.6)
  })

  it('refuses a configuration with no way to verify a token', () => {
    expect(() => parseEnv({})).toThrow(/JWT_JWKS_URI or JWT_SECRET/)
  })

  it('refuses a port that is not a port', () => {
    expect(() => parseEnv({ JWT_SECRET: 'shh', PORT: 'http' })).toThrow(/Invalid PORT/)
    expect(() => parseEnv({ JWT_SECRET: 'shh', PORT: '0' })).toThrow(/Invalid PORT/)
  })

  it('refuses a confidence floor that is not a number', () => {
    expect(() => parseEnv({ JWT_SECRET: 'shh', MIN_CONFIDENCE: 'high' })).toThrow(
      /Invalid MIN_CONFIDENCE/,
    )
  })
})

describe('buildTokenVerifier', () => {
  it('builds one from a static secret', () => {
    expect(buildTokenVerifier({ kind: 'secret', secret: 'shh' })).toBeDefined()
  })

  it('builds one from a JWKS endpoint without reaching it', () => {
    expect(buildTokenVerifier({ kind: 'jwks', uri: 'https://example.test/jwks' })).toBeDefined()
  })

  it('refuses a JWKS URI that is not a URI', () => {
    expect(() => buildTokenVerifier({ kind: 'jwks', uri: 'not a url' })).toThrow()
  })
})
