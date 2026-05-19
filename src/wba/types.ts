/**
 * Web Bot Auth — types.
 *
 * Tracks `draft-meunier-web-bot-auth-architecture-05` (March 2026):
 * an HTTP Message Signatures (RFC 9421) profile where bot operators
 * sign their requests with Ed25519 keys served as a JWKS from
 * `/.well-known/http-message-signatures-directory`. Key identification
 * is via the JWK Thumbprint (RFC 7638).
 *
 * The wire format is still in IETF draft; v0.1 of this module
 * implements the common-case subset:
 *
 *   - Ed25519 keys only
 *   - `keyid` parameter matches a JWK Thumbprint in the directory
 *   - signature-input @signature-params include `created`, `expires`,
 *     `keyid`, `alg`
 *   - The signed components are `@authority` and `signature-agent`
 *
 * Bots that sign with additional components (e.g. `@method`,
 * `@target-uri`, `@request-target`) are supported by the signature-
 * base builder in `./base.ts`.
 */

export type WbaAlgorithm = "ed25519";

export interface WbaJwk {
  kty: "OKP";
  crv: "Ed25519";
  x: string; // base64url-encoded raw 32-byte public key
  kid?: string;
  alg?: "EdDSA" | "Ed25519";
  use?: "sig" | "enc";
}

export interface WbaJwks {
  keys: WbaJwk[];
}

export interface ParsedSignatureInput {
  /** The label that names this signature (the key on both header lines). */
  label: string;
  /** The covered components, in order. */
  components: readonly string[];
  /** Parameters from `;k=v` pairs. */
  params: WbaSignatureParams;
}

export interface WbaSignatureParams {
  /** Unix-seconds timestamp the signature was created. */
  created?: number;
  /** Unix-seconds timestamp at which the signature expires. */
  expires?: number;
  /** Algorithm hint (e.g. "ed25519"). */
  alg?: string;
  /** Identifier of the key used. Typically the JWK Thumbprint. */
  keyid?: string;
  /** Optional nonce. */
  nonce?: string;
  /** Optional tag (purpose). For Web Bot Auth: "web-bot-auth". */
  tag?: string;
}

export interface WbaVerifyResult {
  valid: boolean;
  /** Why verification failed, if it did. */
  reason?:
    | "no-signature"
    | "malformed"
    | "expired"
    | "future-dated"
    | "key-not-found"
    | "bad-signature"
    | "unsupported-alg";
  detail?: string;
  /** Keyid that the signature claimed (filled in even on failure when known). */
  keyid?: string;
  /** Bot operator's signature-agent header (filled in when known). */
  signatureAgent?: string;
}

export interface VerifyOptions {
  /** Override `Date.now()` for testing. */
  now?: () => number;
  /** Clock-skew tolerance in seconds. Default 60. */
  clockSkewSeconds?: number;
  /** Custom fetcher for the JWKS document (defaults to globalThis.fetch). */
  fetchImpl?: typeof fetch;
  /** Maximum JWKS response size to accept, in bytes. Default 64 KiB. */
  maxJwksBytes?: number;
}

export interface VerifyInput {
  /** Full HTTP method (e.g. `GET`). */
  method: string;
  /** Request authority (host[:port]). */
  authority: string;
  /** Path + query (e.g. `/articles?id=1`). */
  targetUri?: string;
  /** Lowercased header map. The verifier reads these names:
   *  `signature`, `signature-input`, `signature-agent`. */
  headers: Record<string, string>;
}
