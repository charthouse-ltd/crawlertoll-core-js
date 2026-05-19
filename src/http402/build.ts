/**
 * Build a 402 Payment Required response per Cloudflare's pay-per-crawl
 * shape, with a structured JSON body that any compatible buyer SDK can
 * parse without scraping headers.
 *
 *   On-the-wire headers:
 *     Crawler-Price: 5000 micros USD
 *     Crawler-Price-Rail: x402
 *     Link: <https://example.com/.well-known/context-license.json>; rel="payment"
 *     Link: <https://example.com/ai-terms>; rel="terms-of-service"
 *     Retry-After: 60
 *     Content-Type: application/json
 *
 *   Response body (JSON):
 *     {
 *       "error": "payment_required",
 *       "message": "...",
 *       "offer": { rail, priceMicros, currency, paymentUrl, publisher, endpoint, metadata }
 *     }
 *
 * The body is the source of truth; the headers are the on-the-wire
 * convenience that Cloudflare-side intermediaries and edge proxies read
 * without parsing JSON. Both are emitted by default.
 */

import type {
  Build402Options,
  Built402Response,
  PaymentOffer,
} from "./types.js";

export function build402(options: Build402Options): Built402Response {
  const offer = options.offer;
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "crawler-price":
      options.crawlerPriceHeader ?? formatCrawlerPrice(offer),
    "crawler-price-rail": offer.rail,
    "retry-after": String(options.retryAfterSeconds ?? 60),
  };

  // Link headers — multiple `Link` are not allowed under the same name
  // in a typical Headers map; we concatenate per RFC 8288.
  const links: string[] = [];
  if (offer.paymentUrl) {
    links.push(`<${offer.paymentUrl}>; rel="payment"; type="${offer.rail}"`);
  }
  if (options.contextLicenseUrl) {
    links.push(
      `<${options.contextLicenseUrl}>; rel="describedby"; type="application/json"`,
    );
  }
  if (options.termsUrl) {
    links.push(`<${options.termsUrl}>; rel="terms-of-service"`);
  }
  if (links.length) {
    headers["link"] = links.join(", ");
  }

  const body = JSON.stringify(
    {
      error: "payment_required",
      message: options.message ?? "Payment required.",
      offer,
    },
    null,
    2,
  );

  return {
    status: 402,
    headers,
    body,
  };
}

/**
 * Format the `Crawler-Price` header value. Cloudflare's draft uses the
 * shape `<integer> micros <ISO4217>` (e.g. `5000 micros USD`). USDC and
 * other non-ISO4217 currencies are passed through verbatim.
 */
export function formatCrawlerPrice(offer: PaymentOffer): string {
  if (!Number.isFinite(offer.priceMicros) || offer.priceMicros < 0) {
    throw new Error(`Invalid priceMicros: ${offer.priceMicros}`);
  }
  return `${Math.round(offer.priceMicros)} micros ${offer.currency}`;
}

/**
 * Convert micros to a decimal string of the major currency unit
 * ($0.005 for 5000 micros USD). Useful for logs and dashboards.
 */
export function microsToMajor(priceMicros: number): string {
  const cents = priceMicros / 1_000_000;
  return cents.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * Apply a Built402Response to a Node http.ServerResponse-like object.
 * Express, Fastify, and the bare `http` module all accept this shape.
 */
export interface NodeResponseLike {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(chunk?: string): void;
}
export function applyTo(res: NodeResponseLike, built: Built402Response): void {
  res.statusCode = built.status;
  for (const [name, value] of Object.entries(built.headers)) {
    res.setHeader(name, value);
  }
  res.end(built.body);
}

/**
 * Build a `Response` (WHATWG) from a Built402Response. For Cloudflare
 * Workers, Hono, Bun, Deno, the Fetch API.
 */
export function toWebResponse(built: Built402Response): Response {
  return new Response(built.body, {
    status: built.status,
    headers: built.headers,
  });
}
