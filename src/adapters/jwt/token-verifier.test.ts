import { SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'

import { InvalidTokenError, JwtTokenVerifier } from './token-verifier.js'

const SECRET = new TextEncoder().encode('a-test-secret-that-is-long-enough')

interface TokenOptions {
  claims?: Record<string, unknown>
  issuer?: string
  audience?: string
  expiresIn?: string
}

async function sign(options: TokenOptions = {}): Promise<string> {
  let token = new SignJWT({ sub: 'user_1', ...options.claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '5m')

  if (options.issuer !== undefined) token = token.setIssuer(options.issuer)
  if (options.audience !== undefined) token = token.setAudience(options.audience)

  return token.sign(SECRET)
}

describe('JwtTokenVerifier', () => {
  it('accepts a token it can verify', async () => {
    const verifier = new JwtTokenVerifier(SECRET)

    await expect(verifier.verify(await sign())).resolves.toEqual({ userId: 'user_1' })
  })

  it('rejects a token signed with a different key', async () => {
    const verifier = new JwtTokenVerifier(new TextEncoder().encode('a-different-secret-entirely'))

    await expect(verifier.verify(await sign())).rejects.toBeInstanceOf(InvalidTokenError)
  })

  it('rejects a token that is not a token', async () => {
    const verifier = new JwtTokenVerifier(SECRET)

    await expect(verifier.verify('nonsense')).rejects.toBeInstanceOf(InvalidTokenError)
  })

  it('rejects an expired token', async () => {
    const verifier = new JwtTokenVerifier(SECRET)
    const expired = await sign({ expiresIn: '-1m' })

    await expect(verifier.verify(expired)).rejects.toBeInstanceOf(InvalidTokenError)
  })

  it('rejects a token with no user id claim', async () => {
    const verifier = new JwtTokenVerifier(SECRET)
    const anonymous = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('5m')
      .sign(SECRET)

    await expect(verifier.verify(anonymous)).rejects.toThrow(/"sub" claim/)
  })

  it('reads the user id from a claim the platform nominates', async () => {
    const verifier = new JwtTokenVerifier(SECRET, { userIdClaim: 'uid' })
    const token = await sign({ claims: { uid: 'user_9' } })

    await expect(verifier.verify(token)).resolves.toEqual({ userId: 'user_9' })
  })

  it('checks the issuer when one is expected', async () => {
    const verifier = new JwtTokenVerifier(SECRET, { issuer: 'https://issuer.test' })

    await expect(
      verifier.verify(await sign({ issuer: 'https://issuer.test' })),
    ).resolves.toMatchObject({ userId: 'user_1' })
    await expect(
      verifier.verify(await sign({ issuer: 'https://elsewhere.test' })),
    ).rejects.toThrow()
  })

  it('checks the audience when one is expected', async () => {
    const verifier = new JwtTokenVerifier(SECRET, { audience: 'jiffy' })

    await expect(verifier.verify(await sign({ audience: 'jiffy' }))).resolves.toMatchObject({
      userId: 'user_1',
    })
    await expect(verifier.verify(await sign({ audience: 'other' }))).rejects.toThrow()
  })
})
