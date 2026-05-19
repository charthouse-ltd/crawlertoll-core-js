/**
 * RSL 1.0 robots.txt parser / serializer / matcher tests.
 */

import { describe, expect, it } from "vitest";

import {
  matchAgent,
  matchPath,
  parseRobotsTxt,
  serializeRobotsTxt,
} from "../src/rsl.js";

const SAMPLE = `# Example RSL 1.0 robots.txt
User-agent: GPTBot
User-agent: ClaudeBot
Disallow: /
License: https://example.com/ai-license
Permits: ai-search, ai-inference, rag
Prohibits: ai-training, rebadging
Compensation: per-crawl 5000 micros USD https://example.com/pay
Standard: RSL/1.0

User-agent: *
Disallow:

Sitemap: https://example.com/sitemap.xml
`;

describe("parseRobotsTxt", () => {
  it("parses agent groups", () => {
    const { policy, warnings } = parseRobotsTxt(SAMPLE);
    expect(warnings).toEqual([]);
    expect(policy.groups).toHaveLength(2);
    const first = policy.groups[0]!;
    expect(first.userAgents).toEqual(["gptbot", "claudebot"]);
    expect(first.disallow).toEqual(["/"]);
  });

  it("parses RSL extensions on a group", () => {
    const { policy } = parseRobotsTxt(SAMPLE);
    const first = policy.groups[0]!;
    expect(first.license).toBe("https://example.com/ai-license");
    expect(first.permits).toEqual(["ai-search", "ai-inference", "rag"]);
    expect(first.prohibits).toEqual(["ai-training", "rebadging"]);
    expect(first.compensation).toEqual([
      {
        model: "per-crawl",
        priceMicros: 5000,
        currency: "USD",
        url: "https://example.com/pay",
      },
    ]);
    expect(first.standards).toEqual(["RSL/1.0"]);
  });

  it("parses sitemaps", () => {
    const { policy } = parseRobotsTxt(SAMPLE);
    expect(policy.sitemaps).toEqual(["https://example.com/sitemap.xml"]);
  });

  it("tolerates comments and CRLF", () => {
    const crlf = SAMPLE.replace(/\n/g, "\r\n");
    const { policy } = parseRobotsTxt(crlf);
    expect(policy.groups).toHaveLength(2);
  });

  it("warns on unknown compensation token without dropping the group", () => {
    const { policy, warnings } = parseRobotsTxt(
      "User-agent: GPTBot\nCompensation: per-grok 1 USD\n",
    );
    expect(policy.groups).toHaveLength(1);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/unknown compensation model/);
  });

  it("preserves unknown directives under unknown[]", () => {
    const { policy } = parseRobotsTxt(
      "User-agent: GPTBot\nMystery: yes\n",
    );
    expect(policy.groups[0]!.unknown).toEqual([{ name: "mystery", value: "yes" }]);
  });
});

describe("serializeRobotsTxt", () => {
  it("round-trips a parsed policy without loss of meaningful directives", () => {
    const { policy } = parseRobotsTxt(SAMPLE);
    const out = serializeRobotsTxt(policy);
    const reparsed = parseRobotsTxt(out).policy;
    expect(reparsed.groups[0]).toEqual(policy.groups[0]);
    expect(reparsed.sitemaps).toEqual(policy.sitemaps);
  });

  it("formats compensation lines with the canonical shape", () => {
    const out = serializeRobotsTxt({
      groups: [
        {
          userAgents: ["gptbot"],
          disallow: ["/"],
          compensation: [
            { model: "per-crawl", priceMicros: 5000, currency: "USD" },
          ],
        },
      ],
    });
    expect(out).toContain("Compensation: per-crawl 5000 micros USD");
  });
});

describe("matchAgent + matchPath", () => {
  it("matches the most specific UA group", () => {
    const { policy } = parseRobotsTxt(SAMPLE);
    const group = matchAgent(policy, "GPTBot/1.2");
    expect(group?.userAgents).toContain("gptbot");
  });

  it("falls back to catch-all", () => {
    const { policy } = parseRobotsTxt(SAMPLE);
    const group = matchAgent(policy, "RandomBrowser/1.0");
    expect(group?.userAgents).toEqual(["*"]);
  });

  it("Allow ties beat Disallow (RFC 9309)", () => {
    const group = {
      userAgents: ["gptbot"],
      allow: ["/articles"],
      disallow: ["/articles"],
    };
    const d = matchPath(group, "/articles/123");
    expect(d.allowed).toBe(true);
    expect(d.matched).toBe("allow");
  });

  it("longest match wins", () => {
    const group = {
      userAgents: ["gptbot"],
      allow: ["/"],
      disallow: ["/private"],
    };
    const inPrivate = matchPath(group, "/private/x");
    expect(inPrivate.allowed).toBe(false);
    const inPublic = matchPath(group, "/public");
    expect(inPublic.allowed).toBe(true);
  });
});
