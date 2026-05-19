/**
 * Serialise an `RslPolicy` back to robots.txt-flavoured RSL 1.0 text.
 *
 * Output is deterministic and reads cleanly. Round-trips through
 * `parseRobotsTxt()` without loss (unknown directives are preserved).
 */

import type { RslCompensation, RslPolicy } from "./types.js";

export function serializeRobotsTxt(policy: RslPolicy): string {
  const lines: string[] = [];

  for (const group of policy.groups) {
    for (const ua of group.userAgents) {
      lines.push(`User-agent: ${ua}`);
    }
    if (group.allow) {
      for (const a of group.allow) lines.push(`Allow: ${a}`);
    }
    if (group.disallow) {
      for (const d of group.disallow) lines.push(`Disallow: ${d}`);
    } else if (!group.allow) {
      // robots.txt convention: explicit Disallow: avoids ambiguity.
      lines.push(`Disallow:`);
    }
    if (typeof group.crawlDelay === "number") {
      lines.push(`Crawl-delay: ${group.crawlDelay}`);
    }
    if (group.license) {
      lines.push(`License: ${group.license}`);
    }
    if (group.permits && group.permits.length > 0) {
      lines.push(`Permits: ${group.permits.join(", ")}`);
    }
    if (group.prohibits && group.prohibits.length > 0) {
      lines.push(`Prohibits: ${group.prohibits.join(", ")}`);
    }
    if (group.compensation) {
      for (const c of group.compensation) {
        lines.push(`Compensation: ${serializeCompensation(c)}`);
      }
    }
    if (group.standards) {
      for (const s of group.standards) lines.push(`Standard: ${s}`);
    }
    if (group.unknown) {
      for (const u of group.unknown) lines.push(`${capitalise(u.name)}: ${u.value}`);
    }
    lines.push("");
  }

  if (policy.sitemaps) {
    for (const s of policy.sitemaps) lines.push(`Sitemap: ${s}`);
    lines.push("");
  }
  if (policy.unknown) {
    for (const u of policy.unknown) lines.push(`${capitalise(u.name)}: ${u.value}`);
  }

  // Trim trailing blank line for tidy output.
  while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n") + "\n";
}

function serializeCompensation(c: RslCompensation): string {
  if (c.model === "free" || c.model === "negotiate" || c.model === "subscription") {
    return c.url ? `${c.model} ${c.url}` : c.model;
  }
  const parts: string[] = [c.model];
  parts.push(String(c.priceMicros ?? 0));
  parts.push("micros");
  if (c.currency) parts.push(c.currency);
  if (c.url) parts.push(c.url);
  return parts.join(" ");
}

function capitalise(s: string): string {
  return s
    .split("-")
    .map((p) => (p.length ? p[0]!.toUpperCase() + p.slice(1) : p))
    .join("-");
}
