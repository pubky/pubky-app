import { z } from 'zod';
import { LOCKS_READER_FILES_COPY_VERSION } from '@/config/locks';

// In localStorage, not on the homeserver, so reading it costs no request.
const KEY_PREFIX = 'locks-reader-files-copied:';

const recordSchema = z.object({ v: z.number().int() });

// exported for tests
export function locksReaderFilesCopiedKey(pubky: string): string {
  return `${KEY_PREFIX}${pubky}`;
}

export function hasCopiedLocksReaderFiles(pubky: string): boolean {
  try {
    const raw = localStorage.getItem(locksReaderFilesCopiedKey(pubky));
    if (raw === null) return false;
    const parsed = recordSchema.safeParse(JSON.parse(raw));
    // A newer version counts: a tab of the previous build would otherwise copy again on every load beside a newer tab.
    return parsed.success && parsed.data.v >= LOCKS_READER_FILES_COPY_VERSION;
  } catch {
    // Blocked storage or a corrupt entry: copy again.
    return false;
  }
}

export function markLocksReaderFilesCopied(pubky: string): void {
  // Never lowered: a late run in a tab of the previous build would make a newer tab copy once more.
  if (hasCopiedLocksReaderFiles(pubky)) return;
  try {
    localStorage.setItem(locksReaderFilesCopiedKey(pubky), JSON.stringify({ v: LOCKS_READER_FILES_COPY_VERSION }));
  } catch {
    // Refused: the next page load copies again.
  }
}
