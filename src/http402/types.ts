/**
 * HTTP 402 Payment Required — types for the response builder.
 *
 * Tracks Cloudflare's pay-per-crawl headers (Crawler-Price /
 * Crawler-Charged / Link rel="payment") for the on-the-wire shape, and
 * adds a structured JSON body so application-layer callers and adapters
 * (TollBit / Skyfire / x402 / Cloudflare PPC) all read from the same
 * payment offer.
 */

export type SettlementRail =
  | "x402" /** Coinbase + Linux Foundation x402 stablecoin rail. */
  | "tollbit" /** TollBit hosted paywall (delegated). */
  | "skyfire" /** Skyfire KYAPay token rail. */
  | "cloudflare-ppc" /** Cloudflare Pay Per Crawl edge enforcement. */
  | "stripe-acp" /** Stripe Agentic Commerce Protocol. */
  | "context-license" /** Per the /.well-known/context-license.json offer. */
  | "custom";

export type Currency = "USD" | "USDC" | "EUR" | "GBP";

export interface PaymentOffer {
  /** Settlement rail the publisher prefers for this request. */
  rail: SettlementRail;
  /** Price quoted in the smallest unit (micros — 1/1,000,000). */
  priceMicros: number;
  /** ISO 4217 currency (or "USDC" for stablecoin rails). */
  currency: Currency;
  /** A URL the buyer can hit to complete payment. Required for `tollbit`, `skyfire`, `stripe-acp`. */
  paymentUrl?: string;
  /** Publisher's network identifier (slug, DID, or stable name). */
  publisher?: string;
  /** Endpoint name (matches an `endpoints[]` entry in context-license.json). */
  endpoint?: string;
  /** Custom fields the rail wants to surface (e.g. x402 token quote). */
  metadata?: Record<string, unknown>;
}

export interface Build402Options {
  /** Payment offer. Required. */
  offer: PaymentOffer;
  /** Human-readable error to display in the response body. Default: "Payment required". */
  message?: string;
  /** Path to the publisher's `/.well-known/context-license.json`. If set, added as `link` header. */
  contextLicenseUrl?: string;
  /** Path to a human-readable terms page. */
  termsUrl?: string;
  /** Override the `Crawler-Price` header value. Default formatted from `offer.priceMicros`. */
  crawlerPriceHeader?: string;
  /** Override the `Retry-After` header (seconds). Default 60. */
  retryAfterSeconds?: number;
}

export interface Built402Response {
  /** HTTP status — always 402. */
  status: 402;
  /** HTTP headers to set, in case-preserved form. */
  headers: Record<string, string>;
  /** Response body to send. JSON-encoded. */
  body: string;
}
