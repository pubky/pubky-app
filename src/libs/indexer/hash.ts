// A content hash is the base64 of 32 bytes; its first 16 bytes still tell two contents apart.
const FULL_HASH = /^[A-Za-z0-9+/]{43}=$/;

/** The hash cut to its first 16 bytes, re-encoded; any value that is not a 32-byte base64 hash stays as it is. */
export function shortHash(hash: string): string {
  if (!FULL_HASH.test(hash)) return hash;
  return btoa(atob(hash).slice(0, 16));
}
