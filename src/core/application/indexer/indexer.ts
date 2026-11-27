import type { RuntimeStatus } from '@/libs/indexer/runtime.types';
import type { Pubky } from '@/models/models.types';
import { IndexerService } from '@/services/indexer/indexer';

/** The local index's lifecycle: the account it crawls for or a visitor, page visibility and sign-out. */
export class IndexerApplication {
  private constructor() {}

  /** Starts the account's index, or a signed-out visitor's for `null`. */
  static start(pubky: Pubky | null): void {
    IndexerService.start(pubky);
  }

  static stop(): void {
    IndexerService.stop();
  }

  static pause(): void {
    IndexerService.pause();
  }

  static resume(): void {
    IndexerService.resume();
  }

  static getStatus(): RuntimeStatus | null {
    return IndexerService.status();
  }

  static subscribeStatus(listener: () => void): () => void {
    return IndexerService.subscribeStatus(listener);
  }

  static async refresh(): Promise<void> {
    await IndexerService.refresh();
  }

  /** Deletes the account's index database, or a visitor's for `null`, as sign-out deletes the app's own. */
  static async clear(pubky: Pubky | null): Promise<void> {
    await IndexerService.clear(pubky);
  }
}
