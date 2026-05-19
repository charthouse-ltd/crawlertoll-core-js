/**
 * decide() orchestrator tests.
 */

import { describe, expect, it } from "vitest";

import { decide, parseRobotsTxt } from "../src/index.js";

describe("decide()", () => {
  it("allows non-bot requests", async () => {
    const d = await decide({
      request: {
        method: "GET",
        authority: "example.com",
        targetUri: "/",
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15",
        },
      },
    });
    expect(d.action).toBe("allow");
    expect(d.bot.isBot).toBe(false);
  });

  it("returns 402 for a known bot when an offer is configured", async () => {
    const d = await decide({
      request: {
        method: "GET",
        authority: "example.com",
        targetUri: "/articles",
        headers: { "user-agent": "GPTBot/1.2" },
      },
      offer: { rail: "x402", priceMicros: 5000, currency: "USD" },
    });
    expect(d.action).toBe("402");
    expect(d.built?.status).toBe(402);
    expect(d.bot.entry?.operator).toBe("OpenAI");
  });

  it("allows bots when no offer is configured (default-allow)", async () => {
    const d = await decide({
      request: {
        method: "GET",
        authority: "example.com",
        targetUri: "/",
        headers: { "user-agent": "ClaudeBot/2.0" },
      },
    });
    expect(d.action).toBe("allow");
    expect(d.reasons.join(",")).toContain("default-allow");
  });

  it("blocks a bot disallowed by RSL with no compensation", async () => {
    const { policy } = parseRobotsTxt(`
User-agent: GPTBot
Disallow: /
`);
    const d = await decide({
      request: {
        method: "GET",
        authority: "example.com",
        targetUri: "/articles",
        headers: { "user-agent": "GPTBot/1.2" },
      },
      policy,
    });
    expect(d.action).toBe("block");
    expect(d.reasons.join(",")).toContain("rsl-block");
  });

  it("charges a bot when RSL declares per-crawl compensation", async () => {
    const { policy } = parseRobotsTxt(`
User-agent: GPTBot
Disallow: /
Compensation: per-crawl 5000 micros USD https://example.com/pay
`);
    const d = await decide({
      request: {
        method: "GET",
        authority: "example.com",
        targetUri: "/articles",
        headers: { "user-agent": "GPTBot/1.2" },
      },
      policy,
      offer: { rail: "x402", priceMicros: 5000, currency: "USD" },
    });
    expect(d.action).toBe("402");
    expect(d.reasons.join(",")).toContain("rsl-charge");
  });

  it("allows bots into Allow-listed paths even under Disallow:/", async () => {
    const { policy } = parseRobotsTxt(`
User-agent: GPTBot
Disallow: /
Allow: /public
`);
    const d = await decide({
      request: {
        method: "GET",
        authority: "example.com",
        targetUri: "/public/x",
        headers: { "user-agent": "GPTBot/1.2" },
      },
      policy,
      offer: { rail: "x402", priceMicros: 5000, currency: "USD" },
    });
    expect(d.action).toBe("allow");
  });
});
