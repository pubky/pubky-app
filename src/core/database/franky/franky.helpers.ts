import { DB_NAME } from '@/config/database';
import { db } from '@/database/franky/franky';

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
}

export async function resetDatabase(): Promise<void> {
  const { indexedDB } = await import('fake-indexeddb');

  db.close();
  indexedDB.deleteDatabase(DB_NAME);
  await db.open();
}
