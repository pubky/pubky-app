import { getSafeExternalUrl } from '@/libs/utils/safeExternalUrl';
import { getLinkUrls } from './postLinkUrl';

/**
 * A post's `embed` when it is a web link, else null. The data model stores a web reference as
 * written and only with a lower-case `http://` or `https://` prefix; any other value (a post's
 * `pubky://` reference, `isbn:`, `javascript:`…) is not a web embed.
 */
export function getWebEmbedUrl(embed: string | null | undefined): string | null {
  if (!embed || !(embed.startsWith('http://') || embed.startsWith('https://'))) return null;
  return getSafeExternalUrl(embed) === embed ? embed : null;
}

/**
 * The stored web embed a post view previews under `content`, as the text writes it (Nexus returns it
 * normalized, so a text link also matches it by `normalizeEmbedUrl`). An edit keeps the stored
 * `embed` while its text may no longer hold that link, so the embed is shown only while it is still
 * one of the text's links; a post without text (another client may write one) shows it as is.
 */
export function getShownEmbedUrl(embedUrl: string | null | undefined, content: string): string | null {
  if (!embedUrl) return null;
  if (!content.trim()) return embedUrl;
  const links = getLinkUrls(content);
  if (links.includes(embedUrl)) return embedUrl;
  const key = normalizeEmbedUrl(embedUrl);
  return (key && links.find((link) => normalizeEmbedUrl(link) === key)) ?? null;
}

/**
 * A comparison key for a web link: two spellings of one link that Nexus keys alike (the scheme's
 * and host's case, a default port, user info, a fragment, an IDN host or its punycode, percent
 * encoding) give the same key. Only a key to compare two links that both go through it, not the
 * address Nexus stores. Null for a value that is not a URL.
 */
export function normalizeEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}
