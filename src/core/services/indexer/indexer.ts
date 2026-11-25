import { INDEXER_DATABASE_PREFIX, INDEXER_VISITOR_DATABASE } from '@/config/indexer';
import { browserApis, createBrowserCoordination } from '@/libs/indexer/browserCoordination';
import { createIdbStore, type IdbIndexStore } from '@/libs/indexer/idbStore';
import type { SocialData } from '@/libs/indexer/social/social.types';
import { createSocialIndexer, type SocialIndexer } from '@/libs/indexer/social/socialIndexer';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { postStreamDirtyRegistry } from '@/services/local/stream/posts/postStreamDirtyRegistry';
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
  unsubscribe: () => void;
};

/**
 * The local index of the signed-in account: one `SocialIndexer` per tab, crawling the account's social scope from
 * homeservers into its own IndexedDB database and answering Nexus reads from it. Tabs of one account share the
 * database; only the tab holding the browser lock crawls. A signed-out visitor gets an index without a scope, which
 * loads the posts and profiles opened, in a database of its own.
 */
export class IndexerService {
  private constructor() {}

  private static running: RunningIndex | null = null;

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
    const indexer = createSocialIndexer({
      transport: createIndexerTransport(owner),
      store,
      now: () => Date.now(),
      // Scoped by the database: tabs of two accounts in one browser must not hear each other. A visitor's tabs each
      // load on their own.
      coordination: owner === null ? null : createBrowserCoordination(browserApis(), databaseName(owner)),
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
    // A sync or older history can place posts anywhere in a cached stream page: each stream rebuilds on its next
    // initial load, and mounted feeds keep their position.
    const stopInvalidating = indexer.onChange(() => postStreamDirtyRegistry.markDirty('local_index'));
    // Without Nexus, avatars and attachments are same-origin paths the service worker asks this page to fill.
    const stopServingMedia = serveLocalMedia({
      profile: (user) => indexer.view().profile(user),
      ensureProfile: (user) => indexer.ensureProfile(user),
      readFile: (uri) => HomeserverService.getPublicFileBytes({ url: uri }),
    });
    indexer.start(owner);
    this.running = {
      owner,
      indexer,
      store,
      unsubscribe: () => {
        stopRefreshing();
        stopInvalidating();
        stopServingMedia();
      },
    };
  }

  /** Stops the running index and closes its database; what it stored stays for the next start. */
  static stop(): void {
    const running = this.running;
    if (!running) return;
    this.running = null;
    running.unsubscribe();
    running.indexer.stop();
    running.store.close();
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
