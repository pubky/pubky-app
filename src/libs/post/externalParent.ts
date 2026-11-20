/**
 * The identifier schemes an external resource may be known by as a post's `parent`, besides a web
 * link (`http://`, `https://`). `pubky` is not one: a Pubky post is replied to by its id, and other
 * Pubky objects are not replied to.
 */
const EXTERNAL_PARENT_SCHEMES: ReadonlySet<string> = new Set(['isbn', 'doi', 'osm', 'geo', 'urn']);

/** The spec's limit on a `parent` URI, in code points. */
const PARENT_URI_MAX_CODE_POINTS = 1024;

const CONTROL_OR_WHITESPACE = /[\s\p{Cc}]/u;

/**
 * Why `uri` cannot be written as a post's `parent` for an external resource, or `null` when it can.
 * Checked the way the spec checks a reference, without `URL` (which repairs junk into acceptance):
 * no spaces or control characters, at most `PARENT_URI_MAX_CODE_POINTS`, and either a web link with
 * a host or a known identifier scheme (`EXTERNAL_PARENT_SCHEMES`), spelled in lower case, naming
 * something. The URI is never rewritten: it is the spelling the resource's tags use.
 */
export function getExternalParentProblem(uri: string): string | null {
  if (uri.length === 0 || CONTROL_OR_WHITESPACE.test(uri)) return 'is empty or has spaces';
  if (Array.from(uri).length > PARENT_URI_MAX_CODE_POINTS) return 'is too long';

  const web = /^https?:\/\/([^/?#]*)/.exec(uri);
  if (web) {
    const authority = web[1];
    const hostPort = authority.slice(authority.lastIndexOf('@') + 1);
    const host = hostPort.startsWith('[') ? hostPort : hostPort.split(':')[0];
    return host ? null : 'has no host';
  }

  const colon = uri.indexOf(':');
  if (colon <= 0 || !EXTERNAL_PARENT_SCHEMES.has(uri.slice(0, colon))) return 'has an unsupported scheme';
  if (colon + 1 === uri.length) return 'names nothing';
  return null;
}

/** Whether a post can reply to the external resource `uri` (see `getExternalParentProblem`). */
export function isExternalParentUri(uri: string): boolean {
  return getExternalParentProblem(uri) === null;
}
