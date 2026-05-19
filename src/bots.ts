/**
 * @crawlertoll/core/bots — bot detection sub-export.
 *
 *   import { detectBot, matchUserAgent, BOT_CATALOGUE } from "@crawlertoll/core/bots";
 */

export { detectBot, type BotDetection, type DetectInput } from "./bots/detect.js";
export {
  matchUserAgent,
  BOT_CATALOGUE,
  type BotEntry,
  type BotCategory,
} from "./bots/catalogue.js";
