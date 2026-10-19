import { DB_NAME } from '@/config/database';
import { db } from '@/database/franky/franky';

let cacheGeneration = 0;

/**
 * How many times the local cache has been cleared in this tab. An in-memory guard that
 * stands in for rows (`recentCollectionCounts`) records it and stops applying after the
 * next clear: the rows it protected are gone, and the first response after a clear is the
 * only copy of what it rebuilt.
 */
export function getCacheGeneration(): number {
  return cacheGeneration;
}

export async function clearDatabase(isCurrent: () => boolean = () => true): Promise<void> {
  if (!isCurrent()) return;
  if (!db.isOpen()) {
    await db.open();
  }

  if (!isCurrent()) return;
  // A failed table must not release account preparation while other clears can still erase data.
  const results = await Promise.allSettled(db.tables.map(async (table) => table.clear()));
  const failure = results.find((result) => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
  cacheGeneration += 1;
}

export async function resetDatabase(): Promise<void> {
  const { indexedDB } = await import('fake-indexeddb');

  db.close();
  indexedDB.deleteDatabase(DB_NAME);
  await db.open();
  cacheGeneration += 1;
}
