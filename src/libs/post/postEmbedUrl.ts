import { limits } from 'pubky-social-specs';
import { getSafeExternalUrl } from '@/libs/utils/safeExternalUrl';
import { isSameDomain } from '@/libs/utils/utils';
import { getEmbedLinkMatches, getLinkUrls, getUriUrls, IGNORED_PROTOCOLS, type LinkMatch } from './postLinkUrl';

/**
 * A post's `embed` when it is a web link, else null. The data model stores a web reference as
 * written and only with a lower-case `http://` or `https://` prefix; any other value (a post's
 * `pubky://` reference, `isbn:`, `javascript:`…) is not a web embed.
 */
export function getWebEmbedUrl(embed: string | null | undefined): string | null {
  if (!embed || !(embed.startsWith('http://') || embed.startsWith('https://'))) return null;
  return getSafeExternalUrl(embed) === embed ? embed : null;
}

/** Schemes a post never embeds: they run code or name data in the viewer's own browser. */
const UNSAFE_EMBED_SCHEMES: ReadonlySet<string> = new Set([
  'javascript',
  'data',
  'vbscript',
  'file',
  'filesystem',
  'blob',
  'about',
  'view-source',
]);

/**
 * Schemes the composer does not offer as an embed: those the link preview ignores
 * (`IGNORED_PROTOCOLS`), and phone numbers, which name a contact rather than a resource.
 */
const UNOFFERED_EMBED_SCHEMES: ReadonlySet<string> = new Set([
  ...IGNORED_PROTOCOLS.map((protocol) => protocol.slice(0, -1)),
  'tel',
  'sms',
]);

const CONTROL_OR_WHITESPACE = /[\s\p{Cc}]/u;

/**
 * A post's `embed` when it names an external resource by another scheme than the web's (`isbn:`,
 * `geo:`, `doi:`, `btc:`, `urn:`, `spotify:`, `magnet:`…), else null. Checked as the data model
 * checks a reference, in its canonical spelling: a lower-case scheme, something after the colon, no
 * spaces or control characters, at most `referenceUriMaxLength` code points. The scheme has two or
 * more characters (`C:\…` is a path), is not a web link's (`getWebEmbedUrl`) nor a Pubky one (a
 * post's reference is a repost, `pk:` a legacy mention), and does not run code or name local data
 * (`UNSAFE_EMBED_SCHEMES`).
 * Such a URI is never a link out: its card opens the resource's page.
 */
export function getUriEmbedUrl(embed: string | null | undefined): string | null {
  if (!embed || CONTROL_OR_WHITESPACE.test(embed)) return null;
  const scheme = /^([a-z][a-z0-9+.-]+):./.exec(embed)?.[1];
  if (!scheme || scheme === 'http' || scheme === 'https' || scheme.startsWith('pubky') || scheme === 'pk') return null;
  if (UNSAFE_EMBED_SCHEMES.has(scheme)) return null;
  return [...embed].length <= limits.referenceUriMaxLength ? embed : null;
}

/** A post's `embed` when it names an external resource: a web link or a URI of another scheme. */
export function getResourceEmbedUrl(embed: string | null | undefined): string | null {
  return getWebEmbedUrl(embed) ?? getUriEmbedUrl(embed);
}

/**
 * The link a new post embeds: the first link of its text, when it is an external web link the
 * data model can store as `embed` (at most `referenceUriMaxLength` code points), or a URI of
 * another scheme written in it (`isbn:…`, `geo:…`: `getUriEmbedUrl`). The data model
 * stores a web reference as written, so only a link written with its `http://` or `https://`
 * scheme is embedded; one written without a scheme keeps the plain preview. A link to this app's
 * own pages is not an external resource and is left to the in-app preview. A URI the composer does
 * not offer (`isOfferedUri`) is skipped as linkify skips it, so it never hides a later web link.
 */
export function getComposerEmbedUrl(content: string): string | null {
  return toComposerEmbedUrl(getEmbedLinkMatches(content, isOfferedUri)[0] ?? null);
}

/** Whether the composer offers the URI of another scheme `uri` as an embed (`UNOFFERED_EMBED_SCHEMES`). */
function isOfferedUri(uri: string): boolean {
  return getUriEmbedUrl(uri) !== null && !UNOFFERED_EMBED_SCHEMES.has(uri.slice(0, uri.indexOf(':')));
}

/** The link `match` names when a new post can embed it (see `getComposerEmbedUrl`), else null. */
function toComposerEmbedUrl(match: LinkMatch | null): string | null {
  if (!match?.schema) return null;
  const url = getWebEmbedUrl(match.url);
  if (!url) return isOfferedUri(match.url) ? match.url : null;
  if (isSameDomain(url)) return null;
  return [...url].length <= limits.referenceUriMaxLength ? url : null;
}

/**
 * The stored web embed a post view previews under `content`, as the text writes it (Nexus returns it
 * normalized, so a text link also matches it by `normalizeEmbedUrl`). An edit keeps the stored
 * `embed` while its text may no longer hold that link, so the embed is shown only while it is still
 * one of the text's links; a post without text (another client may write one) shows it as is. A
 * URI of another scheme (`isbn:…`) is stored as written, its scheme in lower case, and shown while
 * the text holds it in any case of its scheme.
 */
export function getShownEmbedUrl(embedUrl: string | null | undefined, content: string): string | null {
  if (!embedUrl) return null;
  if (!content.trim()) return embedUrl;
  if (!getWebEmbedUrl(embedUrl)) return getUriUrls(content).includes(embedUrl) ? embedUrl : null;
  const links = getLinkUrls(content);
  if (links.includes(embedUrl)) return embedUrl;
  const key = normalizeEmbedUrl(embedUrl);
  return (key && links.find((link) => normalizeEmbedUrl(link) === key)) ?? null;
}

/**
 * Every link of the text a new post can embed (as `getComposerEmbedUrl` decides for the first), in
 * order: the links the author may pick from. Two spellings of one web link (a fragment, the host's
 * case, a default port) count once, under the first spelling; a URI of another scheme is its spelling.
 */
export function getComposerEmbedUrls(content: string): string[] {
  const urls: string[] = [];
  const keys = new Set<string>();
  for (const match of getEmbedLinkMatches(content, isOfferedUri)) {
    const url = toComposerEmbedUrl(match);
    const key = url && (getWebEmbedUrl(url) ? (normalizeEmbedUrl(url) ?? url) : url);
    if (!url || !key || keys.has(key)) continue;
    keys.add(key);
    urls.push(url);
  }
  return urls;
}

/**
 * Where an edit of a note starts: `opened` is the text's spelling of the stored embed (Nexus
 * serves a web one normalized), null when the composer does not offer that link. A post that embeds none
 * starts with its first link `removed`, so the edit embeds nothing until the author asks.
 */
export function getEditEmbedSeed(
  content: string,
  embedUrl: string | null,
): { opened: string | null; removed: string | null } {
  if (embedUrl === null) return { opened: null, removed: getComposerEmbedUrl(content) };
  const key = getWebEmbedUrl(embedUrl) ? normalizeEmbedUrl(embedUrl) : null;
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
