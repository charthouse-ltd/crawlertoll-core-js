/**
 * Build the HTTP Message Signature *signature base* per RFC 9421 §2.5,
 * scoped to the components Web Bot Auth uses:
 *
 *   @authority       — the request's authority pseudo-header
 *   @method          — the request's HTTP method
 *   @target-uri      — the request's absolute target URI
 *   @path            — the request's path
 *   @query           — the request's query string (with leading "?")
 *   signature-agent  — the bot's product-family declaration
 *
 * Unknown components are surfaced as an error rather than silently
 * dropped — better to fail closed than to verify a signature over a
 * smaller-than-claimed message.
 */

import type { ParsedSignatureInput, VerifyInput } from "./types.js";

export interface BuildBaseResult {
  ok: true;
  /** The byte string to verify against. */
  base: Uint8Array;
}

export interface BuildBaseError {
  ok: false;
  reason: string;
}

const ENCODER = new TextEncoder();

export function buildSignatureBase(
  parsed: ParsedSignatureInput,
  input: VerifyInput,
  rawSignatureInputValue: string,
): BuildBaseResult | BuildBaseError {
  const lines: string[] = [];

  for (const component of parsed.components) {
    const value = resolveComponent(component, input);
    if (value === null) {
      return {
        ok: false,
        reason: `unsupported-component:${component}`,
      };
    }
    lines.push(`"${component}": ${value}`);
  }

  // Final "@signature-params" line — the inner-list and its params,
  // serialised exactly as they appeared on the wire under the matching
  // label. We extract the right slice of the raw header rather than
  // re-serialising (to avoid normalisation drift).
  const paramsLine = extractParamsForLabel(rawSignatureInputValue, parsed.label);
  if (paramsLine === null) {
    return { ok: false, reason: "could-not-extract-signature-params" };
  }
  lines.push(`"@signature-params": ${paramsLine}`);

  const baseText = lines.join("\n");
  return { ok: true, base: ENCODER.encode(baseText) };
}

function resolveComponent(component: string, input: VerifyInput): string | null {
  switch (component) {
    case "@authority":
      return input.authority;
    case "@method":
      return input.method.toUpperCase();
    case "@target-uri":
      return absoluteTargetUri(input);
    case "@path":
      return parseTargetUri(input.targetUri).path;
    case "@query":
      return parseTargetUri(input.targetUri).query;
    case "@request-target":
      // RFC 9421 obsolete, but some signers still use it.
      return `${input.method.toLowerCase()} ${input.targetUri ?? "/"}`;
    default: {
      // Treat as a header field. Lowercase lookup.
      const hv = input.headers[component.toLowerCase()];
      if (hv === undefined) return null;
      return hv;
    }
  }
}

function parseTargetUri(target: string | undefined): {
  path: string;
  query: string;
} {
  if (!target) return { path: "/", query: "" };
  const qIdx = target.indexOf("?");
  if (qIdx < 0) return { path: target, query: "" };
  return { path: target.slice(0, qIdx), query: target.slice(qIdx) };
}

function absoluteTargetUri(input: VerifyInput): string {
  // Web Bot Auth signs over the *authority* and *target-uri* separately;
  // the absolute URI is reconstructed as `https://<authority><target>`.
  const scheme = "https";
  return `${scheme}://${input.authority}${input.targetUri ?? "/"}`;
}

/**
 * Given the raw `Signature-Input` header text and a label, return the
 * exact substring after `<label>=` (including the inner list and all
 * parameters). Whitespace and quoting are preserved verbatim so the
 * signature-base byte sequence matches what the signer canonicalised.
 */
function extractParamsForLabel(raw: string, label: string): string | null {
  // Match `<label>=...` at the start of an entry. We walk byte-by-byte
  // because labels may repeat across multiple top-level entries.
  const target = `${label}=`;
  let depth = 0;
  let inStr = false;
  let escape = false;
  let entryStart = 0;
  for (let i = 0; i <= raw.length; i++) {
    const ch = raw[i];
    const atEnd = i === raw.length;
    if (!atEnd) {
      if (escape) {
        escape = false;
        continue;
      }
      if (inStr) {
        if (ch === "\\") escape = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') {
        inStr = true;
        continue;
      }
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (!(ch === "," && depth === 0)) continue;
    }
    // Comma at top level — boundary between entries — or EOS.
    const entry = raw.slice(entryStart, atEnd ? raw.length : i).trim();
    entryStart = (atEnd ? raw.length : i) + 1;
    if (entry.startsWith(target)) {
      return entry.slice(target.length);
    }
  }
  return null;
}
