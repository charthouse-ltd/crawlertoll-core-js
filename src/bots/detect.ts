/**
 * High-level bot-detection entrypoint. Returns a structured
 * `BotDetection` verdict from an incoming HTTP request.
 *
 * Detection composes three signals, in this order:
 *
 *   1. Curated User-Agent match (`./catalogue.ts`). Cheap, robust against
 *      well-behaved bots that identify themselves.
 *   2. `Signature-Input` / `Signature` headers (Web Bot Auth) — if
 *      present, the request claims cryptographic identity per IETF
 *      draft-meunier-web-bot-auth-architecture-05. Verification is
 *      deferred to `../wba/verify.ts`; this module reports presence.
 *   3. `Signature-Agent` header (also Web Bot Auth) — a hint about the
 *      bot's product family (e.g. `https://chatgpt.com/operator`).
 *
 * The verdict is intentionally a *description*, not a decision. Policy
 * (block / charge / allow) is a separate layer (`../policy/`).
 */

import { matchUserAgent, type BotEntry } from "./catalogue.js";

export interface BotDetection {
  /** Is this request from a known crawler / agent we recognised? */
  isBot: boolean;
  /** Catalogue entry that matched, if any. */
  entry: BotEntry | null;
  /** Raw User-Agent string. */
  userAgent: string;
  /** Did the request carry HTTP Message Signatures headers (Web Bot Auth)? */
  hasSignatureHeaders: boolean;
  /** Value of the Signature-Agent header, if present. */
  signatureAgent: string | null;
  /** Reasoning trace for logging / dashboards. */
  reasons: readonly string[];
}

export interface DetectInput {
  /** HTTP request headers. Case-insensitive lookup via `lowercase()` is fine. */
  headers: Record<string, string | string[] | undefined> | Headers;
}

/**
 * Run bot detection over a request. Cheap and synchronous; safe to call
 * on every request.
 */
export function detectBot(input: DetectInput): BotDetection {
  const headers = normaliseHeaders(input.headers);
  const userAgent = headers.get("user-agent") ?? "";
  const sigInput = headers.get("signature-input");
  const sig = headers.get("signature");
  const sigAgent = headers.get("signature-agent");

  const entry = matchUserAgent(userAgent);
  const reasons: string[] = [];

  if (entry) {
    reasons.push(`ua-match:${entry.name}`);
  }
  const hasSig = Boolean(sigInput && sig);
  if (hasSig) {
    reasons.push("signature-headers-present");
  }
  if (sigAgent) {
    reasons.push(`signature-agent:${sigAgent}`);
  }

  return {
    isBot: Boolean(entry || hasSig || sigAgent),
    entry,
    userAgent,
    hasSignatureHeaders: hasSig,
    signatureAgent: sigAgent,
    reasons: Object.freeze(reasons),
  };
}

// ─── header helpers ────────────────────────────────────────────────

interface HeaderBag {
  get(name: string): string | null;
}

function normaliseHeaders(
  input: Record<string, string | string[] | undefined> | Headers,
): HeaderBag {
  // Native Headers (undici / fetch / Cloudflare Workers).
  if (typeof (input as Headers).get === "function") {
    const h = input as Headers;
    return {
      get(name) {
        const v = h.get(name);
        return v ?? null;
      },
    };
  }
  // Node http.IncomingMessage.headers shape.
  const obj = input as Record<string, string | string[] | undefined>;
  const lc: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    lc[k.toLowerCase()] = Array.isArray(v) ? (v[0] ?? "") : v;
  }
  return {
    get(name) {
      return lc[name.toLowerCase()] ?? null;
    },
  };
}
