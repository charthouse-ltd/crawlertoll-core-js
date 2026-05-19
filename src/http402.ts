/**
 * @crawlertoll/core/http402 — HTTP 402 Payment Required builders.
 *
 *   import { build402, applyTo, toWebResponse } from "@crawlertoll/core/http402";
 *
 *   const built = build402({
 *     offer: { rail: "x402", priceMicros: 5000, currency: "USD" },
 *     contextLicenseUrl: "https://example.com/.well-known/context-license.json",
 *   });
 *   applyTo(res, built);  // Express / Fastify / node:http
 *   return toWebResponse(built);  // Cloudflare Workers / Hono / Bun / Deno
 */

export {
  build402,
  formatCrawlerPrice,
  microsToMajor,
  applyTo,
  toWebResponse,
} from "./http402/build.js";

export type { NodeResponseLike } from "./http402/build.js";

export type {
  Build402Options,
  Built402Response,
  PaymentOffer,
  SettlementRail,
  Currency,
} from "./http402/types.js";
