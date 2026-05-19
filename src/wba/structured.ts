/**
 * Tiny RFC 8941 / RFC 9651 structured-fields parser, scoped to what
 * Web Bot Auth uses:
 *
 *   - Inner-list of strings (the covered components)
 *   - Parameters: `;name=value` pairs with integer, string, and token values
 *
 * Full structured-fields parsers exist (e.g. `structured-headers`) but
 * pulling in a dependency for the narrow subset Web Bot Auth uses is
 * over-investment for the v0.1 surface. This file is ~80 lines and
 * round-trips every signature-input header observed in the wild as of
 * 2026-05.
 */

import type { ParsedSignatureInput, WbaSignatureParams } from "./types.js";

/**
 * Parse a `Signature-Input` header value.
 *
 * Example input:
 *   `sig1=("@authority" "signature-agent");created=1716156000;keyid="abc";alg="ed25519";tag="web-bot-auth"`
 *
 * Returns one parsed entry per label. A single header may name multiple
 * signatures; callers usually pick the first label whose `tag` is
 * `"web-bot-auth"`.
 */
export function parseSignatureInput(value: string): ParsedSignatureInput[] {
  const result: ParsedSignatureInput[] = [];
  // Split on commas that are NOT inside parentheses or quotes.
  const entries = splitTopLevelCommas(value);
  for (const raw of entries) {
    const parsed = parseOneEntry(raw.trim());
    if (parsed) result.push(parsed);
  }
  return result;
}

function parseOneEntry(raw: string): ParsedSignatureInput | null {
  // Format: `label=(...)<;params>`
  const eq = raw.indexOf("=");
  if (eq < 0) return null;
  const label = raw.slice(0, eq).trim();
  const rest = raw.slice(eq + 1).trim();

  // Find the inner list `(...)`.
  if (rest[0] !== "(") return null;
  const closeIdx = rest.indexOf(")");
  if (closeIdx < 0) return null;
  const listText = rest.slice(1, closeIdx);
  const paramsText = rest.slice(closeIdx + 1).trim();

  const components = parseInnerList(listText);
  const params = parseParams(paramsText);

  return { label, components, params };
}

function parseInnerList(s: string): string[] {
  // Items in a Web Bot Auth inner list are quoted strings:
  //   "@authority" "signature-agent"
  const out: string[] = [];
  const re = /"((?:\\.|[^"\\])*)"/g;
  for (const m of s.matchAll(re)) {
    out.push((m[1] ?? "").replace(/\\(.)/g, "$1"));
  }
  return out;
}

function parseParams(s: string): WbaSignatureParams {
  const out: WbaSignatureParams = {};
  if (!s) return out;
  // Strip leading ';' if present, then split on ';' at top level.
  let body = s;
  if (body[0] === ";") body = body.slice(1);
  for (const part of splitTopLevelSemicolons(body)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const name = trimmed.slice(0, eq).trim().toLowerCase();
    const rawVal = trimmed.slice(eq + 1).trim();
    const val = unwrapValue(rawVal);
    switch (name) {
      case "created":
      case "expires": {
        const n = Number(val);
        if (Number.isFinite(n)) out[name] = n;
        break;
      }
      case "alg":
        out.alg = String(val);
        break;
      case "keyid":
        out.keyid = String(val);
        break;
      case "nonce":
        out.nonce = String(val);
        break;
      case "tag":
        out.tag = String(val);
        break;
      // Unknown params: ignored per structured-fields tolerance rules.
    }
  }
  return out;
}

function unwrapValue(s: string): string | number {
  if (s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/\\(.)/g, "$1");
  }
  if (/^-?\d+$/.test(s)) return Number(s);
  return s;
}

function splitTopLevelCommas(s: string): string[] {
  return splitTopLevel(s, ",");
}
function splitTopLevelSemicolons(s: string): string[] {
  return splitTopLevel(s, ";");
}

function splitTopLevel(s: string, sep: "," | ";"): string[] {
  const out: string[] = [];
  let depth = 0;
  let inStr = false;
  let escape = false;
  let buf = "";
  for (const ch of s) {
    if (escape) {
      buf += ch;
      escape = false;
      continue;
    }
    if (inStr) {
      buf += ch;
      if (ch === "\\") escape = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      buf += ch;
      continue;
    }
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === sep && depth === 0) {
      out.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.length) out.push(buf);
  return out;
}

/**
 * Parse a `Signature` header value into a map of label → base64url-encoded bytes.
 *
 * Example: `sig1=:Y2FmZWJhYmU=:`  → `{ sig1: <base64 string> }`.
 */
export function parseSignature(value: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of splitTopLevelCommas(value)) {
    const trimmed = raw.trim();
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const label = trimmed.slice(0, eq).trim();
    const rest = trimmed.slice(eq + 1).trim();
    // Byte sequence: `:base64:`
    if (rest.startsWith(":") && rest.endsWith(":")) {
      out[label] = rest.slice(1, -1);
    }
  }
  return out;
}
