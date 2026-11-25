import Dexie, { type Table } from 'dexie';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { Logger } from '@/libs/logger/logger';
import { isPubchiEnabled } from '@/libs/pubchi/flags';
import { type PubchiBindingRecord, pubchiBindingTableSchema } from '@/models/pubchi/binding.schema';
import { type PubchiDeviceKeyRecord, pubchiDeviceKeyTableSchema } from '@/models/pubchi/device-key.schema';
import { type PubchiDraftPostRecord, pubchiDraftPostTableSchema } from '@/models/pubchi/draft-post.schema';
import { pubchiFeedProvenanceTableSchema } from '@/models/pubchi/feed-provenance.schema';
import {
  type PubchiTagApplicationRecord,
  pubchiTagApplicationTableSchema,
} from '@/models/pubchi/tag-application.schema';

const blockedListeners = new Set<(blocked: boolean) => void>();
let databaseBlocked = false;
function publishDatabaseBlocked(blocked: boolean): void {
  databaseBlocked = blocked;
  for (const listener of blockedListeners) listener(blocked);
}
export function subscribePubchiDatabaseBlocked(listener: (blocked: boolean) => void): () => void {
  blockedListeners.add(listener);
  listener(databaseBlocked);
  return () => {
    blockedListeners.delete(listener);
  };
}

/**
 * Isolated IndexedDB for Phase 0 Pubchi bindings. Separate from franky so the
 * flagged spike does not bump `NEXT_PUBLIC_DB_VERSION` or recreate user data.
 */
class PubchiDatabase extends Dexie {
  bindings!: Table<PubchiBindingRecord>;
  deviceKeys!: Table<PubchiDeviceKeyRecord>;
  tagApplications!: Table<PubchiTagApplicationRecord>;
  draftPosts!: Table<PubchiDraftPostRecord>;

  constructor() {
    super('pubchi');
    this.version(2).stores({
      bindings: pubchiBindingTableSchema,
      deviceKeys: pubchiDeviceKeyTableSchema,
    });
    this.version(3).stores({
      bindings: pubchiBindingTableSchema,
      deviceKeys: pubchiDeviceKeyTableSchema,
      feedProvenance: pubchiFeedProvenanceTableSchema,
    });
    this.version(4).stores({
      bindings: pubchiBindingTableSchema,
      deviceKeys: pubchiDeviceKeyTableSchema,
      feedProvenance: null,
    });
    this.version(5).stores({
      bindings: pubchiBindingTableSchema,
      deviceKeys: pubchiDeviceKeyTableSchema,
      tagApplications: pubchiTagApplicationTableSchema,
    });
    this.version(6).stores({
      bindings: pubchiBindingTableSchema,
      deviceKeys: pubchiDeviceKeyTableSchema,
      tagApplications: pubchiTagApplicationTableSchema,
      draftPosts: pubchiDraftPostTableSchema,
    });

    let blockedRetryTimer: ReturnType<typeof setTimeout> | undefined;
    let blockedLogged = false;
    const clearBlockedState = () => {
      if (blockedRetryTimer) clearTimeout(blockedRetryTimer);
      blockedRetryTimer = undefined;
      blockedLogged = false;
      publishDatabaseBlocked(false);
    };
    const retryOpen = () => {
      if (this.isOpen()) {
        clearBlockedState();
        return;
      }
      void this.open()
        .then(clearBlockedState)
        .catch(() => {
          blockedRetryTimer = setTimeout(retryOpen, 1_000);
        });
    };
    this.on('versionchange', () => {
      this.close();
    });
    this.on('ready', clearBlockedState);
    this.on('blocked', () => {
      if (!blockedLogged) {
        blockedLogged = true;
        Logger.warn('Pubchi database upgrade is blocked by another tab');
      }
      publishDatabaseBlocked(true);
      if (!blockedRetryTimer) blockedRetryTimer = setTimeout(retryOpen, 1_000);
    });
  }
}

let instance: PubchiDatabase | null = null;

export function getPubchiDatabase(): PubchiDatabase {
  if (!isPubchiEnabled()) {
    throw Err.database(DatabaseErrorCode.INIT_FAILED, 'Pubchi local database is closed while the flag is off', {
      service: ErrorService.Pubchi,
      operation: 'getPubchiDatabase',
    });
  }
  if (!instance) {
    instance = new PubchiDatabase();
  }
  return instance;
}

export function resetPubchiDatabaseForTests(): void {
  instance = null;
  publishDatabaseBlocked(false);
}

/**
 * Drop the isolated `pubchi` IndexedDB. Does not call `getPubchiDatabase()`,
 * so it will not throw when the feature flag is off.
 */
export async function deletePubchiDatabase(): Promise<void> {
  try {
    await Dexie.delete('pubchi');
  } finally {
    instance = null;
  }
}

export async function clearPubchiOwnerData(owner: string, isCurrent: () => boolean = () => true): Promise<void> {
  if (!isCurrent() || !(await Dexie.exists('pubchi')) || !isCurrent()) return;
  // Open the known database for cleanup even when the feature was disabled.
  const db = instance ?? new PubchiDatabase();
  const temporary = db !== instance;
  try {
    await db.transaction('rw', [db.bindings, db.deviceKeys, db.tagApplications, db.draftPosts], async () => {
      if (!isCurrent()) return;
      await Promise.all([
        db.bindings.where('owner').equals(owner).delete(),
        db.deviceKeys.where('owner').equals(owner).delete(),
        db.tagApplications.where('owner').equals(owner).delete(),
        db.draftPosts.where('owner').equals(owner).delete(),
      ]);
    });
  } finally {
    if (temporary) db.close();
  }
}

export async function getPubchiDeviceSignersForCleanup(owner: string): Promise<{ signer: string }[]> {
  if (!(await Dexie.exists('pubchi'))) return [];
  const db = instance ?? new PubchiDatabase();
  const temporary = db !== instance;
  try {
    return (await db.deviceKeys.where('owner').equals(owner).toArray()).map(({ signer }) => ({ signer }));
  } finally {
    if (temporary) db.close();
  }
}
