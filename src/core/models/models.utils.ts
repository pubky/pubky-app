import { parseUri } from 'pubky-social-specs';
import { CompositeIdDomain, type Pubky } from '@/models/models.types';
import { COMPOSITE_ID_DELIMITER } from './models.defaults';
import type { CompositeIdParams, CompositeIdResult } from './models.types';

const PUBKY_URI_PREFIX = 'pubky://';
/** A pubky authority is a bare public key: userinfo (`@`) or a port (`:`) would corrupt ids built from it. */
const PUBKY_AUTHORITY = /^[^:@]+$/;

/**
 * Splits a `pubky://` URI into its authority and path, without `URL`:
 * `new URL('pubky://…').hostname` is empty on Chrome before 130 (non-special schemes).
 *
 * The scheme is case-insensitive (`PUBKY://…` is valid); the authority keeps its case.
 * Query and fragment are dropped. A missing authority (`pubky:///…`) or one with
 * userinfo (`@`) or a port (`:`) returns null, as does a non-string value from
 * unvalidated remote data (e.g. a Nexus file record without a `uri`).
 *
 * @example
 * parsePubkyUri("pubky://author123/pub/pubky.app/files/file456?v=1")
 * // Returns: { authority: "author123", path: "/pub/pubky.app/files/file456" }
 */
export function parsePubkyUri(uri: unknown): { authority: string; path: string } | null {
  if (typeof uri !== 'string' || uri.slice(0, PUBKY_URI_PREFIX.length).toLowerCase() !== PUBKY_URI_PREFIX) {
    return null;
  }
  const rest = uri.slice(PUBKY_URI_PREFIX.length).split(/[?#]/, 1)[0];
  const slash = rest.indexOf('/');
  const authority = slash === -1 ? rest : rest.slice(0, slash);
  if (!PUBKY_AUTHORITY.test(authority)) {
    return null;
  }
  return { authority, path: slash === -1 ? '' : rest.slice(slash) };
}

/**
 * Parses a pubky:// URI to extract the author and ID,
 * then builds a composite ID in the format "author:id"
 *
 * Form-agnostic across epochs: a 0.x post `posts/{id}`, a v1 reference `posts/{id}` and a v1
 * version `posts/{id}/{editId}.json` all yield `{id}`; a v1 file `files/{hash}.{ext}` yields the
 * hash (how Nexus keys media) and a 0.x file `files/{tsid}` its id.
 *
 * @param uri - A pubky URI (e.g., "pubky://author/pub/social/v1/posts/post123")
 * @param domain - The domain of the URI (e.g., "posts", "files")
 * @returns Composite ID in "author:id" format, or null if parsing fails
 *
 * @example
 * buildCompositeIdFromUri("pubky://author123/pub/social/v1/files/AKSZ57W2RFKHV1EHK007FQQ8TW.png")
 * // Returns: "author123:AKSZ57W2RFKHV1EHK007FQQ8TW"
 */
export function buildCompositeIdFromPubkyUri({ uri, domain }: CompositeIdParams): string | null {
  const parsed = parsePubkyUri(uri);
  if (!parsed) {
    return null;
  }
  const segments = parsed.path.split('/').filter(Boolean);
  const domainIndex = segments.lastIndexOf(domain);
  const segment = domainIndex !== -1 ? segments[domainIndex + 1] : undefined;
  // v1 media is `files/{hash}.{ext}`; its id is the hash. A 0.x file id has no dot.
  const id = domain === CompositeIdDomain.FILES ? segment?.split('.')[0] : segment;

  if (!id) {
    return null;
  }

  return buildCompositeId({ pubky: parsed.authority, id });
}

/**
 * Whether `uri` names a v1 public media file (`pubky://{owner}/pub/social/v1/files/{hash}.{ext}`),
 * as `pubky-social-specs` parses it. False for a 0.x file, a private file, any other object and
 * anything the data model refuses, so a caller can branch without a try/catch.
 */
export function isV1MediaUri(uri: unknown): boolean {
  if (typeof uri !== 'string') return false;
  try {
    const parsed = parseUri(uri);
    return parsed.kind === 'file' && parsed.root === 'public';
  } catch {
    return false;
  }
}

/** The `{hash}.{ext}` filename of a v1 public media URI, or null for anything else (see `isV1MediaUri`). */
export function mediaFilenameFromUri(uri: unknown): string | null {
  if (typeof uri !== 'string') return null;
  try {
    const parsed = parseUri(uri);
    return parsed.kind === 'file' && parsed.root === 'public' ? parsed.filename : null;
  } catch {
    return null;
  }
}

export function buildCompositeId({ pubky, id }: CompositeIdResult): string {
  return `${pubky}${COMPOSITE_ID_DELIMITER}${id}`;
}

export function parseCompositeId(compositeId: string): CompositeIdResult {
  const sep = compositeId.indexOf(COMPOSITE_ID_DELIMITER);
  if (sep <= 0 || sep === compositeId.length - 1) {
    throw new Error(`Invalid composite id: ${compositeId}`);
  }
  const pubky = compositeId.substring(0, sep) as Pubky;
  const id = compositeId.substring(sep + 1);
  return { pubky, id };
}
