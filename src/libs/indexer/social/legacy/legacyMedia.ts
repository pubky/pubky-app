import { idMicros, parseOwner, validMimeTypes } from 'pubky-social-specs';
import { LEGACY_ROOT } from './legacyTree';

// In the older tree a post's attachment or a profile's image names a file record, which says the type and points at
// the bytes in a blob of the same owner.

const FILES_PREFIX = `${LEGACY_ROOT}files/`;
const BLOBS_PREFIX = `${LEGACY_ROOT}blobs/`;
const PUBKY_SCHEME = 'pubky://';

/** The bytes of an older file and the type its record states. */
export interface LegacyFile {
  bytes: Uint8Array;
  contentType: string;
}

function isTimestampId(id: string): boolean {
  try {
    idMicros(id);
    return true;
  } catch {
    return false;
  }
}

function isPublicKey(key: string): boolean {
  try {
    parseOwner(key);
    return true;
  } catch {
    return false;
  }
}

/** The owner and the one segment after `prefix` in `pubky://{owner}{prefix}{id}`, `null` for any other URI. */
function idUnder(prefix: string, uri: string): { owner: string; id: string } | null {
  if (!uri.toLowerCase().startsWith(PUBKY_SCHEME)) return null;
  const rest = uri.slice(PUBKY_SCHEME.length);
  const slash = rest.indexOf('/');
  if (slash < 0) return null;
  const owner = rest.slice(0, slash);
  const path = rest.slice(slash);
  if (!isPublicKey(owner) || !path.startsWith(prefix)) return null;
  const id = path.slice(prefix.length);
  return id === '' || id.includes('/') ? null : { owner, id };
}

/** The URI of the owner's file record `id`, `null` when `id` is no older file id. */
export function legacyFileUri(owner: string, id: string): string | null {
  return isPublicKey(owner) && isTimestampId(id) ? `${PUBKY_SCHEME}${owner}${FILES_PREFIX}${id}` : null;
}

const isFields = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The record's type and blob, the blob only when it is the record owner's own. */
function recordOf(bytes: Uint8Array, owner: string): { contentType: string; blob: string } | null {
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  if (!isFields(json) || typeof json.src !== 'string' || typeof json.content_type !== 'string') return null;
  const contentType = json.content_type.trim();
  const at = idUnder(BLOBS_PREFIX, json.src.trim());
  const known = validMimeTypes.some((type) => type === contentType);
  if (!known || at === null || at.owner !== owner) return null;
  return { contentType, blob: `${PUBKY_SCHEME}${owner}${BLOBS_PREFIX}${at.id}` };
}

/**
 * The bytes and type of the older file a URI names, through its record. `null` when the URI names no older file, or
 * its record or blob is missing or invalid; `read` rejecting rejects.
 */
export async function readLegacyFile(
  uri: string,
  read: (uri: string) => Promise<Uint8Array | null>,
): Promise<LegacyFile | null> {
  const at = idUnder(FILES_PREFIX, uri.trim());
  const file = at === null ? null : legacyFileUri(at.owner, at.id);
  if (at === null || file === null) return null;
  const recordBytes = await read(file);
  const record = recordBytes === null ? null : recordOf(recordBytes, at.owner);
  if (record === null) return null;
  const bytes = await read(record.blob);
  return bytes === null ? null : { bytes, contentType: record.contentType };
}
