# Security Policy

CrawlerToll is open-source middleware that sits on the request path and makes allow / charge / block decisions for AI crawlers, including cryptographic verification of bot identity (Web Bot Auth). Security reports are taken seriously and handled with priority.

## Reporting a vulnerability

Email **chris@charthouse.io** with `SECURITY` in the subject line. Do **not** open a public GitHub issue for a suspected vulnerability.

If you need to send sensitive detail encrypted, send a first email without the detail and a PGP key will be provided in reply.

Please include, where you can:

- affected package(s) and version(s),
- a description of the issue,
- reproduction steps or a proof of concept,
- the impact you foresee.

## Our commitments (response SLA)

CrawlerToll is maintained by Charthouse Ltd (a small team). We commit to:

| Stage | Target |
|---|---|
| Acknowledge receipt | within **3 business days** |
| Initial assessment + severity rating | within **7 calendar days** |
| Fix or mitigation, Critical / High | target **14 days** from triage |
| Fix or mitigation, Medium / Low | target **30–60 days** from triage |
| Public disclosure | coordinated — by default within **90 days** of the report, or on patch release, whichever comes first |

If we cannot meet a target we will tell you and explain why, rather than going quiet.

## Scope

**In scope:** the published `@crawlertoll/*` npm packages and the template repositories in this organisation. The Web Bot Auth verifier (`@crawlertoll/core/wba`) — signature verification, JWKS handling, and replay protection — is the most security-sensitive surface and reports there are prioritised.

**Out of scope:** vulnerabilities in upstream dependencies (report those upstream; tell us so we can pin or patch), and issues in the third-party settlement backends CrawlerToll routes to (Cloudflare Pay Per Crawl, TollBit, Skyfire, x402 facilitators) — report those to the respective vendor.

## Disclosure principles

- We credit reporters who want credit, in the release notes and CHANGELOG.
- We will not pursue legal action against good-faith researchers who follow this policy and who avoid privacy violations, service degradation, and data destruction.
- There is no paid bug-bounty programme at this time.

## Known design defaults worth knowing before you report

These are documented, intentional defaults — not vulnerabilities — but worth understanding:

- **Web Bot Auth replay protection is opt-in.** With no `seenNonceCache` wired, a captured, still-valid signature is replayable within its `created`…`expires` window. See the `@crawlertoll/core` README → "Replay protection".
- **JWKS fetch failures fail closed** (`reason: "key-not-found"`). See the README → "JWKS fetch failures" for the stale-while-error pattern if you need availability during a directory outage.

— Charthouse Ltd (UK)
