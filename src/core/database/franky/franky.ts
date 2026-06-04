import Dexie from 'dexie';
import { DB_INIT_MAX_ATTEMPTS, DB_INIT_RETRY_BASE_DELAY_MS, DB_NAME, DB_VERSION } from '@/config/database';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { Logger } from '@/libs/logger/logger';
import { type BookmarkModelSchema, bookmarkTableSchema } from '@/models/bookmark/bookmark.schema';
import { type FeedModelSchema, feedTableSchema } from '@/models/feed/feed.schema';
import { type FileDetailsModelSchema, fileDetailsTableSchema } from '@/models/file/fileDetails.schema';
import { type HotTagsModelSchema, hotTagsTableSchema } from '@/models/hot/hot.schema';
import type { Pubky } from '@/models/models.types';
import { type ModerationModelSchema, moderationTableSchema } from '@/models/moderation/moderation.schema';
import { notificationTableSchema } from '@/models/notification/notification.schema';
import type { FlatNotification } from '@/models/notification/notification.types';
import { type PostCountsModelSchema, postCountsTableSchema } from '@/models/post/counts/postCounts.schema';
import { type PostDetailsModelSchema, postDetailsTableSchema } from '@/models/post/details/postDetails.schema';
import {
  type PostRelationshipsModelSchema,
  postRelationshipsTableSchema,
} from '@/models/post/relationships/postRelationships.schema';
import { type PostTtlModelSchema, postTtlTableSchema } from '@/models/post/ttl/postTtl.schema';
import { type TagCollectionModelSchema, tagCollectionTableSchema } from '@/models/shared/tag/tag.schema';
import { type PostStreamModelSchema, postStreamTableSchema } from '@/models/stream/post/postStream.schema';
import { type TagStreamModelSchema, tagStreamTableSchema } from '@/models/stream/tag/tagStream.schema';
import { type UserStreamModelSchema, userStreamTableSchema } from '@/models/stream/user/userStream.schema';
import {
  type UserConnectionsModelSchema,
  userConnectionsTableSchema,
} from '@/models/user/connections/userConnections.schema';
import { type UserCountsModelSchema, userCountsTableSchema } from '@/models/user/counts/userCounts.schema';
import { type UserDetailsModelSchema, userDetailsTableSchema } from '@/models/user/details/userDetails.schema';
import {
  type UserRelationshipsModelSchema,
  userRelationshipsTableSchema,
} from '@/models/user/relationships/userRelationships.schema';
import { type UserTtlModelSchema, userTtlTableSchema } from '@/models/user/ttl/userTtl.schema';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * WebKit/iOS Safari throws these (often as the `cause` of a wrapped AppError) when an
 * IndexedDB connection is severed mid-operation rather than because of a real data problem.
 * These failures are typically transient and recover on a fresh open attempt.
 */
const TRANSIENT_INDEXED_DB_ERROR_NAMES = new Set(['UnknownError', 'AbortError']);
const TRANSIENT_INDEXED_DB_ERROR_PATTERNS = [
  'connection to indexed database server lost',
  'database deleted by request of the user',
  'transaction aborted',
  'in-progress transaction',
];

/**
 * Walks the `cause` chain of a thrown value and reports whether any link looks like a
 * transient IndexedDB failure (as opposed to a deterministic schema/logic error).
 *
 * Used by `initialize()` below; exported (not module-private) for direct unit testing and
 * for reuse on the post-init write path (see PUBKY-APP-34).
 */
export function isTransientIndexedDbError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);

    const name = typeof (current as { name?: unknown }).name === 'string' ? (current as { name: string }).name : '';
    const message =
      typeof (current as { message?: unknown }).message === 'string' ? (current as { message: string }).message : '';
    const haystack = `${name} ${message}`.toLowerCase();

    if (TRANSIENT_INDEXED_DB_ERROR_NAMES.has(name)) return true;
    if (TRANSIENT_INDEXED_DB_ERROR_PATTERNS.some((pattern) => haystack.includes(pattern))) return true;

    current = (current as { cause?: unknown }).cause;
  }

  return false;
}

export class AppDatabase extends Dexie {
  private static readonly DEXIE_VERSION_MULTIPLIER = 10;

