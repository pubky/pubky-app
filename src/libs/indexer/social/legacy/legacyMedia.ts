import { idMicros, parseOwner } from 'pubky-social-specs';
import { LEGACY_ROOT, readLegacyFileRecord } from './legacyTree';

// In the older tree a post's attachment or a profile's image names a file record, which says the type and points at
// the bytes in a blob of the same owner.

const FILES_PREFIX = `${LEGACY_ROOT}files/`;
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
  const record = recordBytes === null ? null : readLegacyFileRecord(at.owner, `${FILES_PREFIX}${at.id}`, recordBytes);
  if (record === null) return null;
  const bytes = await read(record.src);
  return bytes === null ? null : { bytes, contentType: record.contentType };
}
