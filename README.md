# @crawlertoll/core

Open-source, framework-agnostic Node middleware for the AI-crawler economy. Detect AI crawlers, verify their cryptographic identity, apply licensing policy, and issue HTTP 402 with a structured payment offer — all in vendor-neutral code you can audit.

- **License**: Apache-2.0
- **Node**: 20+ (Bun, Deno, Cloudflare Workers also supported)
- **Companion adapters**: [`@crawlertoll/express`](https://www.npmjs.com/package/@crawlertoll/express), Fastify (soon), Hono (soon), Next.js (soon)
- **Sister packages**: [`@crawlertoll/parser`](https://www.npmjs.com/package/@crawlertoll/parser), [`@crawlertoll/client`](https://www.npmjs.com/package/@crawlertoll/client), [`@crawlertoll/publisher`](https://www.npmjs.com/package/@crawlertoll/publisher)

[![npm](https://img.shields.io/npm/v/%40crawlertoll%2Fcore.svg)](https://www.npmjs.com/package/@crawlertoll/core)
[![license](https://img.shields.io/npm/l/%40crawlertoll%2Fcore.svg)](./LICENSE)

---

## What it does

Implements the four standards that consolidated around AI-crawler monetization in 2025–2026, in one neutral OSS library:

| Standard | What | Status |
|---|---|---|
| **HTTP 402** | Payment Required response shape | Cloudflare ships >1B per day as of Q1 2026 |
| **Web Bot Auth** | Ed25519 / RFC 9421 HTTP Message Signatures over `/.well-known/http-message-signatures-directory` JWKS | IETF draft-meunier-web-bot-auth-architecture-05 (Mar 2026); Cloudflare, AWS WAF, OpenAI, Google all implement |
| **RSL 1.0** | Really Simple Licensing — robots.txt vocabulary for AI-licensing terms | RSL Technical Steering Committee, 2025-12-10 — Reddit + Yahoo + People Inc. + Medium + Quora + O'Reilly + Cloudflare |
| **x402** | Coinbase + Linux Foundation agent-payment rail | x402 Foundation (LF) Apr 2026; AWS + Anthropic + Cloudflare + Google + Microsoft + Stripe + Visa + Mastercard |

CrawlerToll does **not** try to be a marketplace, a payment processor, or a metadata-vocabulary author. It is the vendor-neutral implementation that sits underneath — and ships adapters TO Cloudflare Pay Per Crawl, TollBit, Skyfire, x402, and Stripe ACP.

---

## Sixty seconds

```bash
npm install @crawlertoll/core @crawlertoll/express express
```

```ts
import express from "express";
import { crawlertoll } from "@crawlertoll/express";

const app = express();

app.use(crawlertoll({
  offer: { rail: "x402", priceMicros: 5000, currency: "USD" },
  contextLicenseUrl: "https://example.com/.well-known/context-license.json",
  termsUrl: "https://example.com/ai-terms",
}));

app.get("/", (req, res) => res.send("hello"));

app.listen(3000);
```

That's it. Any AI crawler hitting your endpoints gets a 402 with the Cloudflare-shape `Crawler-Price: 5000 micros USD` header and a JSON payment offer. Browsers and humans pass through untouched.

---

## Programmatic API (framework-agnostic)

`@crawlertoll/core` is intentionally portable across frameworks. The four sub-modules can be used independently.

### Decide

```ts
import { decide } from "@crawlertoll/core";

const result = await decide({
  request: {
    method: req.method,
    authority: req.headers.host!,
    targetUri: req.url,
    headers: normaliseHeaders(req.headers),
    path: new URL(req.url, "http://x").pathname,
  },
  policy: parsedRslPolicy,
  offer: { rail: "x402", priceMicros: 5000, currency: "USD" },
});

if (result.action === "allow") return next();
if (result.action === "402")   return applyTo(res, result.built!);
if (result.action === "block") return res.status(403).end();
```

### Bot detection

```ts
import { detectBot, BOT_CATALOGUE } from "@crawlertoll/core/bots";

const verdict = detectBot({ headers: req.headers });
if (verdict.isBot) {
  console.log(verdict.entry?.operator, verdict.entry?.category);
}
```

30+ operators in the catalogue (OpenAI, Anthropic, Google, Apple, Perplexity, Meta, ByteDance, Common Crawl, Cohere, Mistral, You.com, Diffbot, Bright Data, etc.). PRs welcome at `src/bots/catalogue.ts`.

### Web Bot Auth

```ts
import { verifyWebBotAuth } from "@crawlertoll/core/wba";

const result = await verifyWebBotAuth({
  method: "GET",
  authority: "example.com",
  targetUri: "/articles/1",
  headers: {
    "signature-input": req.headers["signature-input"],
    "signature": req.headers["signature"],
    "signature-agent": req.headers["signature-agent"],
  },
});

if (result.valid) {
  console.log("verified bot", result.signatureAgent, "keyid", result.keyid);
} else {
  console.log("failed:", result.reason, result.detail);
}
```

Implements `draft-meunier-web-bot-auth-architecture-05`. JWKS fetched from `https://<authority>/.well-known/http-message-signatures-directory` and cached for an hour by default. Ed25519 only (the only algorithm Web Bot Auth allows).

#### Replay protection (`seenNonceCache`)

A Web Bot Auth signature is valid for its whole `created`…`expires` window. **By default the verifier performs no replay check** — a captured, still-valid signature can be replayed until it expires. To enforce single-use, wire a nonce store:

```ts
// Adapter owns the storage (Redis, Workers KV, an LRU…). The hook is an
// atomic check-and-record that returns true if the nonce was already seen.
const result = await verifyWebBotAuth(input, {
  seenNonceCache: async (nonce, { keyid }) => {
    const firstUse = await redis.set(`wba:${keyid}:${nonce}`, "1", { NX: true, EX: 600 });
    return firstUse === null; // already present → replay
  },
});
// result.reason === "replay" when a nonce is reused.
```

The hook only fires when the signer included a `nonce` parameter. CrawlerToll ships no storage — replay state is per-deployment. If the hook throws, the verifier **fails closed** (`reason: "replay"`); callers who prefer fail-open should catch inside the hook and return `false`.

#### Key rotation (`jwksTtlMs`)

JWKS responses are cached per directory URL for one hour by default. If bot operators rotate keys frequently, lower the TTL so a rotated-in key isn't rejected (or a rotated-out key honoured) for up to an hour:

```ts
await verifyWebBotAuth(input, { jwksTtlMs: 5 * 60_000 }); // 5-minute cache
```

`clearJwksCache(url?)` flushes the cache immediately (useful in tests and on a known rotation).

#### JWKS fetch failures

If a bot's directory is unreachable, returns a non-2xx, is malformed, or exceeds `maxJwksBytes`, the verifier **fails closed**: it returns `reason: "key-not-found"` and the request is treated as unverified. That is the safe default, but it means a transient outage of a bot operator's directory can cause otherwise-legitimate signed traffic to be rejected (and, if your policy blocks unverified bots, blocked).

To stay available during a transient directory outage, wrap `fetchImpl` to serve a last-known-good JWKS (stale-while-error):

```ts
let lastGood: Response | null = null;
const resilientFetch: typeof fetch = async (url, init) => {
  try {
    const res = await fetch(url, init);
    if (res.ok) { lastGood = res.clone(); return res; }
    if (lastGood) return lastGood.clone();   // serve stale on non-2xx
    return res;
  } catch (err) {
    if (lastGood) return lastGood.clone();    // serve stale on network error
    throw err;
  }
};
await verifyWebBotAuth(input, { fetchImpl: resilientFetch });
```

Alternatively, pre-warm and pin the JWKS for high-volume operators out of band. Treat "JWKS unreachable" as an operational signal, not just a per-request failure.

### HTTP 402

```ts
import { build402, applyTo, toWebResponse } from "@crawlertoll/core/http402";

const built = build402({
  offer: {
    rail: "x402",
    priceMicros: 5000,
    currency: "USD",
    paymentUrl: "https://pay.example.com/abc",
    publisher: "example",
    endpoint: "search",
  },
  contextLicenseUrl: "https://example.com/.well-known/context-license.json",
  termsUrl: "https://example.com/ai-terms",
});

applyTo(res, built);          // Node: Express, Fastify, http
return toWebResponse(built);  // Fetch: Cloudflare Workers, Hono, Bun, Deno
```

On the wire:

```
HTTP/1.1 402 Payment Required
Content-Type: application/json; charset=utf-8
Crawler-Price: 5000 micros USD
Crawler-Price-Rail: x402
Retry-After: 60
Link: <https://pay.example.com/abc>; rel="payment"; type="x402",
      <https://example.com/.well-known/context-license.json>; rel="describedby"; type="application/json",
      <https://example.com/ai-terms>; rel="terms-of-service"

{
  "error": "payment_required",
  "message": "Payment required.",
  "offer": {
    "rail": "x402",
    "priceMicros": 5000,
    "currency": "USD",
    "paymentUrl": "https://pay.example.com/abc",
    "publisher": "example",
    "endpoint": "search"
  }
}
```

Settlement rails currently supported (the value of `offer.rail`):

- `x402` — Coinbase + LF x402 stablecoin rail
- `tollbit` — TollBit hosted paywall
- `skyfire` — Skyfire KYAPay token
- `cloudflare-ppc` — Cloudflare Pay Per Crawl
- `stripe-acp` — Stripe Agentic Commerce Protocol
- `context-license` — Per the `/.well-known/context-license.json` offer
- `custom` — Bring your own

### RSL 1.0

```ts
import {
  parseRobotsTxt,
  serializeRobotsTxt,
  matchAgent,
  matchPath,
} from "@crawlertoll/core/rsl";

const robotsTxt = `
User-agent: GPTBot
Disallow: /
License: https://example.com/ai-license
Permits: ai-search, rag
Prohibits: ai-training, redistribution-without-attribution
Compensation: per-crawl 5000 micros USD https://example.com/pay
Standard: RSL/1.0
`;

const { policy, warnings } = parseRobotsTxt(robotsTxt);
const group = matchAgent(policy, "GPTBot/1.2");
const verdict = matchPath(group!, "/articles/1");
// → { allowed: false, matched: "disallow", pattern: "/" }
```

First Node implementation of RSL 1.0 (published 2025-12-10 by the RSL Technical Steering Committee). The v0.1 surface covers the robots.txt deployment profile; the XML envelope ships in v0.2.

---

## Why CrawlerToll exists

The AI-crawler-monetization space crystallized in 2025–2026 around **standards, not products**. Cloudflare ships pay-per-crawl. TollBit aggregates 7,000+ publishers. Microsoft has PCM. Reddit + Yahoo + Cloudflare + O'Reilly co-published RSL 1.0. The IETF Web Bot Auth draft was adopted by Cloudflare, AWS WAF, OpenAI, and Google within months.

**Every commercial SDK on npm today is locked to a single backend.** `@tollbit/client`, `@skyfire-xyz/skyfire-seller-sdk-node`, `@knownagents/sdk` all force a choice.

CrawlerToll is the vendor-neutral implementation underneath all of that. You pick the backend; CrawlerToll handles the protocol. The 80% of websites *not* on Cloudflare Enterprise — Vercel/Netlify/Fly/Render origins, small Express/Hono apps, Next.js publishers, WordPress sites — finally have a portable, auditable software-only option that implements the same standards Cloudflare does at the edge.

---

## What's NOT in this package

- **No payment processing.** Settle via Cloudflare PPC, TollBit, Skyfire, x402, Stripe, or your own backend. Adapters are separate packages.
- **No licence-server SaaS.** OLP (RSL's licence server) reference implementation is published separately.
- **No marketplace.** That's `crawlertoll.com` — and even there, the spec is open and any marketplace can ingest CrawlerToll-licensed publishers.

---

## Conformance

Every release passes a 47-test vitest suite:

- 10 bot-detection tests (UA matching, signature-header presence, native `Headers` support)
- 10 Web Bot Auth tests (real Ed25519 sign↔verify roundtrip, JWKS lookup, expired/tampered/wrong-key rejection)
- 9 HTTP 402 builder tests (status, headers, Link rels, applyTo vs toWebResponse)
- 12 RSL 1.0 tests (parse, serialize, round-trip, match precedence)
- 6 decide() integration tests (allow / block / charge across all decision branches)

Run yourself:

```bash
git clone https://github.com/charthouse-ltd/crawlertoll-core-js
cd crawlertoll-core-js
npm install
npm test
```

---

## Roadmap

**v0.1 (this release)** — bot detection, Web Bot Auth verification, HTTP 402 issuance, RSL 1.0 robots.txt, Express adapter (separate package).

**v0.2 (Day 30)** — Fastify + Hono adapters, Next.js middleware example, Cloudflare Workers template, Vercel template, x402 settlement-rail adapter.

**v0.3 (Day 60)** — WordPress plugin (PHP), anonymised crawler-traffic telemetry (`crawlertoll.com/insights`), TollBit + Skyfire + Cloudflare PPC adapters.

**v0.4 (Day 90)** — RSL 1.0 XML envelope, OLP client, llms.txt generator.

---

## Project links

- **Manifesto**: [github.com/charthouse-ltd/crawlertoll/blob/main/MANIFESTO.md](https://github.com/charthouse-ltd/crawlertoll/blob/main/MANIFESTO.md)
- **Marketplace**: [crawlertoll.com](https://crawlertoll.com)
- **Specs implemented**:
  - HTTP 402 (Cloudflare crawler-price headers, x402 Foundation)
  - Web Bot Auth: [datatracker.ietf.org/doc/draft-meunier-web-bot-auth-architecture](https://datatracker.ietf.org/doc/draft-meunier-web-bot-auth-architecture/)
  - RSL 1.0: [rslstandard.org](https://rslstandard.org/)
  - x402: [x402.org](https://www.x402.org/)

## License

[Apache-2.0](./LICENSE). All specs implemented are open standards under their own licenses (RFC 9421, RSL 1.0, x402, IETF draft-meunier).

## Trademark

CrawlerToll™ is a trademark of Charthouse Ltd.
