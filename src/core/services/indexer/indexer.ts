import { INDEXER_DATABASE_PREFIX } from '@/config/indexer';
import { createBrowserCoordination } from '@/libs/indexer/browserCoordination';
import { createIdbStore, type IdbIndexStore } from '@/libs/indexer/idbStore';
import type { SocialData } from '@/libs/indexer/social/social.types';
import { createSocialIndexer, type SocialIndexer } from '@/libs/indexer/social/socialIndexer';
import type { Pubky } from '@/models/models.types';
import { createIndexerTransport } from './indexer.transport';

const databaseName = (owner: Pubky) => `${INDEXER_DATABASE_PREFIX}${owner}`;

type RunningIndex = {
  owner: Pubky;
  indexer: SocialIndexer;
  store: IdbIndexStore<SocialData>;
};

/**
 * The local index of the signed-in account: one `SocialIndexer` per tab, crawling the account's social scope from
 * homeservers into its own IndexedDB database and answering Nexus reads from it. Tabs of one account share the
 * database; only the tab holding the browser lock crawls.
 */
export class IndexerService {
  private constructor() {}

  private static running: RunningIndex | null = null;

  /** Starts `owner`'s index, keeping it when it already runs; another account's index stops first. */
  static start(owner: Pubky): void {
    if (this.running?.owner === owner) return;
    this.stop();
    const store = createIdbStore<SocialData>(databaseName(owner));
    const indexer = createSocialIndexer({
      transport: createIndexerTransport(owner),
      store,
      now: () => Date.now(),
      coordination: createBrowserCoordination(),
    });
    indexer.start(owner);
    this.running = { owner, indexer, store };
  }

  /** Stops the running index and closes its database; what it stored stays for the next start. */
  static stop(): void {
    const running = this.running;
    if (!running) return;
    this.running = null;
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

  /** Deletes `owner`'s index database, stopping the index first when it runs. */
  static async clear(owner: Pubky): Promise<void> {
    if (this.running?.owner === owner) this.stop();
    await createIdbStore<SocialData>(databaseName(owner)).destroy();
  }

  /** The running index, `null` when this tab runs none. */
  static current(): SocialIndexer | null {
    return this.running?.indexer ?? null;
  }
}
