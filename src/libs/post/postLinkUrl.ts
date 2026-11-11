import { LinkifyIt } from 'linkify-it';

/**
 * The link a post's content is about: kind inference classifies it (`link` or
 * `video`), PostLinkEmbeds embeds it, and the Visual layout builds a tile for it
 * when it is a playable video. Sharing one parser keeps the three in agreement.
 */

// Protocol types to ignore when parsing links
export const IGNORED_PROTOCOLS: readonly string[] = ['ftp:', 'mailto:'];

/**
 * Strip Markdown link syntax from content
 * Removes [text](url) entirely so URLs inside Markdown links aren't detected
 * Handles URLs with nested parentheses (e.g., Wikipedia links like /wiki/Foo_(bar))
 */
const stripMarkdownLinks = (content: string): string => {
  // Pattern handles one level of nested parentheses in URLs
  // [^()]* matches chars that aren't parentheses
  // (?:\([^()]*\)[^()]*)* matches (content) groups and text after them
  return content.replace(/\[([^\]]*)\]\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, '<stripped-link>');
};

let linkify: LinkifyIt | null = null;

/** Built once: linkify-it compiles its regexes on construction and again on every `add`. */
const getLinkify = (): LinkifyIt => {
  if (linkify) return linkify;
  // linkify-it v6 defaults fuzzyLink to false; keep matching protocol-less URLs.
  const instance = new LinkifyIt({ fuzzyLink: true });
  // Disable unwanted protocol types
  IGNORED_PROTOCOLS.forEach((protocol) => instance.add(protocol, null));
  linkify = instance;
  return instance;
};

/** A link found in the content: its URL and the scheme it was written with (`''` for none). */
export interface LinkMatch {
  url: string;
  schema: string;
}

/**
 * First bare link in the content, or null when there is none.
 * Markdown links, `ftp:` and `mailto:` are skipped; a protocol-less URL comes back with `http://`
 * and an empty `schema`.
 */
export function getFirstLinkMatch(content: string): LinkMatch | null {
  // Strip Markdown link syntax before parsing
  const match = getLinkify().match(stripMarkdownLinks(content))?.[0];

  return match ? { url: match.url, schema: match.schema } : null;
}

/** Every bare link in the content, in order, as `getFirstLinkMatch` finds the first. */
export function getLinkMatches(content: string): LinkMatch[] {
  return (
    getLinkify()
      .match(stripMarkdownLinks(content))
      ?.map(({ url, schema }) => ({ url, schema })) ?? []
  );
}

/** First bare URL in the content, or null when there is none (see `getFirstLinkMatch`). */
export function getFirstLinkUrl(content: string): string | null {
  return getFirstLinkMatch(content)?.url ?? null;
}

/** Every link in the content, Markdown link targets included, in order. */
export function getLinkUrls(content: string): string[] {
  return (
    getLinkify()
      .match(content)
      ?.map((match) => match.url) ?? []
  );
}

/**
 * A URI with a scheme other than the web's (`isbn:…`, `geo:…`, `doi:…`): a token that starts the
 * text, follows whitespace or an opening bracket or quote, and opens with a scheme of two or more
 * characters and a colon. `10:30` and `C:\…` are not one.
 */
const URI_TOKEN = /(?<=^|[\s([<"'“‘])[a-z][a-z0-9+.-]+:\S+/gi;

/** Trailing characters that end a sentence or a quote, not a URI (as linkify trims a link). */
const TRAILING_PUNCTUATION = /[.,;:!?'"“”‘’]$/;

/** A closing bracket and its opening one: a closing bracket the URI does not open is not its own. */
const BRACKETS: Readonly<Record<string, string>> = { ')': '(', ']': '[', '}': '{', '>': '<' };

/** A host and its port (`localhost:3000`, `redis:6379/0`), not a URI. */
const PORT = /^\d{1,5}(\/|$)/;

const count = (text: string, char: string) => text.split(char).length - 1;

/** `token` without the punctuation and unopened closing brackets that follow the URI in the text. */
function trimUriToken(token: string): string {
  let uri = token;
  for (;;) {
    const last = uri.at(-1) ?? '';
    const opening = BRACKETS[last];
    const isTrailing =
      TRAILING_PUNCTUATION.test(last) || (opening !== undefined && count(uri, last) > count(uri, opening));
    if (!isTrailing) return uri;
    uri = uri.slice(0, -1);
  }
}

interface UriSpan {
  uri: string;
  index: number;
}

/** Every URI-shaped token of `text` (see `URI_TOKEN`), trimmed, with something after its colon, in order. */
function findUriTokens(text: string): UriSpan[] {
  const spans: UriSpan[] = [];
  for (const match of text.matchAll(URI_TOKEN)) {
    const uri = trimUriToken(match[0]);
    const colon = uri.indexOf(':');
    if (colon > 0 && colon < uri.length - 1) spans.push({ uri, index: match.index });
  }
  return spans;
}

/**
 * The URIs a post's text writes with another scheme than the web's, in order: tokens with a
 * lower-case scheme (`Note:this` is prose), not `http:`/`https:` (linkify's), with no dot in the scheme
 * and no port after it (`example.com:8080`, `localhost:3000` name a host), and not a second colon
 * (`std::move`).
 */
function findUris(text: string): UriSpan[] {
  return findUriTokens(text).filter(({ uri }) => {
    const colon = uri.indexOf(':');
    const scheme = uri.slice(0, colon);
    const rest = uri.slice(colon + 1);
    return (
      scheme === scheme.toLowerCase() &&
      scheme !== 'http' &&
      scheme !== 'https' &&
      !scheme.includes('.') &&
      !rest.startsWith(':') &&
      !PORT.test(rest)
    );
  });
}

/**
 * Every URI-shaped token in the content, Markdown link targets included, in order, its scheme in
 * lower case (the spelling the data model stores): to find a stored URI embed in the text.
 */
export function getUriUrls(content: string): string[] {
  return findUriTokens(content).map(({ uri }) => {
    const colon = uri.indexOf(':');
    return uri.slice(0, colon).toLowerCase() + uri.slice(colon);
  });
}

/**
 * Every link a post's text may embed, in text order: the bare links linkify finds and the URIs of
 * other schemes `isUri` accepts (`isbn:…`, `geo:…`, with their scheme as `schema`). A URI it refuses
 * is left out, as linkify leaves it out. Where the two overlap, the URI gives way to a link that
 * starts with it or right after its scheme (`source:https://…`); a link found further inside the URI
 * (a magnet link's tracker) is the URI's.
 */
export function getEmbedLinkMatches(content: string, isUri: (uri: string) => boolean): LinkMatch[] {
  const text = stripMarkdownLinks(content);
  const links = getLinkify().match(text) ?? [];
  const uris = findUris(text).filter(
    ({ uri, index }) =>
      isUri(uri) &&
      !links.some(
        (link) =>
          link.index < index + uri.length &&
          index < link.lastIndex &&
          (link.index <= index || link.index === index + uri.indexOf(':') + 1),
      ),
  );
  const inUri = (index: number) => uris.some((span) => span.index < index && index < span.index + span.uri.length);
  return [
    ...links.filter((link) => !inUri(link.index)).map(({ url, schema, index }) => ({ url, schema, index })),
    ...uris.map(({ uri, index }) => ({ url: uri, schema: uri.slice(0, uri.indexOf(':') + 1), index })),
  ]
    .sort((a, b) => a.index - b.index)
    .map(({ url, schema }) => ({ url, schema }));
}
