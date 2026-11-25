import type { Pubky } from '@/models/models.types';
import { IndexerService } from '@/services/indexer/indexer';

/** The local index's lifecycle: the account it crawls for, page visibility and sign-out. */
export class IndexerApplication {
  private constructor() {}

  static start(pubky: Pubky): void {
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

  /** Deletes the account's index database, as sign-out deletes the app's own. */
  static async clear(pubky: Pubky): Promise<void> {
    await IndexerService.clear(pubky);
  }
}
