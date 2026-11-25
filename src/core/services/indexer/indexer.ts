import { liveQuery } from 'dexie';
import { INDEXER_DATABASE_PREFIX, INDEXER_VISITOR_DATABASE } from '@/config/indexer';
import { browserApis, type BrowserCoordination, createBrowserCoordination } from '@/libs/indexer/browserCoordination';
import { createIdbStore, type IdbIndexStore } from '@/libs/indexer/idbStore';
import type { RuntimeStatus } from '@/libs/indexer/runtime.types';
import type { SocialData } from '@/libs/indexer/social/social.types';
import { createSocialIndexer, type SocialChange, type SocialIndexer } from '@/libs/indexer/social/socialIndexer';
import { Logger } from '@/libs/logger/logger';
import { markPhase } from '@/libs/timing/timing';
import type { Pubky } from '@/models/models.types';
import { UserStreamTypes } from '@/models/stream/user/userStream.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { postStreamDirtyRegistry } from '@/services/local/stream/posts/postStreamDirtyRegistry';
import { LocalStreamUsersService } from '@/services/local/stream/users/users';
import { clearLocalMedia, serveLocalMedia } from './indexer.media';
import { createIndexerTransport } from './indexer.transport';

const databaseName = (owner: Pubky | null) =>
  owner === null ? INDEXER_VISITOR_DATABASE : `${INDEXER_DATABASE_PREFIX}${owner}`;

const PUBLIC_PATH_PREFIX = '/pub/';

type RunningIndex = {
  /** `null` for a signed-out visitor. */
  owner: Pubky | null;
  indexer: SocialIndexer;
  store: IdbIndexStore<SocialData>;
  coordination: BrowserCoordination | null;
  unsubscribe: () => void;
};

/**
 * Marks dirty the cached post streams a change of the index can reach; each rebuilds on its next initial load and
 * mounted feeds keep their position. Posts and tags can land anywhere in any stream. Follows alone reach only the
 * streams whose membership follows the graph. A profile reaches no post stream. A change of members brings both.
 */
function invalidatePostStreams({ kinds }: SocialChange): void {
  if (kinds.includes('activity')) {
    postStreamDirtyRegistry.markDirty('local_index');
  } else if (kinds.includes('graph')) {
    postStreamDirtyRegistry.markDirty('follow_graph');
    postStreamDirtyRegistry.markDirty('friends');
  }
}

/**
 * Keeps the account's muted users, and whoever the index reaches only through them, out of its answers. The local
 * muted stream is where a mute, its rollback and the homeserver poll all land, so watching it follows each of them.
 */
function excludeMutedUsers(indexer: SocialIndexer): () => void {
  const subscription = liveQuery(() => LocalStreamUsersService.findById(UserStreamTypes.MUTED)).subscribe({
    next: (muted) => indexer.setExcluded(muted?.stream ?? []),
    error: (error: unknown) => Logger.debug('Muted users not read for the local index', { error }),
  });
  return () => subscription.unsubscribe();
}

/**
 * The local index of the signed-in account: one `SocialIndexer` per tab, crawling the account's social scope from
 * homeservers into its own IndexedDB database and answering Nexus reads from it. Tabs of one account share the
 * database; only the tab holding the browser lock crawls. A signed-out visitor gets an index without a scope, which
 * loads the posts and profiles opened, in a database of its own.
 */
export class IndexerService {
  private constructor() {}

  private static running: RunningIndex | null = null;

  /** The running index's last status, kept so readers get the same object until it changes. */
  private static latestStatus: RuntimeStatus | null = null;

  private static readonly statusListeners = new Set<() => void>();

  private static publishStatus(status: RuntimeStatus | null): void {
    this.latestStatus = status;
    for (const listener of this.statusListeners) listener();
  }

