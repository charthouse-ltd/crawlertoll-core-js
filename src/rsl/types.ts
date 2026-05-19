/**
 * RSL 1.0 — Really Simple Licensing — types for the robots.txt-flavoured
 * profile.
 *
 * Background. RSL 1.0 was published 2025-12-10 by the RSL Technical
 * Steering Committee (Reddit, Yahoo, People Inc., Medium, Quora, O'Reilly,
 * Ziff Davis, Fastly, Stack Overflow, Cloudflare). The wire format is
 * primarily an XML vocabulary; for robots.txt deployment, RSL ships
 * lightweight key/value directives that map onto the XML schema 1:1.
 *
 * This module models the robots.txt subset:
 *
 *     User-agent: GPTBot
 *     Disallow: /
 *     License: https://example.com/ai-license
 *     Permits: ai-training, ai-search
 *     Prohibits: rebadging, third-party-resale
 *     Compensation: per-crawl 5000 micros USD
 *     Standard: RSL/1.0
 *
 * Multiple agent groups, multiple licences, and multiple compensation
 * lines per group are all supported. Unknown directives are preserved
 * verbatim under `unknown[]` so future-spec deployments round-trip cleanly.
 *
 * The XML envelope is reserved for v0.2; the v0.1 surface here covers
 * the highest-traffic deployment path (robots.txt directives), which
 * RSL signatories including Reddit and Quora ship today.
 */

/**
 * RSL 1.0 use vocabulary. Shared between `Permits` and `Prohibits`
 * directives — a publisher may permit or prohibit any token. The
 * grouping below is a hint at convention, not enforced by the spec.
 */
export type RslUse =
  // Use cases typically *permitted*
  | "ai-training"
  | "ai-search"
  | "ai-inference"
  | "rag"
  | "agent-task"
  | "evaluation"
  | "research"
  | "commercial-use"
  | "non-commercial-use"
  | "redistribution-with-attribution"
  // Use cases typically *prohibited*
  | "redistribution-without-attribution"
  | "rebadging"
  | "third-party-resale"
  | "competitive-dataset-creation"
  | "training-without-license";

/** Permits and Prohibits draw from the same vocabulary. */
export type RslPermittedUse = RslUse;
export type RslProhibitedUse = RslUse;

export type RslCompensationModel =
  | "free"
  | "per-crawl"
  | "per-token"
  | "per-document"
  | "subscription"
  | "negotiate";

export interface RslCompensation {
  model: RslCompensationModel;
  /** Price in micros (1/1,000,000 of the currency unit). */
  priceMicros?: number;
  currency?: "USD" | "USDC" | "EUR" | "GBP";
  /** URL to negotiate or settle (e.g. /.well-known/context-license.json, x402 endpoint). */
  url?: string;
}

export interface RslAgentGroup {
  /** Lowercased user-agent tokens this group applies to. `*` matches all. */
  userAgents: string[];
  /** Paths the agents may NOT crawl. */
  disallow?: string[];
  /** Paths the agents MAY crawl explicitly (overrides Disallow). */
  allow?: string[];
  /** Crawl-delay in seconds, if declared. */
  crawlDelay?: number;
  /** URL to a human-readable license document. */
  license?: string;
  /** Machine-readable permitted uses. */
  permits?: RslPermittedUse[];
  /** Machine-readable prohibited uses. */
  prohibits?: RslProhibitedUse[];
  /** Compensation declarations (multiple allowed for tiered pricing). */
  compensation?: RslCompensation[];
  /** Standard line(s) declared (e.g. "RSL/1.0", "ContextLicense/0.1"). */
  standards?: string[];
  /** Unrecognised directives, preserved for round-trip. */
  unknown?: Array<{ name: string; value: string }>;
}

export interface RslPolicy {
  /** Optional Sitemap URLs (standard robots.txt directive, kept for fidelity). */
  sitemaps?: string[];
  /** Agent groups, in declaration order. */
  groups: RslAgentGroup[];
  /** Top-level unknown directives (rare but preserved). */
  unknown?: Array<{ name: string; value: string }>;
}

export interface ParseResult {
  policy: RslPolicy;
  /** Warnings — e.g. malformed compensation value; soft-fail. */
  warnings: string[];
}
