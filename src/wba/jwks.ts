/**
 * JWK / JWKS handling for Web Bot Auth — narrow subset:
 *
 *   - Only Ed25519 keys (kty=OKP, crv=Ed25519).
 *   - Key lookup by JWK Thumbprint (RFC 7638) over the canonical
 *     members {kty, crv, x}.
 *   - Base64url decoding of the `x` parameter to the raw 32-byte
 *     public key.
 *
 * The directory URL format follows draft-meunier-web-bot-auth-
 * architecture-05 §3.1:
 *
 *   https://<bot-authority>/.well-known/http-message-signatures-directory
 */

import { sha256 } from "@noble/hashes/sha2.js";

import type { WbaJwk, WbaJwks } from "./types.js";

const TEXT = new TextEncoder();

/**
 * Compute the JWK Thumbprint (RFC 7638) of an Ed25519 JWK.
 *
 * Canonical form: `{"crv":"Ed25519","kty":"OKP","x":"<base64url>"}` —
 * keys in lexical order, no whitespace. SHA-256, then base64url.
 */
export function jwkThumbprint(jwk: WbaJwk): string {
  if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519") {
    throw new Error(
      `Web Bot Auth supports only Ed25519 keys; got kty=${jwk.kty} crv=${jwk.crv}`,
    );
  }
  if (!jwk.x) throw new Error("JWK missing required member 'x'");
  const canonical = `{"crv":"Ed25519","kty":"OKP","x":"${jwk.x}"}`;
  const digest = sha256(TEXT.encode(canonical));
  return base64urlEncode(digest);
}

/**
 * Find a JWK in a JWKS by Web-Bot-Auth keyid. The keyid is the JWK
 * Thumbprint. Falls back to `kid` field equality for compatibility
 * with signers that publish kid=thumbprint as a convenience.
 */
export function findJwkByKeyid(jwks: WbaJwks, keyid: string): WbaJwk | null {
  for (const jwk of jwks.keys) {
    if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519") continue;
    try {
      if (jwkThumbprint(jwk) === keyid) return jwk;
    } catch {
      // ignore malformed key; continue
    }
    if (jwk.kid && jwk.kid === keyid) return jwk;
  }
  return null;
}

/**
 * Decode a JWK's `x` parameter to the raw 32-byte Ed25519 public key.
 */
export function jwkToRawPublicKey(jwk: WbaJwk): Uint8Array {
  if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519") {
    throw new Error(
      `Web Bot Auth supports only Ed25519 keys; got kty=${jwk.kty} crv=${jwk.crv}`,
    );
  }
  const bytes = base64urlDecode(jwk.x);
  if (bytes.length !== 32) {
    throw new Error(`Ed25519 public key must be 32 bytes, got ${bytes.length}`);
  }
  return bytes;
}

/**
 * Build the canonical Web Bot Auth directory URL for a given bot
 * authority (host[:port]).
 */
export function directoryUrl(authority: string): string {
  return `https://${authority}/.well-known/http-message-signatures-directory`;
}

// ─── base64url helpers ─────────────────────────────────────────────

export function base64urlDecode(s: string): Uint8Array {
  const pad = (4 - (s.length % 4)) % 4;
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function base64urlEncode(bytes: Uint8Array): string {
  let s: string;
  if (typeof Buffer !== "undefined") {
    s = Buffer.from(bytes).toString("base64");
  } else {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
    s = btoa(bin);
  }
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64Decode(s: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(s, "base64"));
  }
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