  // User
  user_counts!: Dexie.Table<UserCountsModelSchema>;
  user_details!: Dexie.Table<UserDetailsModelSchema>;
  user_relationships!: Dexie.Table<UserRelationshipsModelSchema>;
  user_tags!: Dexie.Table<TagCollectionModelSchema<Pubky>>;
  user_connections!: Dexie.Table<UserConnectionsModelSchema>;
  user_ttl!: Dexie.Table<UserTtlModelSchema>;
  notifications!: Dexie.Table<FlatNotification>;
  // Post
  post_counts!: Dexie.Table<PostCountsModelSchema>;
  post_details!: Dexie.Table<PostDetailsModelSchema>;
  post_relationships!: Dexie.Table<PostRelationshipsModelSchema>;
  post_tags!: Dexie.Table<TagCollectionModelSchema<string>>;
  post_ttl!: Dexie.Table<PostTtlModelSchema>;
  // File
  file_details!: Dexie.Table<FileDetailsModelSchema>;
  // Streams
  post_streams!: Dexie.Table<PostStreamModelSchema>;
  unread_post_streams!: Dexie.Table<PostStreamModelSchema>;
  user_streams!: Dexie.Table<UserStreamModelSchema>;
  tag_streams!: Dexie.Table<TagStreamModelSchema>;
  // Bookmarks
  bookmarks!: Dexie.Table<BookmarkModelSchema>;
  // Hot tags
  hot_tags!: Dexie.Table<HotTagsModelSchema>;
  // Feeds
  feeds!: Dexie.Table<FeedModelSchema>;
  // Moderation
  moderation!: Dexie.Table<ModerationModelSchema>;

  constructor(databaseName: string = DB_NAME) {
    super(databaseName);

    try {
      this.version(DB_VERSION).stores({
        // User related tables
        user_counts: userCountsTableSchema,
        user_details: userDetailsTableSchema,
        user_relationships: userRelationshipsTableSchema,
        user_connections: userConnectionsTableSchema,
        user_ttl: userTtlTableSchema,
        user_tags: tagCollectionTableSchema,
        notifications: notificationTableSchema,
        // Post related tables
        post_counts: postCountsTableSchema,
        post_details: postDetailsTableSchema,
        post_relationships: postRelationshipsTableSchema,
        post_tags: tagCollectionTableSchema,
        post_ttl: postTtlTableSchema,
        // File related tables
        file_details: fileDetailsTableSchema,
        // Streams
        post_streams: postStreamTableSchema,
        unread_post_streams: postStreamTableSchema,
        user_streams: userStreamTableSchema,
        tag_streams: tagStreamTableSchema,
        // Bookmarks
        bookmarks: bookmarkTableSchema,
        // Hot tags
        hot_tags: hotTagsTableSchema,
        // Feeds
        feeds: feedTableSchema,
        // Moderation
        moderation: moderationTableSchema,
      });
    } catch (error) {
      throw Err.database(DatabaseErrorCode.SCHEMA_ERROR, 'Failed to initialize database schema of indexedDB', {
        service: ErrorService.Local,
        operation: 'constructor',
        cause: error,
      });
    }
  }

