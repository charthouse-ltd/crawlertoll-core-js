/**
 * Bot detection tests — UA catalogue + Web Bot Auth header presence.
 */

import { describe, expect, it } from "vitest";

import { BOT_CATALOGUE, detectBot, matchUserAgent } from "../src/bots.js";

describe("matchUserAgent", () => {
  it("matches GPTBot with version suffix", () => {
    const m = matchUserAgent(
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
    );
    expect(m?.name).toBe("GPTBot");
    expect(m?.operator).toBe("OpenAI");
    expect(m?.category).toBe("training");
  });

  it("matches ClaudeBot", () => {
    const m = matchUserAgent("ClaudeBot");
    expect(m?.operator).toBe("Anthropic");
  });

  it("matches case-insensitively", () => {
    const m = matchUserAgent("perplexitybot/1.0");
    expect(m?.operator).toBe("Perplexity");
  });

  it("returns null for browser UAs", () => {
    expect(
      matchUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
      ),
    ).toBeNull();
  });

  it("catalogue covers all major operators", () => {
    const ops = new Set(BOT_CATALOGUE.map((b) => b.operator));
    expect(ops.has("OpenAI")).toBe(true);
    expect(ops.has("Anthropic")).toBe(true);
    expect(ops.has("Google")).toBe(true);
    expect(ops.has("Apple")).toBe(true);
    expect(ops.has("Perplexity")).toBe(true);
    expect(ops.has("Meta")).toBe(true);
    expect(ops.has("ByteDance")).toBe(true);
    expect(ops.has("Common Crawl")).toBe(true);
  });
});

describe("detectBot", () => {
  it("flags a known bot UA", () => {
    const d = detectBot({ headers: { "user-agent": "GPTBot/1.2" } });
    expect(d.isBot).toBe(true);
    expect(d.entry?.name).toBe("GPTBot");
    expect(d.hasSignatureHeaders).toBe(false);
    expect(d.reasons).toContain("ua-match:GPTBot");
  });

  it("flags a signed request even with unknown UA", () => {
    const d = detectBot({
      headers: {
        "user-agent": "MyCustomAgent/1.0",
        "signature-input":
          'sig1=("@authority");created=1716156000;keyid="abc";alg="ed25519";tag="web-bot-auth"',
        signature: "sig1=:Zm9v:",
      },
    });
    expect(d.isBot).toBe(true);
    expect(d.entry).toBeNull();
    expect(d.hasSignatureHeaders).toBe(true);
    expect(d.reasons).toContain("signature-headers-present");
  });

  it("returns isBot:false for browser-shape requests", () => {
    const d = detectBot({
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15",
      },
    });
    expect(d.isBot).toBe(false);
    expect(d.entry).toBeNull();
  });

  it("handles native Headers objects", () => {
    const h = new Headers();
    h.set("user-agent", "ClaudeBot/2.0");
    const d = detectBot({ headers: h });
    expect(d.isBot).toBe(true);
    expect(d.entry?.operator).toBe("Anthropic");
  });

  it("captures the signature-agent header when present", () => {
    const d = detectBot({
      headers: {
        "user-agent": "ChatGPT-User/1.0",
        "signature-agent": '"https://chatgpt.com/operator"',
      },
    });
    expect(d.isBot).toBe(true);
    expect(d.signatureAgent).toBe('"https://chatgpt.com/operator"');
  });
});
