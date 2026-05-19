/**
 * High-level decision orchestrator. The single entrypoint framework
 * adapters wrap.
 *
 *   const decision = await decide({
 *     request: { method, authority, targetUri, headers, path },
 *     policy: rslPolicy,
 *     offer:  paymentOffer,
 *     verifyAuth: true,
 *   });
 *
 *   if (decision.action === "allow") next();
 *   if (decision.action === "402") sendBuilt402(decision.built);
 *
 * The decision tree is intentionally explicit and inspectable. Adapters
 * never re-implement policy; they translate transport (Express ↔ Hono
 * ↔ Cloudflare Worker) into the `DecideInput` shape and read back the
 * `Decision`.
 */

import { detectBot, type BotDetection } from "./bots/detect.js";
import { build402 } from "./http402/build.js";
import type {
  Build402Options,
  Built402Response,
  PaymentOffer,
} from "./http402/types.js";
import { matchAgent, matchPath } from "./rsl/match.js";
import type { RslAgentGroup, RslPolicy } from "./rsl/types.js";
import { verifyWebBotAuth } from "./wba/verify.js";
import type { WbaVerifyResult } from "./wba/types.js";

export interface DecideRequest {
  method: string;
  authority: string;
  /** Path + optional query. */
  targetUri?: string;
  /** Lowercased header map. */
  headers: Record<string, string>;
  /** Plain path for RSL Allow/Disallow matching (defaults to targetUri without query). */
  path?: string;
}

export interface DecideInput {
  request: DecideRequest;
  /** RSL 1.0 policy. If omitted, the catch-all decision is "allow" for non-bots and "402" for bots without auth. */
  policy?: RslPolicy;
  /** Payment offer used when the decision is "402". Required only if 402 is reachable. */
  offer?: PaymentOffer;
  /** Customise the 402 response. Merged on top of `offer`. */
  buildOptions?: Omit<Build402Options, "offer">;
  /** Run Web Bot Auth verification when signature headers are present. Default true. */
  verifyAuth?: boolean;
  /** Treat verified bots as allowed regardless of RSL policy. Default false (RSL still applies). */
  trustVerifiedBots?: boolean;
}

export type DecisionAction = "allow" | "402" | "block";

export interface Decision {
  action: DecisionAction;
  /** Bot detection verdict. */
  bot: BotDetection;
  /** Web Bot Auth result, if verification ran. */
  authVerified?: WbaVerifyResult;
  /** Matched RSL agent group, if policy was given. */
  rslGroup?: RslAgentGroup;
  /** Reasoning trace for logs and dashboards. */
  reasons: readonly string[];
  /** Built 402 response, populated when action === "402". */
  built?: Built402Response;
}

/**
 * Run the decision tree.
 */
export async function decide(input: DecideInput): Promise<Decision> {
  const reasons: string[] = [];
  const bot = detectBot({ headers: input.request.headers });
  reasons.push(...bot.reasons);

  // ─── Non-bots flow through ─────────────────────────────────────
  if (!bot.isBot) {
    return {
      action: "allow",
      bot,
      reasons: Object.freeze([...reasons, "not-a-bot"]),
    };
  }

  // ─── Web Bot Auth verification ─────────────────────────────────
  let authVerified: WbaVerifyResult | undefined;
  if (input.verifyAuth !== false && bot.hasSignatureHeaders) {
    authVerified = await verifyWebBotAuth({
      method: input.request.method,
      authority: input.request.authority,
      targetUri: input.request.targetUri,
      headers: input.request.headers,
    });
    reasons.push(`wba:${authVerified.valid ? "valid" : authVerified.reason}`);
  }

  // ─── RSL policy matching ───────────────────────────────────────
  let rslGroup: RslAgentGroup | undefined;
  if (input.policy) {
    const match = matchAgent(input.policy, bot.userAgent);
    rslGroup = match ?? undefined;
    if (rslGroup) {
      reasons.push(`rsl-group:${rslGroup.userAgents.join(",")}`);
    }
  }

  // ─── Verified bot with explicit policy trust ───────────────────
  if (
    input.trustVerifiedBots &&
    authVerified?.valid &&
    rslGroup?.permits &&
    rslGroup.permits.length > 0
  ) {
    return {
      action: "allow",
      bot,
      authVerified,
      rslGroup,
      reasons: Object.freeze([...reasons, "trust-verified-bot"]),
    };
  }

  // ─── Path-level Allow/Disallow under RSL ───────────────────────
  if (rslGroup) {
    const path = input.request.path ?? stripQuery(input.request.targetUri ?? "/");
    const decision = matchPath(rslGroup, path);
    reasons.push(`rsl-path:${decision.matched}:${decision.allowed ? "allow" : "deny"}`);
    if (!decision.allowed) {
      // If the policy declares a compensation model, return 402.
      if (rslGroup.compensation && rslGroup.compensation.length > 0 && input.offer) {
        const built = build402({
          ...input.buildOptions,
          offer: input.offer,
        });
        return {
          action: "402",
          bot,
          authVerified,
          rslGroup,
          built,
          reasons: Object.freeze([...reasons, "rsl-charge"]),
        };
      }
      return {
        action: "block",
        bot,
        authVerified,
        rslGroup,
        reasons: Object.freeze([...reasons, "rsl-block"]),
      };
    }
    return {
      action: "allow",
      bot,
      authVerified,
      rslGroup,
      reasons: Object.freeze([...reasons, "rsl-allow"]),
    };
  }

  // ─── No RSL policy: default action is "402 if offer present, else allow" ─
  if (input.offer) {
    const built = build402({
      ...input.buildOptions,
      offer: input.offer,
    });
    return {
      action: "402",
      bot,
      authVerified,
      built,
      reasons: Object.freeze([...reasons, "default-charge"]),
    };
  }
  return {
    action: "allow",
    bot,
    authVerified,
    reasons: Object.freeze([...reasons, "default-allow"]),
  };
}

function stripQuery(target: string): string {
  const q = target.indexOf("?");
  return q < 0 ? target : target.slice(0, q);
}
