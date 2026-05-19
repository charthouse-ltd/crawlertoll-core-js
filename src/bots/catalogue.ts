/**
 * Curated catalogue of AI crawler User-Agents observed in the wild.
 *
 * Two motivations:
 *   1. Cheap, robust first-gate detection for application-layer middleware
 *      that doesn't (yet) have access to edge-level signals.
 *   2. A vendor-neutral source of truth that the WordPress plugin, the
 *      data-insights dashboard, and downstream adapters all share.
 *
 * Each entry carries the operator name, a category (training / inference /
 * search / agent / scraper), the matcher (substring against the lowercased
 * User-Agent), and the operator's public-policy URL.
 *
 * Authoritative sources for the entries:
 *   - OpenAI:  https://platform.openai.com/docs/bots
 *   - Anthropic: https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web
 *   - Google:  https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers
 *   - Apple:   https://support.apple.com/en-us/119829
 *   - Perplexity: https://docs.perplexity.ai/guides/bots
 *   - Common Crawl: https://commoncrawl.org/big-picture/frequently-asked-questions
 *   - Meta:    https://developers.facebook.com/docs/sharing/webmasters/web-crawlers
 *   - ByteDance / Bytespider: https://bytespider.org/
 *   - You.com / YouBot: https://about.you.com/
 *   - DuckAssist / DuckDuckBot: https://duckduckgo.com/duckduckgo-help-pages/results/duckduckbot/
 *   - Mistral / MistralAI-User: https://docs.mistral.ai/
 *
 * Updated 2026-05-19. Maintain via PRs against this file; a published
 * snapshot ships in every release of @crawlertoll/core.
 */

export type BotCategory =
  | "training" /** Bulk-corpus harvesting for model training. */
  | "inference" /** Live agent retrieval for end-user prompts. */
  | "search" /** Search-index style crawls. */
  | "agent" /** Autonomous task-completion agents. */
  | "scraper" /** General-purpose scraping infrastructure. */;

export interface BotEntry {
  /** Operator-facing display name. */
  name: string;
  /** Operator company. */
  operator: string;
  /** Substring matched (lowercased) against the request User-Agent. */
  uaMatch: string;
  /** Optional structured-fields token that appears in `signature-agent`. */
  signatureAgent?: string;
  category: BotCategory;
  /** Operator's bot-policy page. */
  policyUrl?: string;
  /** Operator declares Web Bot Auth signing on at least one product (heuristic). */
  signsRequests?: boolean;
}

