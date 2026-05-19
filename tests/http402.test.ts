/**
 * HTTP 402 builder tests.
 */

import { describe, expect, it } from "vitest";

import {
  applyTo,
  build402,
  formatCrawlerPrice,
  microsToMajor,
  toWebResponse,
  type NodeResponseLike,
} from "../src/http402.js";

describe("build402", () => {
  it("returns 402 status and JSON body", () => {
    const built = build402({
      offer: { rail: "x402", priceMicros: 5000, currency: "USD" },
    });
    expect(built.status).toBe(402);
    expect(built.headers["content-type"]).toMatch(/application\/json/);
    expect(JSON.parse(built.body)).toMatchObject({
      error: "payment_required",
      offer: { rail: "x402", priceMicros: 5000, currency: "USD" },
    });
  });

  it("sets Crawler-Price header in Cloudflare format", () => {
    const built = build402({
      offer: { rail: "x402", priceMicros: 5000, currency: "USD" },
    });
    expect(built.headers["crawler-price"]).toBe("5000 micros USD");
    expect(built.headers["crawler-price-rail"]).toBe("x402");
  });

  it("emits Link headers for payment + describedby + terms", () => {
    const built = build402({
      offer: {
        rail: "tollbit",
        priceMicros: 10000,
        currency: "USD",
        paymentUrl: "https://pay.tollbit.com/abc",
      },
      contextLicenseUrl: "https://example.com/.well-known/context-license.json",
      termsUrl: "https://example.com/ai-terms",
    });
    expect(built.headers["link"]).toContain('rel="payment"');
    expect(built.headers["link"]).toContain('rel="describedby"');
    expect(built.headers["link"]).toContain('rel="terms-of-service"');
  });

  it("includes a Retry-After of 60 by default", () => {
    const built = build402({
      offer: { rail: "x402", priceMicros: 5000, currency: "USD" },
    });
    expect(built.headers["retry-after"]).toBe("60");
  });

  it("rejects negative priceMicros", () => {
    expect(() =>
      build402({ offer: { rail: "x402", priceMicros: -1, currency: "USD" } }),
    ).toThrow(/Invalid priceMicros/);
  });

  it("microsToMajor formats currency values", () => {
    expect(microsToMajor(5000)).toBe("0.005");
    expect(microsToMajor(1_000_000)).toBe("1");
    expect(microsToMajor(500)).toBe("0.0005");
  });

  it("formatCrawlerPrice rounds non-integer micros", () => {
    expect(formatCrawlerPrice({ rail: "x402", priceMicros: 5000.7, currency: "USD" })).toBe(
      "5001 micros USD",
    );
  });
});

describe("applyTo (Node response shape)", () => {
  it("sets statusCode, headers, and body", () => {
    const headers: Record<string, string> = {};
    let body: string | undefined;
    const res: NodeResponseLike = {
      statusCode: 200,
      setHeader(name, value) {
        headers[name] = value;
      },
      end(chunk) {
        body = chunk;
      },
    };
    const built = build402({
      offer: { rail: "x402", priceMicros: 5000, currency: "USD" },
    });
    applyTo(res, built);
    expect(res.statusCode).toBe(402);
    expect(headers["crawler-price"]).toBe("5000 micros USD");
    expect(body).toBe(built.body);
  });
});

describe("toWebResponse (Fetch / WHATWG Response)", () => {
  it("produces a Response with 402 status and same headers/body", async () => {
    const built = build402({
      offer: { rail: "x402", priceMicros: 5000, currency: "USD" },
    });
    const res = toWebResponse(built);
    expect(res.status).toBe(402);
    expect(res.headers.get("crawler-price")).toBe("5000 micros USD");
    const body = await res.text();
    expect(body).toBe(built.body);
  });
});
