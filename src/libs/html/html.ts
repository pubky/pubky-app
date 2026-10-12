/**
 * HTML parsing utilities and patterns
 */

import { decodeHtmlEntities } from '@/libs/utils/utils';

/**
 * Regex patterns for extracting OpenGraph metadata from HTML
 */
export const OG_PATTERNS = {
  /**
   * Patterns for matching og:title meta tags
   * Handles both property and name attributes in various orders.
   * Global: `extractFromHtml` walks every occurrence with `matchAll`, which does not leak `lastIndex`.
   */
  TITLE: [
    /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/gi,
    /<meta\s+name=["']og:title["']\s+content=["']([^"']+)["']/gi,
    /<meta\s+content=["']([^"']+)["']\s+property=["']og:title["']/gi,
    /<meta\s+content=["']([^"']+)["']\s+name=["']og:title["']/gi,
  ],

  /**
   * Pattern for matching the HTML <title> tag.
   * Not global: a document has one title, and a later <title> is an SVG label in the body, not a
   * second candidate. Attributes are matched as unquoted text without `<` / `>` or as quoted values
   * (which browsers let contain either), so a body of unclosed `<title` tokens or quotes cannot
   * backtrack quadratically on the server.
   */
  TITLE_TAG: /<title(?:[^<>"']|"[^"]*"|'[^']*')*>([^<]+)<\/title>/i,

  /**
   * Patterns for matching og:image meta tags
   * Handles both property and name attributes in various orders.
   * Global: `extractFromHtml` walks every occurrence with `matchAll`, which does not leak `lastIndex`.
   */
  IMAGE: [
    /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/gi,
    /<meta\s+name=["']og:image["']\s+content=["']([^"']+)["']/gi,
    /<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/gi,
    /<meta\s+content=["']([^"']+)["']\s+name=["']og:image["']/gi,
  ],
} as const;

/**
 * Tag values some sites serve when they answer with a client-rendered shell instead of the real
 * page. YouTube Music returns the literal string "undefined" in every og tag it emits for such a
 * response (og:title, og:url, og:site_name, og:type), and a shell that hydrates later can emit the
 * placeholder tag before the real one.
 *
 * The match is exact: only JavaScript stringification of `undefined` / `null` produces these
 * literals, so a real value such as "Null" or "Undefined" is kept.
 */
const PLACEHOLDER_VALUES = new Set(['undefined', 'null']);

/**
 * Normalizes a raw capture into a usable value, or null when it carries none: blank after entity
 * decoding and trimming, or one of the placeholder literals.
 */
function pickUsableValue(capture: string): string | null {
  const normalized = decodeHtmlEntities(capture).trim();
  return normalized && !PLACEHOLDER_VALUES.has(normalized) ? normalized : null;
}

/**
 * Extracts the first usable value from HTML using an array of regex patterns.
 *
 * Patterns are tried in order. A global pattern is walked across every occurrence: a blank or
 * placeholder capture is skipped and scanning continues with the next occurrence, then the next
 * pattern, so a page that emits a placeholder og tag before the real one still yields the real
 * value. A non-global pattern is checked at its first match only, for an element that occurs once
 * per document such as `<title>`, where a later match is not a second candidate.
 *
 * @param html - The HTML content to search
 * @param patterns - Array of regex patterns to try; global ones are walked with `matchAll`
 * @returns The first captured group that is usable, entity-decoded and trimmed, or null if none
 *
 * @example
 * const title = extractFromHtml(html, OG_PATTERNS.TITLE);
 */
export function extractFromHtml(html: string, patterns: readonly RegExp[]): string | null {
  for (const pattern of patterns) {
    const matches: Iterable<RegExpMatchArray | null> = pattern.global ? html.matchAll(pattern) : [html.match(pattern)];
    for (const match of matches) {
      const value = match?.[1] ? pickUsableValue(match[1]) : null;
      if (value !== null) {
        return value;
      }
    }
  }
  return null;
}
