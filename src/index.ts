/**
 * @crawlertoll/core — neutral, vendor-agnostic Node middleware for the
 * AI-crawler economy.
 *
 * Three primitives:
 *
 *   1. Bot detection — curated UA catalogue + Web Bot Auth signature
 *      header presence. `import from "@crawlertoll/core/bots"`.
 *
 *   2. Web Bot Auth verification — Ed25519 + RFC 9421 HTTP Message
 *      Signatures + JWKS thumbprint match per draft-meunier-05.
 *      `import from "@crawlertoll/core/wba"`.
 *
 *   3. HTTP 402 issuance — Cloudflare crawler-price headers + a
 *      structured JSON payment offer. `import from "@crawlertoll/core/http402"`.
 *
 *   Bonus: RSL 1.0 robots.txt parser/generator. `import from "@crawlertoll/core/rsl"`.
 *   Bonus: `decide()` — the high-level orchestrator framework adapters wrap.
 *
 * The root export `decide()` ties all four together. Use it directly
 * from any framework whose request type can be marshalled into a
 * `DecideRequest` (Node http.IncomingMessage, Express req, Fastify req,
 * Hono Context.req, Cloudflare Worker Request, Vercel Edge Request).
 *
 * Spec references:
 *   - HTTP 402:        Cloudflare pay-per-crawl (1B+ daily 402s as of Q1 2026)
 *   - Web Bot Auth:    draft-meunier-web-bot-auth-architecture-05 (Mar 2026)
 *   - RSL 1.0:         RSL Technical Steering Committee, 2025-12-10
 *   - x402:            Coinbase + Linux Foundation, contributed Apr 2026
 *
 * License: Apache-2.0. Specs themselves are public.
 */

if (typeof globalThis.crypto?.getRandomValues !== "function") {
  throw new Error(
    "@crawlertoll/core requires Web Crypto (globalThis.crypto.getRandomValues). " +
      "Node 20+, Bun, Deno, and Cloudflare Workers all qualify. " +
      "Node 18 is EOL (April 2025) — upgrade to Node 20.",
  );
}

// ─── High-level orchestrator ───────────────────────────────────────

export {
  decide,
  type DecideInput,
  type DecideRequest,
  type Decision,
  type DecisionAction,
} from "./decide.js";

// ─── Sub-module re-exports for ergonomic root-level use ────────────

export {
  detectBot,
  matchUserAgent,
  BOT_CATALOGUE,
  type BotDetection,
  type DetectInput,
  type BotEntry,
  type BotCategory,
} from "./bots.js";

export {
  verifyWebBotAuth,
  clearJwksCache,
  jwkThumbprint,
  directoryUrl,
  type VerifyInput,
  type VerifyOptions,
  type WbaVerifyResult,
  type WbaJwk,
  type WbaJwks,
} from "./wba.js";

export {
  build402,
  formatCrawlerPrice,
  microsToMajor,
  applyTo,
  toWebResponse,
  type Build402Options,
  type Built402Response,
  type PaymentOffer,
  type SettlementRail,
  type Currency,
  type NodeResponseLike,
} from "./http402.js";

export {
  parseRobotsTxt,
  serializeRobotsTxt,
  matchAgent,
  matchPath,
  type RslPolicy,
  type RslAgentGroup,
  type RslCompensation,
  type RslCompensationModel,
  type RslPermittedUse,
  type RslProhibitedUse,
  type ParseResult,
  type PathDecision,
} from "./rsl.js";
