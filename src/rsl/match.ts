/**
 * Match an incoming User-Agent to the right `RslAgentGroup`, applying
 * the standard robots.txt precedence rules:
 *
 *   1. Most specific UA match wins. `GPTBot` beats `*`.
 *   2. Case-insensitive substring match per robots.txt convention.
 *   3. If no group matches, return the catch-all group with `*`, or null.
 *
 * Once a group is matched, `matchPath()` determines whether a given
 * path is allowed under that group's Allow/Disallow rules (longest-
 * match wins, Allow ties beat Disallow).
 */

import type { RslAgentGroup, RslPolicy } from "./types.js";

export function matchAgent(
  policy: RslPolicy,
  userAgent: string,
): RslAgentGroup | null {
  const lc = userAgent.toLowerCase();
  let best: { group: RslAgentGroup; specificity: number } | null = null;
  let catchAll: RslAgentGroup | null = null;

  for (const group of policy.groups) {
    for (const ua of group.userAgents) {
      if (ua === "*") {
        catchAll ??= group;
        continue;
      }
      if (lc.includes(ua)) {
        const specificity = ua.length;
        if (!best || specificity > best.specificity) {
          best = { group, specificity };
        }
      }
    }
  }

  return best?.group ?? catchAll;
}

export interface PathDecision {
  /** Does the policy permit the agent to crawl this path? */
  allowed: boolean;
  /** Which rule matched (allow / disallow / default). */
  matched: "allow" | "disallow" | "default";
  /** The matched rule pattern, if any. */
  pattern?: string;
}

/**
 * Apply Allow/Disallow precedence to a path under a matched agent group.
 * `allowDefault` (default true) is returned when no rule matches.
 */
export function matchPath(
  group: RslAgentGroup,
  path: string,
  allowDefault = true,
): PathDecision {
  let bestAllow: string | null = null;
  let bestDisallow: string | null = null;

  for (const a of group.allow ?? []) {
    if (path.startsWith(a) && (bestAllow === null || a.length > bestAllow.length)) {
      bestAllow = a;
    }
  }
  for (const d of group.disallow ?? []) {
    if (path.startsWith(d) && (bestDisallow === null || d.length > bestDisallow.length)) {
      bestDisallow = d;
    }
  }

  // Allow ties beat Disallow per the robots.txt 2022 RFC clarification.
  if (bestAllow !== null && (bestDisallow === null || bestAllow.length >= bestDisallow.length)) {
    return { allowed: true, matched: "allow", pattern: bestAllow };
  }
  if (bestDisallow !== null) {
    return { allowed: false, matched: "disallow", pattern: bestDisallow };
  }
  return { allowed: allowDefault, matched: "default" };
}
