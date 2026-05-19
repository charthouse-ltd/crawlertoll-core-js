/**
 * Parse a robots.txt-flavoured RSL 1.0 document into a structured
 * `RslPolicy`. Tolerant of:
 *
 *   - Mixed Windows/Unix line endings
 *   - Multiple `User-agent:` lines that form a single group
 *   - Comments (`#` to end of line)
 *   - Trailing whitespace
 *   - Unknown directives (captured verbatim under `unknown[]`)
 *
 * Returns a structured warning list rather than throwing — robots.txt
 * parsers historically must consume malformed input without crashing.
 */

import type {
  ParseResult,
  RslAgentGroup,
  RslCompensation,
  RslCompensationModel,
  RslPermittedUse,
  RslPolicy,
  RslProhibitedUse,
} from "./types.js";

const COMPENSATION_MODELS = new Set<RslCompensationModel>([
  "free",
  "per-crawl",
  "per-token",
  "per-document",
  "subscription",
  "negotiate",
]);

// RSL 1.0 uses a shared "use" vocabulary across `Permits` and `Prohibits`.
// A publisher may, for example, both `Permits: ai-search` and
// `Prohibits: ai-training` on the same agent group. Tokens that only
// appear conventionally in one direction (e.g. `rebadging` is rarely
// permitted) are still accepted in either direction — the spec doesn't
// partition the vocabulary.
const USE_VOCAB = new Set<string>([
  // Originally permits-side
  "ai-training",
  "ai-search",
  "ai-inference",
  "rag",
  "agent-task",
  "evaluation",
  "research",
  "commercial-use",
  "non-commercial-use",
  "redistribution-with-attribution",
  // Originally prohibits-side
  "redistribution-without-attribution",
  "rebadging",
  "third-party-resale",
  "competitive-dataset-creation",
  "training-without-license",
]);

export function parseRobotsTxt(text: string): ParseResult {
  const lines = text.split(/\r?\n/);
  const groups: RslAgentGroup[] = [];
  const sitemaps: string[] = [];
  const topUnknown: Array<{ name: string; value: string }> = [];
  const warnings: string[] = [];

  let current: RslAgentGroup | null = null;
  let inGroupHeader = false;
  // `inGroupHeader` is true while consecutive `User-agent:` lines are
  // being collected (per robots.txt: contiguous UA lines form one group).

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    // Strip comments and trim.
    const commentIdx = raw.indexOf("#");
    const stripped = (commentIdx >= 0 ? raw.slice(0, commentIdx) : raw).trim();
    if (!stripped) {
      // Blank line: ends a UA collection phase, but doesn't end the group.
      inGroupHeader = false;
      continue;
    }

    const colon = stripped.indexOf(":");
    if (colon < 0) {
      warnings.push(`line ${i + 1}: no colon, skipping ("${raw}")`);
      continue;
    }
    const name = stripped.slice(0, colon).trim().toLowerCase();
    const value = stripped.slice(colon + 1).trim();

    switch (name) {
      case "user-agent": {
        const ua = value.toLowerCase();
        if (!current || !inGroupHeader) {
          current = { userAgents: [] };
          groups.push(current);
          inGroupHeader = true;
        }
        current.userAgents.push(ua);
        break;
      }
      case "disallow": {
        inGroupHeader = false;
        if (!current) current = pushNewGroup(groups);
        if (value === "") {
          // Disallow: with empty value means "allow everything" — leave as is.
        } else {
          current.disallow ??= [];
          current.disallow.push(value);
        }
        break;
      }
      case "allow": {
        inGroupHeader = false;
        if (!current) current = pushNewGroup(groups);
        if (value) {
          current.allow ??= [];
          current.allow.push(value);
        }
        break;
      }
      case "crawl-delay": {
        inGroupHeader = false;
        if (!current) current = pushNewGroup(groups);
        const n = Number(value);
        if (Number.isFinite(n) && n >= 0) current.crawlDelay = n;
        else warnings.push(`line ${i + 1}: invalid crawl-delay "${value}"`);
        break;
      }
      case "sitemap": {
        sitemaps.push(value);
        break;
      }
      // ─── RSL 1.0 extensions ─────────────────────────────────────
      case "license": {
        inGroupHeader = false;
        if (!current) current = pushNewGroup(groups);
        current.license = value;
        break;
      }
      case "permits": {
        inGroupHeader = false;
        if (!current) current = pushNewGroup(groups);
        current.permits ??= [];
        for (const t of splitTokenList(value)) {
          if (USE_VOCAB.has(t)) {
            current.permits.push(t as RslPermittedUse);
          } else {
            warnings.push(`line ${i + 1}: unrecognised permits token "${t}"`);
          }
        }
        break;
      }
      case "prohibits": {
        inGroupHeader = false;
        if (!current) current = pushNewGroup(groups);
        current.prohibits ??= [];
        for (const t of splitTokenList(value)) {
          if (USE_VOCAB.has(t)) {
            current.prohibits.push(t as RslProhibitedUse);
          } else {
            warnings.push(`line ${i + 1}: unrecognised prohibits token "${t}"`);
          }
        }
        break;
      }
      case "compensation": {
        inGroupHeader = false;
        if (!current) current = pushNewGroup(groups);
        const comp = parseCompensation(value, i + 1, warnings);
        if (comp) {
          current.compensation ??= [];
          current.compensation.push(comp);
        }
        break;
      }
      case "standard": {
        inGroupHeader = false;
        if (!current) current = pushNewGroup(groups);
        current.standards ??= [];
        current.standards.push(value);
        break;
      }
      default: {
        // Unknown directive — preserve.
        if (current) {
          inGroupHeader = false;
          current.unknown ??= [];
          current.unknown.push({ name, value });
        } else {
          topUnknown.push({ name, value });
        }
      }
    }
  }

  const policy: RslPolicy = { groups };
  if (sitemaps.length) policy.sitemaps = sitemaps;
  if (topUnknown.length) policy.unknown = topUnknown;
  return { policy, warnings };
}

