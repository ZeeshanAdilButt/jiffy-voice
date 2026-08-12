import { jwtVerify, type JWTVerifyGetKey, type KeyInput } from 'jose'

import type { TokenVerifier, VerifiedIdentity } from '../../ports/index.js'

export class InvalidTokenError extends Error {
  constructor(reason: string) {
    super(`Invalid token: ${reason}`)
    this.name = 'InvalidTokenError'
  }
}

export interface JwtTokenVerifierOptions {
  issuer?: string
  audience?: string
  /** Claim holding the platform's user id. Defaults to the standard "sub". */
  userIdClaim?: string
}

/**
 * The key can be a static secret or public key, or a JWTVerifyGetKey such as
 * jose's createRemoteJWKSet. This class does not need to know which, since
 * jwtVerify accepts either, and that is what makes it the plug-in boundary:
 * a platform signing with HMAC and one rotating RS256 keys behind a JWKS
 * endpoint both work through the same class.
 */
export class JwtTokenVerifier implements TokenVerifier {
  private readonly userIdClaim: string

  constructor(
    private readonly key: KeyInput | JWTVerifyGetKey,
    private readonly options: JwtTokenVerifierOptions = {},
  ) {
    this.userIdClaim = options.userIdClaim ?? 'sub'
  }

  async verify(token: string): Promise<VerifiedIdentity> {
    const payload = await this.verifyPayload(token)

    const userId = payload[this.userIdClaim]
    if (typeof userId !== 'string' || userId.length === 0) {
      throw new InvalidTokenError(`missing or non-string "${this.userIdClaim}" claim`)
    }

    return { userId }
  }

  private async verifyPayload(token: string) {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: this.options.issuer,
        audience: this.options.audience,
      })
      return payload
    } catch (error) {
      throw new InvalidTokenError(error instanceof Error ? error.message : String(error))
    }
  }
}
