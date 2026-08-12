export interface VerifiedIdentity {
  readonly userId: string
}

/**
 * Verifies a token issued by whatever platform is calling the service. This
 * is the boundary a platform implements to plug its own auth in, so nothing
 * else needs to know how a caller was authenticated.
 *
 * Only the service mode uses this. Embedding the package runs inside a
 * process that has already worked out who the user is.
 */
export interface TokenVerifier {
  verify(token: string): Promise<VerifiedIdentity>
}
