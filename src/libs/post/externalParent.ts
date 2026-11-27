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

/** The whitespace the spec trims: Unicode 15.1's, fixed, not `String.prototype.trim`'s. */
const SPEC_WHITESPACE = /[\t-\r \x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/;

function trimSpecWhitespace(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && SPEC_WHITESPACE.test(value.charAt(start))) start++;
  while (end > start && SPEC_WHITESPACE.test(value.charAt(end - 1))) end--;
  return value.slice(start, end);
}

/** A bracketed IPv6 host runs to its `]`, any other host to the first `:`. */
function splitHostPort(hostPort: string): { host: string; port: string | null } {
  if (hostPort.startsWith('[')) {
    const close = hostPort.indexOf(']');
    const after = close < 0 ? '' : hostPort.slice(close + 1);
    return after.startsWith(':')
      ? { host: hostPort.slice(0, close + 1), port: after.slice(1) }
      : { host: hostPort, port: null };
  }
  const colon = hostPort.indexOf(':');
  return colon < 0
    ? { host: hostPort, port: null }
    : { host: hostPort.slice(0, colon), port: hostPort.slice(colon + 1) };
}

/**
 * A web link in the one spelling every writer stores, or `null` for a value that is no web link a
 * post can name (`getExternalParentProblem`): trimmed, scheme and host in ASCII lower case, a port of
 * digits without leading zeros and none when it is the scheme's default (or empty), no userinfo, no
 * fragment, an empty path as `/`. The path and the query stay as written. Without `URL`, which
 * repairs junk into acceptance.
 *
 * Same fold as the pubky-social-specs writer helper; switch to it once released.
 */
export function foldWebLink(link: string): string | null {
  const value = trimSpecWhitespace(link);
  const scheme = /^https?:\/\//i.exec(value)?.[0].slice(0, -3).toLowerCase();
  if (!scheme) return null;
  const rest = value.slice(scheme.length + 3);
  if (getExternalParentProblem(`${scheme}://${rest}`) !== null) return null;
  const end = rest.search(/[/?#]/);
  const authority = end < 0 ? rest : rest.slice(0, end);
  const path = (end < 0 ? '' : rest.slice(end)).split('#')[0];
  const { host, port } = splitHostPort(authority.slice(authority.lastIndexOf('@') + 1));
  const digits = port !== null && /^[0-9]+$/.test(port) ? port.replace(/^0+(?=.)/, '') : (port ?? '');
  const kept = digits === '' || digits === (scheme === 'http' ? '80' : '443') ? '' : `:${digits}`;
  const lowerHost = host.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  const folded = `${scheme}://${lowerHost}${kept}${path.startsWith('/') ? '' : '/'}${path}`;
  // The `/` of an empty path can take a link at the length limit past it.
  return getExternalParentProblem(folded) === null ? folded : null;
}
