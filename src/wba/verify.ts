/**
 * Web Bot Auth verifier — `verifyWebBotAuth(input, options?)`.
 *
 * Implements `draft-meunier-web-bot-auth-architecture-05` (March 2026):
 * verify an HTTP Message Signature (RFC 9421) on an incoming request,
 * using the public key advertised at the bot's
 * `/.well-known/http-message-signatures-directory` JWKS endpoint.
 *
 * Failure is always structured: returns `{ valid: false, reason, detail }`
 * rather than throwing, so middleware can log/route without try/catch
 * boilerplate.
 *
 * Caches JWKS by directory URL for the lifetime of the process; the
 * cache TTL defaults to 1 hour. Override via `options.jwksCache`.
 */

import * as ed from "@noble/ed25519";

import { buildSignatureBase } from "./base.js";
import {
  base64Decode,
  directoryUrl,
  findJwkByKeyid,
  jwkToRawPublicKey,
} from "./jwks.js";
import { parseSignature, parseSignatureInput } from "./structured.js";
import type {
  ParsedSignatureInput,
  VerifyInput,
  VerifyOptions,
  WbaJwks,
  WbaVerifyResult,
} from "./types.js";

interface JwksCacheEntry {
  jwks: WbaJwks;
  expiresAt: number;
}
const DEFAULT_JWKS_TTL_MS = 60 * 60 * 1000;
const globalJwksCache = new Map<string, JwksCacheEntry>();

/**
 * Verify a Web Bot Auth signature on an incoming request.
 *
 * The `input` object describes the request after it has reached your
 * application (Node http.IncomingMessage, Express req, Hono Context.req,
 * Cloudflare Worker Request). Use the per-framework adapters in
 * `@crawlertoll/express`, `@crawlertoll/hono`, etc. to build it.
 *
 * Returns a structured verdict. The caller decides policy
 * (block / charge / allow) — this function is pure verification.
 */