  /**
   * Starts `owner`'s index, or a visitor's for `null`, keeping it when it already runs; another index stops first. A
   * visitor's index that gives way to an account's is deleted: what it loaded is no use to the account.
   */
  static start(owner: Pubky | null): void {
    if (this.running !== null && this.running.owner === owner) return;
    const leavesVisitor = this.running?.owner === null && owner !== null;
    this.stop();
    if (leavesVisitor) {
      void createIdbStore<SocialData>(INDEXER_VISITOR_DATABASE)
        .destroy()
        .catch((error: unknown) => Logger.debug('Visitor index not deleted', { error }));
    }
    const store = createIdbStore<SocialData>(databaseName(owner));
    // Scoped by the database: tabs of two accounts in one browser must not hear each other. A visitor's tabs each load
    // on their own.
    const coordination = owner === null ? null : createBrowserCoordination(browserApis(), databaseName(owner));
    const indexer = createSocialIndexer({
      transport: createIndexerTransport(owner),
      store,
      now: () => Date.now(),
      coordination,
      // The account's other devices start warm from the file this one saves under its private tree; a visitor has none.
      options: { savedIndex: owner !== null },
    });
    // Every app write lands through HomeserverService; a refresh of the account makes it part of the answers.
    const stopRefreshing =
      owner === null
        ? () => {}
        : HomeserverService.subscribeOwnedWrites((path) => {
            if (!path.startsWith(PUBLIC_PATH_PREFIX)) return;
            void indexer
              .refresh([owner])
              .catch((error: unknown) => Logger.debug('Local index refresh ended', { error }));
          });
    const stopInvalidating = indexer.onChange(invalidatePostStreams);
    const stopExcluding = owner === null ? () => {} : excludeMutedUsers(indexer);
    // Without Nexus, avatars and attachments are same-origin paths the service worker asks this page to fill.
    const stopServingMedia = serveLocalMedia({
      profile: (user) => indexer.view().profile(user),
      ensureProfile: (user) => indexer.ensureProfile(user),
      readFile: (uri) => HomeserverService.getPublicFileBytes({ url: uri }),
    });
    const stopReporting = indexer.onStatus((status) => this.publishStatus(status));
    const startedAt = Date.now();
    indexer.start(owner);
    // Timings of a start, which say whether a slow first page waited on the index or on something else
    void indexer.ready().then(() => {
      markPhase(owner === null ? 'visitor index ready' : 'local index ready');
      Logger.debug('Local index ready', { owner, ms: Date.now() - startedAt });
    });
    void indexer.whenSynced().then(() => {
      if (owner !== null) markPhase('local index first sync');
      Logger.debug('Local index first sync settled', {
        owner,
        ms: Date.now() - startedAt,
        stats: indexer.status().stats,
      });
    });
    this.running = {
      owner,
      indexer,
      store,
      coordination,
      unsubscribe: () => {
        stopRefreshing();
        stopInvalidating();
        stopExcluding();
        stopServingMedia();
        stopReporting();
      },
    };
    this.publishStatus(indexer.status());
  }

  /** Stops the running index and closes its database and tab channel; what it stored stays for the next start. */
  static stop(): void {
    const running = this.running;
    if (!running) return;
    this.running = null;
    running.unsubscribe();
    running.indexer.stop();
    // The indexer never closes the coordination it was given.
    running.coordination?.close();
    running.store.close();
    this.publishStatus(null);
  }

  /** The running index's status, the same object until it changes; `null` when this tab runs none. */
  static status(): RuntimeStatus | null {
    return this.latestStatus;
  }

  /** Calls `listener` after each status change of the running index, and when an index starts or stops. */
  static subscribeStatus(listener: () => void): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  /** Syncs the running index's whole scope now; settles at once when none runs. */
  static async refresh(): Promise<void> {
    await this.running?.indexer.refresh();
  }

  /** Lets the running crawl finish and starts no other until `resume`; with other tabs open, one of them crawls. */
  static pause(): void {
    this.running?.indexer.pause();
  }

  static resume(): void {
    this.running?.indexer.resume();
  }

  /**
   * Deletes `owner`'s index database, or a visitor's for `null`, and the media the service worker kept, stopping the
   * index first when it runs.
   */
  static async clear(owner: Pubky | null): Promise<void> {
    if (this.running?.owner === owner) this.stop();
    await Promise.all([createIdbStore<SocialData>(databaseName(owner)).destroy(), clearLocalMedia()]);
  }

  /** The running index, a visitor's included, `null` when this tab runs none. */
  static current(): SocialIndexer | null {
    return this.running?.indexer ?? null;
  }
}
