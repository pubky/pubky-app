import { IndexerApplication } from '@/application/indexer/indexer';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';

/** Entry point of the local index's lifecycle for `IndexerCoordinator`. */
export class IndexerController {
  private constructor() {}

  /** Starts the account's local index; a no-op while it already runs for that account. */
  static startLocalIndex(pubky: Pubky): void {
    IndexerApplication.start(pubky);
  }

  static stopLocalIndex(): void {
    IndexerApplication.stop();
  }

  static pauseLocalIndex(): void {
    IndexerApplication.pause();
  }

  static resumeLocalIndex(): void {
    IndexerApplication.resume();
  }

  /** Deletes an index database left from a deploy that read from the local index; never waited on, never throws. */
  static discardLocalIndex(pubky: Pubky): void {
    void IndexerApplication.clear(pubky).catch((error: unknown) =>
      Logger.debug('Leftover local index not deleted', { error }),
    );
  }
}