  private async getExistingDbVersion(): Promise<number | null> {
    return new Promise((resolve, reject) => {
      try {
        if (typeof indexedDB === 'undefined') {
          resolve(null);
          return;
        }

        const request = indexedDB.open(this.name);

        request.onerror = () => {
          if (request.error) {
            reject(request.error);
            return;
          }

          resolve(null);
        };

        request.onsuccess = () => {
          const version = request.result.version;
          request.result.close();
          resolve(typeof version === 'number' ? version : null);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private normalizeStoredVersion(version: number | null): number | null {
    if (version === null) {
      return null;
    }

    // Dexie always multiplies the version by 10 internally
    // If the version is >= 10, it's been multiplied by Dexie, so divide it back
    if (version >= AppDatabase.DEXIE_VERSION_MULTIPLIER) {
      return version / AppDatabase.DEXIE_VERSION_MULTIPLIER;
    }

    // If version is < 10, it's the raw user version (shouldn't happen in practice)
    return version;
  }

  private async recreateDatabase(currentVersion: number | null, rawVersion?: number | null) {
    try {
      this.close();

      if (typeof indexedDB !== 'undefined') {
        await new Promise<void>((resolve, reject) => {
          const deleteRequest = indexedDB.deleteDatabase(this.name);

          deleteRequest.onblocked = () => {
            Logger.warn(
              'Database deletion is blocked by open connections. Please close all other tabs/windows using this application.',
              {
                databaseName: this.name,
                hint: 'Close other browser tabs or windows that may be using this database',
              },
            );
          };

          deleteRequest.onsuccess = () => resolve();
          deleteRequest.onerror = () => reject(deleteRequest.error ?? new Error('Failed to delete database'));
        });
      } else {
        // Use Dexie.delete() which coordinates with other Dexie contexts
        await Dexie.delete(this.name);
      }
    } catch (error) {
      throw Err.database(DatabaseErrorCode.DELETE_FAILED, 'Failed to delete outdated database, indexedDB', {
        service: ErrorService.Local,
        operation: 'recreateDatabase',
        context: {
          currentVersion,
          rawVersion,
          expectedVersion: DB_VERSION,
          databaseName: this.name,
        },
        cause: error,
      });
    }

    try {
      // Note: expected new DB version is already set in the constructor this.version(DB_VERSION)
      await this.open();
      Logger.info('Database recreated with new schema');
    } catch (error) {
      throw Err.database(DatabaseErrorCode.INIT_FAILED, 'Failed to open database after recreation', {
        service: ErrorService.Local,
        operation: 'recreateDatabase',
        context: {
          version: DB_VERSION,
          rawVersion,
          databaseName: this.name,
        },
        cause: error,
      });
    }
  }

  async initialize(): Promise<{ wasDbReset: boolean }> {
    if (typeof indexedDB === 'undefined') {
      Logger.warn('IndexedDB is not available in this environment. Skipping database initialization.');
      return { wasDbReset: false };
    }

    for (let attempt = 1; ; attempt++) {
      try {
        const result = await this.runInitialize();

        // A prior retry may have called this.close(), which disables Dexie's auto-open.
        // runInitialize()'s version-match path returns without opening, so guarantee the
        // connection is open before reporting success — otherwise queries would throw
        // DatabaseClosedError even though initialization "succeeded". A transient failure
        // here is caught below and retried like any other.
        if (!this.isOpen()) {
          await this.open();
        }

        return result;
      } catch (error) {
        const isLastAttempt = attempt >= DB_INIT_MAX_ATTEMPTS;

        // iOS Safari / in-app browsers can drop the IndexedDB connection mid-open.
        // Reset Dexie's internal state and retry before surfacing a hard failure.
        if (!isLastAttempt && isTransientIndexedDbError(error)) {
          Logger.warn('Transient IndexedDB error during initialization. Retrying...', {
            attempt,
            maxAttempts: DB_INIT_MAX_ATTEMPTS,
          });
          this.close();
          await delay(DB_INIT_RETRY_BASE_DELAY_MS * attempt);
          continue;
        }

        if (error instanceof Error && error.name === 'AppError') throw error;

        throw Err.database(DatabaseErrorCode.INIT_FAILED, 'Failed to initialize database, indexedDB', {
          service: ErrorService.Local,
          operation: 'initialize',
          cause: error,
        });
      }
    }
  }

  private async runInitialize(): Promise<{ wasDbReset: boolean }> {
    const dbExists = await Dexie.exists(this.name);

    if (!dbExists) {
      Logger.info('Creating new database...');
      await this.open();
      return { wasDbReset: true };
    }

    let rawVersion: number | null = null;
    let currentVersion: number | null = null;

    try {
      rawVersion = await this.getExistingDbVersion();
      currentVersion = this.normalizeStoredVersion(rawVersion);
    } catch (error) {
      // A transient WebKit/iOS abort during the native version probe must NOT fall through to a
      // destructive recreateDatabase(). Re-throw so initialize()'s retry loop can recover the
      // connection; only genuinely unreadable versions (corruption) self-heal via recreate.
      if (isTransientIndexedDbError(error)) throw error;

      Logger.warn('Failed to determine current database version. Recreating database...', {
        error,
      });
    }

    if (currentVersion === null) {
      Logger.warn('Unable to determine current database version. Recreating database...');
      await this.recreateDatabase(currentVersion, rawVersion);
      return { wasDbReset: true };
    }

    if (currentVersion !== DB_VERSION) {
      Logger.info(`Database version mismatch. Current: ${currentVersion}, Expected: ${DB_VERSION}`, {
        rawVersion,
        normalizedVersion: currentVersion,
        expectedVersion: DB_VERSION,
        expectedInternalVersion: DB_VERSION * AppDatabase.DEXIE_VERSION_MULTIPLIER,
      });
      await this.recreateDatabase(currentVersion, rawVersion);
      return { wasDbReset: true };
    }

    Logger.debug('Database version is current');
    return { wasDbReset: false };
  }
}

export const db = new AppDatabase();