export async function verifyWebBotAuth(
  input: VerifyInput,
  options: VerifyOptions = {},
): Promise<WbaVerifyResult> {
  const sigInputRaw = input.headers["signature-input"];
  const sigRaw = input.headers["signature"];
  const sigAgent = input.headers["signature-agent"] ?? undefined;

  if (!sigInputRaw || !sigRaw) {
    return {
      valid: false,
      reason: "no-signature",
      detail: "request missing signature-input or signature headers",
      ...(sigAgent ? { signatureAgent: sigAgent } : {}),
    };
  }

  // ─── Parse structured headers ────────────────────────────────────
  let parsedInputs: ParsedSignatureInput[];
  try {
    parsedInputs = parseSignatureInput(sigInputRaw);
  } catch (err) {
    return malformed(`signature-input parse failed: ${(err as Error).message}`, sigAgent);
  }
  if (parsedInputs.length === 0) {
    return malformed("signature-input contained no entries", sigAgent);
  }

  // Pick the first entry whose tag is "web-bot-auth", or the first if none.
  const chosen =
    parsedInputs.find((p) => p.params.tag === "web-bot-auth") ?? parsedInputs[0]!;

  let sigMap: Record<string, string>;
  try {
    sigMap = parseSignature(sigRaw);
  } catch (err) {
    return malformed(`signature parse failed: ${(err as Error).message}`, sigAgent);
  }
  const sigB64 = sigMap[chosen.label];
  if (!sigB64) {
    return malformed(
      `signature header does not include label "${chosen.label}"`,
      sigAgent,
    );
  }

  // ─── Temporal checks ────────────────────────────────────────────
  const now = (options.now ?? Date.now)() / 1000;
  const skew = options.clockSkewSeconds ?? 60;
  const created = chosen.params.created;
  const expires = chosen.params.expires;

  if (typeof expires === "number" && now > expires + skew) {
    return {
      valid: false,
      reason: "expired",
      detail: `signature expired at ${expires}, now is ${Math.floor(now)}`,
      keyid: chosen.params.keyid,
      ...(sigAgent ? { signatureAgent: sigAgent } : {}),
    };
  }
  if (typeof created === "number" && created > now + skew) {
    return {
      valid: false,
      reason: "future-dated",
      detail: `signature created at ${created} is more than ${skew}s in the future`,
      keyid: chosen.params.keyid,
      ...(sigAgent ? { signatureAgent: sigAgent } : {}),
    };
  }

  // ─── Algorithm check ────────────────────────────────────────────
  const alg = (chosen.params.alg ?? "").toLowerCase();
  if (alg && alg !== "ed25519") {
    return {
      valid: false,
      reason: "unsupported-alg",
      detail: `expected ed25519, got "${alg}"`,
      keyid: chosen.params.keyid,
      ...(sigAgent ? { signatureAgent: sigAgent } : {}),
    };
  }

  // ─── Resolve key ────────────────────────────────────────────────
  if (!chosen.params.keyid) {
    return malformed("signature-input missing required keyid parameter", sigAgent);
  }

  const authority = pickBotAuthority(sigAgent, input.authority);
  const dirUrl = directoryUrl(authority);

  let jwks: WbaJwks;
  try {
    jwks = await fetchJwks(dirUrl, options);
  } catch (err) {
    return {
      valid: false,
      reason: "key-not-found",
      detail: `could not fetch JWKS at ${dirUrl}: ${(err as Error).message}`,
      keyid: chosen.params.keyid,
      ...(sigAgent ? { signatureAgent: sigAgent } : {}),
    };
  }

  const jwk = findJwkByKeyid(jwks, chosen.params.keyid);
  if (!jwk) {
    return {
      valid: false,
      reason: "key-not-found",
      detail: `keyid ${chosen.params.keyid} not present in JWKS at ${dirUrl}`,
      keyid: chosen.params.keyid,
      ...(sigAgent ? { signatureAgent: sigAgent } : {}),
    };
  }

  let publicKey: Uint8Array;
  try {
    publicKey = jwkToRawPublicKey(jwk);
  } catch (err) {
    return malformed((err as Error).message, sigAgent);
  }

  // ─── Build signature base + verify ──────────────────────────────
  const built = buildSignatureBase(chosen, input, sigInputRaw);
  if (!built.ok) {
    return malformed(built.reason, sigAgent);
  }

  let sigBytes: Uint8Array;
  try {
    sigBytes = base64Decode(sigB64);
  } catch (err) {
    return malformed(
      `signature is not valid base64: ${(err as Error).message}`,
      sigAgent,
    );
  }
  if (sigBytes.length !== 64) {
    return malformed(
      `Ed25519 signature must be 64 bytes, got ${sigBytes.length}`,
      sigAgent,
    );
  }

  let ok = false;
  try {
    ok = await ed.verifyAsync(sigBytes, built.base, publicKey);
  } catch (err) {
    return {
      valid: false,
      reason: "bad-signature",
      detail: (err as Error).message,
      keyid: chosen.params.keyid,
      ...(sigAgent ? { signatureAgent: sigAgent } : {}),
    };
  }

  if (!ok) {
    return {
      valid: false,
      reason: "bad-signature",
      detail: "Ed25519 verification returned false",
      keyid: chosen.params.keyid,
      ...(sigAgent ? { signatureAgent: sigAgent } : {}),
    };
  }

  return {
    valid: true,
    keyid: chosen.params.keyid,
    ...(sigAgent ? { signatureAgent: sigAgent } : {}),
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

function malformed(detail: string, signatureAgent?: string): WbaVerifyResult {
  return {
    valid: false,
    reason: "malformed",
    detail,
    ...(signatureAgent ? { signatureAgent } : {}),
  };
}

/**
 * The bot's authority for JWKS lookup is taken from the
 * `Signature-Agent` header (if it's a URL) or the request's own
 * authority (as a fallback for first-party signed requests).
 */
function pickBotAuthority(signatureAgent: string | undefined, fallback: string): string {
  if (signatureAgent) {
    try {
      // signature-agent is a structured-fields string; strip wrapping quotes
      // if present, then parse as URL.
      let s = signatureAgent.trim();
      if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
      const u = new URL(s);
      return u.host;
    } catch {
      // fall through to fallback
    }
  }
  return fallback;
}

async function fetchJwks(url: string, options: VerifyOptions): Promise<WbaJwks> {
  const now = (options.now ?? Date.now)();
  const cached = globalJwksCache.get(url);
  if (cached && cached.expiresAt > now) {
    return cached.jwks;
  }
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error(
      "No fetch implementation available. Pass options.fetchImpl or run on a platform with global fetch.",
    );
  }
  const res = await fetchImpl(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const text = await res.text();
  const maxBytes = options.maxJwksBytes ?? 64 * 1024;
  if (text.length > maxBytes) {
    throw new Error(`JWKS response too large: ${text.length} > ${maxBytes}`);
  }
  let jwks: WbaJwks;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isJwks(parsed)) throw new Error("not a valid JWKS document");
    jwks = parsed;
  } catch (err) {
    throw new Error(`malformed JWKS: ${(err as Error).message}`);
  }
  globalJwksCache.set(url, {
    jwks,
    expiresAt: now + DEFAULT_JWKS_TTL_MS,
  });
  return jwks;
}

/** Clear the in-process JWKS cache. Useful for tests and key rotation. */
export function clearJwksCache(url?: string): void {
  if (url) globalJwksCache.delete(url);
  else globalJwksCache.clear();
}

function isJwks(x: unknown): x is WbaJwks {
  if (!x || typeof x !== "object") return false;
  const keys = (x as { keys?: unknown }).keys;
  return Array.isArray(keys);
}
