import { parseUri } from 'pubky-social-specs';
import { isPubkyIdentifier } from '@/libs/utils/utils';
import { parsePubkyUri } from '@/models/models.utils';

/**
 * A pubky.app object a URI names: a post, a user (their profile) or a file. The app shows each
 * itself (a post or profile on its own page, a file as a file), never as an external resource.
 */
export type TPubkyAppTarget =
  | { kind: 'post'; authorId: string; postId: string }
  | { kind: 'user'; userId: string }
  /** `uri`: the file's URI as Nexus keys it (the scheme in lower case, no query or fragment). */
  | { kind: 'file'; ownerId: string; uri: string };

/** The namespace `parseUri` names for a path of the 0.x tree (`kind: "foreign"`). */
const LEGACY_NAMESPACE = 'pubky.app';
/** A 0.x object id: a post's or a file's (`00360YV6W3NZG`), nothing that could leave the route segment. */
const LEGACY_OBJECT_ID = /^[0-9A-Za-z_-]+$/;

/**
 * `uri` as `pubky-social-specs` reads it, once the app's own reading accepts it (`parsePubkyUri`: the
 * scheme in any case, a query or fragment dropped, no port or userinfo) and its key is a pubky
 * (`isPubkyIdentifier`); the bare key with a trailing slash is the bare key. `null` for anything else.
 */
function parsePubkyAddress(uri: string): (ReturnType<typeof parseUri> & { uri: string }) | null {
  const address = parsePubkyUri(uri.trim());
  if (!address || !isPubkyIdentifier(address.authority)) return null;
  const canonical = `pubky://${address.authority}${address.path === '/' ? '' : address.path}`;
  try {
    return { ...parseUri(canonical), uri: canonical };
  } catch {
    // A path the data model refuses names no object.
    return null;
  }
}

/**
 * The pubky.app object `uri` names (`TPubkyAppTarget`), in either spelling: the v1 tree
 * (`…/pub/social/v1/posts/<id>`, a post's version path, `…/profile.json`, public media
 * `…/files/<hash>.<ext>`, and the bare key `pubky://<key>`, the user) or the 0.x tree Nexus still
 * serves (`posts/<id>`, `profile.json` and `files/<id>` in the namespace `parseUri` reads as the 0.x
 * one). `null` for any other URI: another app's object (a Loopky deck), any other object of either
 * tree (a tag, a bookmark, a blob, a private file), a malformed one, a web link.
 */
export function getPubkyAppTarget(uri: string): TPubkyAppTarget | null {
  const parsed = parsePubkyAddress(uri);
  if (!parsed || parsed.root !== 'public') return null;
  switch (parsed.kind) {
    case 'post':
      return { kind: 'post', authorId: parsed.owner, postId: parsed.id };
    case 'user':
      return { kind: 'user', userId: parsed.owner };
    case 'file':
      return { kind: 'file', ownerId: parsed.owner, uri: parsed.uri };
    case 'foreign':
      return parsed.namespace === LEGACY_NAMESPACE ? getLegacyTarget(parsed.owner, parsed.rest, parsed.uri) : null;
    default:
      return null;
  }
}

/** A 0.x object by the path segments under its namespace: `posts/<id>`, `profile.json`, `files/<id>`. */
function getLegacyTarget(owner: string, rest: readonly string[], uri: string): TPubkyAppTarget | null {
  const [collection, id, ...more] = rest;
  if (collection === 'profile.json' && id === undefined) return { kind: 'user', userId: owner };
  if (id === undefined || more.length > 0 || !LEGACY_OBJECT_ID.test(id)) return null;
  if (collection === 'posts') return { kind: 'post', authorId: owner, postId: id };
  if (collection === 'files') return { kind: 'file', ownerId: owner, uri };
  return null;
}

/**
 * Whether `uri` addresses pubky.app's own trees at all (v1 or 0.x), whether or not it names an object
 * `getPubkyAppTarget` reads (a tag, a blob): Pinakes reads none of them, so none is ever asked of it.
 */
export function isPubkyAppAddress(uri: string): boolean {
  const parsed = parsePubkyAddress(uri);
  return parsed !== null && (parsed.kind !== 'foreign' || parsed.namespace === LEGACY_NAMESPACE);
}