function pushNewGroup(groups: RslAgentGroup[]): RslAgentGroup {
  const g: RslAgentGroup = { userAgents: ["*"] };
  groups.push(g);
  return g;
}

function splitTokenList(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function parseCompensation(
  value: string,
  lineNum: number,
  warnings: string[],
): RslCompensation | null {
  // Forms supported:
  //   free
  //   negotiate
  //   subscription
  //   per-crawl 5000 micros USD
  //   per-document 100000 micros USDC https://example.com/pay
  //   per-token 50 micros USD
  const tokens = value.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    warnings.push(`line ${lineNum}: empty compensation`);
    return null;
  }
  const model = tokens[0]!.toLowerCase() as RslCompensationModel;
  if (!COMPENSATION_MODELS.has(model)) {
    warnings.push(`line ${lineNum}: unknown compensation model "${tokens[0]}"`);
    return null;
  }
  if (model === "free" || model === "negotiate" || model === "subscription") {
    const url = tokens.find((t) => /^https?:\/\//i.test(t));
    return { model, ...(url ? { url } : {}) };
  }
  // Paid models: <model> <micros> "micros" <currency> [<url>]
  const priceMicros = Number(tokens[1]);
  if (!Number.isFinite(priceMicros) || priceMicros < 0) {
    warnings.push(`line ${lineNum}: bad price "${tokens[1]}"`);
    return null;
  }
  const currency = tokens[3]?.toUpperCase();
  const url = tokens.find((t) => /^https?:\/\//i.test(t));
  if (currency !== "USD" && currency !== "USDC" && currency !== "EUR" && currency !== "GBP") {
    warnings.push(`line ${lineNum}: unknown currency "${currency ?? "?"}"`);
  }
  return {
    model,
    priceMicros,
    ...(currency === "USD" || currency === "USDC" || currency === "EUR" || currency === "GBP"
      ? { currency }
      : {}),
    ...(url ? { url } : {}),
  };
}
