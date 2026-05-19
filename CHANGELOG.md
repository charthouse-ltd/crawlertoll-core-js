# Changelog

All notable changes to `@crawlertoll/core` are documented here.

The package follows [Semantic Versioning](https://semver.org/). It implements published external standards (RFC 9421, RSL 1.0, IETF draft-meunier-web-bot-auth-architecture, x402); breaking changes to those specs propagate as new major versions here.

## [0.1.0] — 2026-05-19

Initial release.

### Added

- **`decide()`** — high-level orchestrator that runs bot detection, Web Bot Auth verification, RSL 1.0 policy matching, and HTTP 402 building in one call. Returns a structured `Decision`.
- **`@crawlertoll/core/bots`** — curated AI-crawler User-Agent catalogue (30+ operators including OpenAI, Anthropic, Google, Apple, Perplexity, Meta, ByteDance, Common Crawl, Cohere, Mistral). `detectBot()` synchronous detection.
- **`@crawlertoll/core/wba`** — Web Bot Auth verification per `draft-meunier-web-bot-auth-architecture-05`. RFC 9421 HTTP Message Signatures, Ed25519 only, JWKS lookup with RFC 7638 thumbprint matching, automatic JWKS caching with 1-hour TTL.
- **`@crawlertoll/core/http402`** — HTTP 402 response builder with Cloudflare's pay-per-crawl headers (`Crawler-Price`, `Crawler-Price-Rail`, `Link`, `Retry-After`) plus a structured JSON payment offer. Settlement-rail enum: `x402` / `tollbit` / `skyfire` / `cloudflare-ppc` / `stripe-acp` / `context-license` / `custom`. Both `applyTo(NodeResponse)` and `toWebResponse(): Response` shipping helpers.
- **`@crawlertoll/core/rsl`** — RSL 1.0 robots.txt parser, serializer, and matcher. Implements `License:`, `Permits:`, `Prohibits:`, `Compensation:`, `Standard:` directives plus the standard `Allow`/`Disallow`/`Crawl-delay`/`Sitemap`. RFC 9309 longest-match precedence with the 2022 Allow-ties-beat-Disallow clarification.
- Full TypeScript types via `dist/index.d.ts` and per-submodule `.d.ts` files.

### Conformance

- 47/47 vitest tests passing.
- Web Bot Auth: real Ed25519 sign↔verify roundtrip with RFC 7638 thumbprint resolution, expired-signature rejection, tampered-authority rejection, wrong-key rejection, unsupported-algorithm rejection.
- RSL 1.0: round-trip parse↔serialize without loss; longest-match path precedence; Allow-ties-beat-Disallow; sitemap preservation; unknown-directive preservation.
- HTTP 402: status + headers + structured body, native `Headers` interop.

### License + governance

- Implementation: Apache-2.0 (patent grant matters; the OSS middleware sits in a regulatory-active space).
- Specs implemented: all open. RFC 9421, IETF draft-meunier, RSL 1.0, x402 — none owned by CrawlerToll.
- Donation pathway: trademark stays with Charthouse Ltd; spec-implementation code is donated forward as cleanly as the underlying spec's governance permits.