export const BOT_CATALOGUE: readonly BotEntry[] = Object.freeze([
  // ─── OpenAI ─────────────────────────────────────────────────────
  {
    name: "GPTBot",
    operator: "OpenAI",
    uaMatch: "gptbot",
    category: "training",
    policyUrl: "https://platform.openai.com/docs/bots",
  },
  {
    name: "ChatGPT-User",
    operator: "OpenAI",
    uaMatch: "chatgpt-user",
    category: "inference",
    policyUrl: "https://platform.openai.com/docs/bots",
    signsRequests: true,
  },
  {
    name: "OAI-SearchBot",
    operator: "OpenAI",
    uaMatch: "oai-searchbot",
    category: "search",
    policyUrl: "https://platform.openai.com/docs/bots",
  },
  {
    name: "ChatGPT-User Operator",
    operator: "OpenAI",
    uaMatch: "chatgpt operator",
    signatureAgent: "https://chatgpt.com/operator",
    category: "agent",
    policyUrl: "https://platform.openai.com/docs/bots",
    signsRequests: true,
  },

  // ─── Anthropic ──────────────────────────────────────────────────
  {
    name: "ClaudeBot",
    operator: "Anthropic",
    uaMatch: "claudebot",
    category: "training",
    policyUrl:
      "https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web",
  },
  {
    name: "Claude-User",
    operator: "Anthropic",
    uaMatch: "claude-user",
    category: "inference",
    policyUrl:
      "https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web",
  },
  {
    name: "Claude-SearchBot",
    operator: "Anthropic",
    uaMatch: "claude-searchbot",
    category: "search",
    policyUrl:
      "https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web",
  },

  // ─── Google ─────────────────────────────────────────────────────
  {
    name: "Google-Extended",
    operator: "Google",
    uaMatch: "google-extended",
    category: "training",
    policyUrl:
      "https://developers.google.com/search/docs/crawling-indexing/google-special-case-crawlers",
  },
  {
    name: "GoogleOther",
    operator: "Google",
    uaMatch: "googleother",
    category: "search",
    policyUrl:
      "https://developers.google.com/search/docs/crawling-indexing/google-special-case-crawlers",
  },
  {
    name: "Googlebot",
    operator: "Google",
    uaMatch: "googlebot",
    category: "search",
    policyUrl: "https://developers.google.com/search/docs/crawling-indexing/googlebot",
    signsRequests: true,
  },

  // ─── Perplexity ─────────────────────────────────────────────────
  {
    name: "PerplexityBot",
    operator: "Perplexity",
    uaMatch: "perplexitybot",
    category: "search",
    policyUrl: "https://docs.perplexity.ai/guides/bots",
  },
  {
    name: "Perplexity-User",
    operator: "Perplexity",
    uaMatch: "perplexity-user",
    category: "inference",
    policyUrl: "https://docs.perplexity.ai/guides/bots",
  },

  // ─── Apple ──────────────────────────────────────────────────────
  {
    name: "Applebot-Extended",
    operator: "Apple",
    uaMatch: "applebot-extended",
    category: "training",
    policyUrl: "https://support.apple.com/en-us/119829",
  },
  {
    name: "Applebot",
    operator: "Apple",
    uaMatch: "applebot",
    category: "search",
    policyUrl: "https://support.apple.com/en-us/119829",
  },

  // ─── Meta ───────────────────────────────────────────────────────
  {
    name: "Meta-ExternalAgent",
    operator: "Meta",
    uaMatch: "meta-externalagent",
    category: "training",
    policyUrl:
      "https://developers.facebook.com/docs/sharing/webmasters/web-crawlers",
  },
  {
    name: "facebookexternalhit",
    operator: "Meta",
    uaMatch: "facebookexternalhit",
    category: "scraper",
    policyUrl:
      "https://developers.facebook.com/docs/sharing/webmasters/web-crawlers",
  },

  // ─── ByteDance ──────────────────────────────────────────────────
  {
    name: "Bytespider",
    operator: "ByteDance",
    uaMatch: "bytespider",
    category: "training",
  },

  // ─── Common Crawl (training data feedstock) ─────────────────────
  {
    name: "CCBot",
    operator: "Common Crawl",
    uaMatch: "ccbot",
    category: "training",
    policyUrl: "https://commoncrawl.org/big-picture/frequently-asked-questions",
  },

  // ─── Cohere ─────────────────────────────────────────────────────
  {
    name: "cohere-ai",
    operator: "Cohere",
    uaMatch: "cohere-ai",
    category: "training",
  },

  // ─── Mistral ────────────────────────────────────────────────────
  {
    name: "MistralAI-User",
    operator: "Mistral",
    uaMatch: "mistralai-user",
    category: "inference",
  },

  // ─── You.com ────────────────────────────────────────────────────
  {
    name: "YouBot",
    operator: "You.com",
    uaMatch: "youbot",
    category: "search",
  },

  // ─── Diffbot ────────────────────────────────────────────────────
  {
    name: "Diffbot",
    operator: "Diffbot",
    uaMatch: "diffbot",
    category: "scraper",
  },

  // ─── Bright Data / scrapers (heuristic) ─────────────────────────
  {
    name: "BrightBot",
    operator: "Bright Data",
    uaMatch: "brightbot",
    category: "scraper",
  },

  // ─── Generic AI scrapers ────────────────────────────────────────
  {
    name: "anthropic-ai",
    operator: "Unknown (Anthropic legacy)",
    uaMatch: "anthropic-ai",
    category: "training",
  },
  {
    name: "Omgili / Omgilibot",
    operator: "Webz.io",
    uaMatch: "omgili",
    category: "scraper",
  },
  {
    name: "ImagesiftBot",
    operator: "ImageSift",
    uaMatch: "imagesiftbot",
    category: "training",
  },
  {
    name: "Timpibot",
    operator: "Timpi",
    uaMatch: "timpibot",
    category: "training",
  },
  {
    name: "PetalBot",
    operator: "Huawei",
    uaMatch: "petalbot",
    category: "search",
  },
  {
    name: "YandexBot (AI variant)",
    operator: "Yandex",
    uaMatch: "yandexbot",
    category: "search",
  },
  {
    name: "DuckAssistBot",
    operator: "DuckDuckGo",
    uaMatch: "duckassistbot",
    category: "inference",
  },
] satisfies readonly BotEntry[]);

/**
 * Match a User-Agent against the catalogue. Returns the first matching
 * entry or `null`. Matching is a case-insensitive substring test on
 * `uaMatch` — robust against the version-suffix variations real
 * crawlers ship.
 */
export function matchUserAgent(userAgent: string): BotEntry | null {
  if (!userAgent) return null;
  const lc = userAgent.toLowerCase();
  for (const entry of BOT_CATALOGUE) {
    if (lc.includes(entry.uaMatch)) return entry;
  }
  return null;
}
