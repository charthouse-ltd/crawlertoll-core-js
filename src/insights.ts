/**
 * @crawlertoll/core/insights — opt-in anonymised telemetry to a
 * collector endpoint.
 *
 *   import crawlertoll from "@crawlertoll/express";
 *   import { setupInsights } from "@crawlertoll/core/insights";
 *
 *   app.use(crawlertoll({
 *     offer: { rail: "x402", priceMicros: 5000, currency: "USD" },
 *     policy,
 *     onDecision: setupInsights({
 *       installId: process.env.CRAWLERTOLL_INSTALL_ID!,
 *     }),
 *   }));
 *
 * Posts six anonymised fields per decision: operator, bot_name,
 * action, category, verified, and an opaque install_id UUID. No
 * URLs, no headers, no IPs, no payloads. The collector (an opt-in
 * Cloudflare Worker — see github.com/nhrzxxw9dn-web/crawlertoll-insights)
 * enforces an allow-list on the server side and suppresses small-N
 * buckets (k<5) before any data reaches the dashboard, so even
 * adversarial inference is structurally hard.
 *
 * The default endpoint is `https://insights.crawlertoll.com/v1/ingest`.
 * Self-hosting the collector and pointing at your own URL is supported.
 *
 * Privacy posture is opt-in: this module does NOTHING until a
 * publisher explicitly calls `setupInsights()` and wires the returned
 * callback into their adapter. The adapters never call it by default.
 */

import type { Decision } from "./decide.js";

const DEFAULT_ENDPOINT = "https://insights.crawlertoll.com/v1/ingest";

export interface SetupInsightsOptions {
  /**
   * Stable install identifier. UUID strongly recommended; you can
   * generate one once via `node -e "console.log(crypto.randomUUID())"`
   * and pin it in an env var. If you leave this blank, a per-process
   * UUID is generated and a warning is logged once — fine for
   * development, NOT what you want in production where you'd like
   * the install identity to persist across deploys.
   */
  installId?: string;
  /** Collector ingest URL. Default: `https://insights.crawlertoll.com/v1/ingest`. */
  endpoint?: string;
  /**
   * Sample rate in `[0, 1]`. Default `1.0` (every decision is sent).
   * Drop to e.g. `0.1` on high-traffic origins where 100 % is wasteful.
   */
  sampleRate?: number;
  /** Custom fetch implementation. Default: `globalThis.fetch`. */
  fetchImpl?: typeof fetch;
  /**
   * Called when a fire-and-forget POST fails. Default: silent.
   * Telemetry failures MUST NOT break the request being processed,
   * so this callback is the only way to surface the error.
   */
  onError?: (err: unknown) => void;
}

/**
 * The wire shape that hits the collector. Six anonymised fields plus
 * an opaque install identifier. The collector's allow-list rejects
 * anything else, so adding fields here without coordinating with the
 * server is a no-op.
 */
export interface InsightsPayload {
  install_id: string;
  operator: string;
  bot_name: string;
  action: Decision["action"];
  category: string;
  verified: "true" | "false";
}

/**
 * Build an `onDecision` callback that posts an anonymised payload to
 * the insights collector. The returned function is fire-and-forget;
 * it always returns immediately, never throws into the request, and
 * never blocks. Failures route to `onError` if provided.
 */
export function setupInsights(
  options: SetupInsightsOptions = {},
): (decision: Decision) => void {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const sampleRate = clampSampleRate(options.sampleRate ?? 1.0);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const onError = options.onError ?? (() => undefined);

  const installId = options.installId ?? newProcessInstallId();

  return function emit(decision: Decision): void {
    // 1. Drop early if sampling says skip.
    if (sampleRate < 1 && Math.random() > sampleRate) return;

    // 2. Build the payload. All six fields are guaranteed to be
    //    strings (empty string for missing data) — the collector
    //    rejects anything else.
    const payload: InsightsPayload = {
      install_id: installId,
      operator: decision.bot.entry?.operator ?? "",
      bot_name: decision.bot.entry?.name ?? "",
      action: decision.action,
      category: decision.bot.entry?.category ?? "",
      verified: decision.authVerified?.valid ? "true" : "false",
    };

    // 3. Fire and forget. Failures route to onError, not the caller.
    if (!fetchImpl) {
      onError(new Error("no fetch implementation available"));
      return;
    }
    try {
      const promise = fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      // Some platforms return a Promise, some don't (custom fetch
      // impls in tests). Chain only if it's a Promise.
      if (promise && typeof (promise as Promise<unknown>).catch === "function") {
        (promise as Promise<unknown>).catch(onError);
      }
    } catch (err) {
      // Synchronous throws (e.g. constructing the request failed)
      // also route to onError.
      onError(err);
    }
  };
}

/* ─── Internal helpers ─────────────────────────────────────────── */

function clampSampleRate(rate: number): number {
  if (Number.isNaN(rate) || !Number.isFinite(rate)) return 1;
  if (rate < 0) return 0;
  if (rate > 1) return 1;
  return rate;
}

let warned = false;

function newProcessInstallId(): string {
  if (!warned && typeof console !== "undefined" && console.warn) {
    console.warn(
      "[@crawlertoll/core] setupInsights: no installId provided; generating per-process UUID. Set `installId` explicitly for production so the identity persists across restarts.",
    );
    warned = true;
  }
  // randomUUID is available in Node 19+, all modern browsers, Bun,
  // Deno, and Cloudflare Workers. Same runtime contract as the rest
  // of @crawlertoll/core.
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Fallback for environments without crypto.randomUUID — best effort
  // only; non-cryptographic. If you hit this branch, set installId
  // explicitly.
  return (
    "ct-fallback-" +
    Math.random().toString(36).slice(2, 10) +
    "-" +
    Date.now().toString(36)
  );
}
