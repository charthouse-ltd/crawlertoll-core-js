/**
 * @crawlertoll/core/rsl — RSL 1.0 robots.txt parser, generator, matcher.
 *
 *   import { parseRobotsTxt, serializeRobotsTxt, matchAgent, matchPath } from "@crawlertoll/core/rsl";
 *
 * Tracks the RSL 1.0 spec published 2025-12-10 by the RSL Technical
 * Steering Committee (Reddit + Yahoo + People Inc. + Medium + Quora +
 * O'Reilly + Ziff Davis + Fastly + Stack Overflow + Cloudflare). The
 * v0.1 surface covers the robots.txt deployment profile. The XML
 * envelope ships in v0.2.
 */

export {
  parseRobotsTxt,
} from "./rsl/parse.js";

export {
  serializeRobotsTxt,
} from "./rsl/serialize.js";

export {
  matchAgent,
  matchPath,
  type PathDecision,
} from "./rsl/match.js";

export type {
  RslPolicy,
  RslAgentGroup,
  RslCompensation,
  RslCompensationModel,
  RslUse,
  RslPermittedUse,
  RslProhibitedUse,
  ParseResult,
} from "./rsl/types.js";
