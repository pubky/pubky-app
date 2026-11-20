import { limits } from 'pubky-social-specs';
import { getSafeExternalUrl } from '@/libs/utils/safeExternalUrl';
import { isSameDomain } from '@/libs/utils/utils';
import { getFirstLinkMatch, getLinkMatches, getLinkUrls, type LinkMatch } from './postLinkUrl';

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
 * The link a new post embeds: the first link of its text, when it is an external web link the
 * data model can store as `embed` (at most `referenceUriMaxLength` code points). The data model
 * stores a web reference as written, so only a link written with its `http://` or `https://`
 * scheme is embedded; one written without a scheme keeps the plain preview. A link to this app's
 * own pages is not an external resource and is left to the in-app preview.
 */
export function getComposerEmbedUrl(content: string): string | null {
  return toComposerEmbedUrl(getFirstLinkMatch(content));
}

/** The link `match` names when a new post can embed it (see `getComposerEmbedUrl`), else null. */
function toComposerEmbedUrl(match: LinkMatch | null): string | null {
  if (!match?.schema) return null;
  const url = getWebEmbedUrl(match.url);
  if (!url || isSameDomain(url)) return null;
  return [...url].length <= limits.referenceUriMaxLength ? url : null;
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
 * Every link of the text a new post can embed (as `getComposerEmbedUrl` decides for the first), in
 * order: the links the author may pick from. Two spellings of one link (a fragment, the host's case,
 * a default port) count once, under the first spelling.
 */
export function getComposerEmbedUrls(content: string): string[] {
  const urls: string[] = [];
  const keys = new Set<string>();
  for (const match of getLinkMatches(content)) {
    const url = toComposerEmbedUrl(match);
    const key = url && (normalizeEmbedUrl(url) ?? url);
    if (!url || !key || keys.has(key)) continue;
    keys.add(key);
    urls.push(url);
  }
  return urls;
}

/**
 * Where an edit of a note starts: `opened` is the text's spelling of the stored web embed (Nexus
 * serves it normalized), null when the composer does not offer that link. A post that embeds none
 * starts with its first link `removed`, so the edit embeds nothing until the author asks.
 */
export function getEditEmbedSeed(
  content: string,
  embedUrl: string | null,
): { opened: string | null; removed: string | null } {
  if (embedUrl === null) return { opened: null, removed: getComposerEmbedUrl(content) };
  const key = normalizeEmbedUrl(embedUrl);
  // As the composer offers them: the other links only when the first one can be embedded
  const urls = getComposerEmbedUrl(content) ? getComposerEmbedUrls(content) : [];
  const opened = urls.find((url) => url === embedUrl || (key !== null && normalizeEmbedUrl(url) === key)) ?? null;
  return { opened, removed: null };
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
