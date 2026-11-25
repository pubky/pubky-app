import { hasLocalIndexSource } from '@/config/nexus';
import { IndexerController } from '@/controllers/indexer/indexer';
import { getStreamRespectPageVisibility } from '@/libs/runtime-config/runtime-config';
import type { Pubky } from '@/models/models.types';
import { selectDisplayUserPubky } from '@/stores/auth/auth.selectors';
import { useAuthStore } from '@/stores/auth/auth.store';

/**
 * Runs the local index for the signed-in account while `PUBKY_RUNTIME_INDEXER_SOURCES` includes `local`, and a
 * visitor's index, with no scope, otherwise.
 *
 * - Runs the account's index while its session is in the auth store or being restored, so the pages a reload opens
 *   read what the account's index stored rather than a visitor's answers. Its crawl is anonymous; its saved index
 *   file waits for the session (the library reads it again after a sync when it could not). A browser without an
 *   account, an account held behind the social v1 migration gate, or one whose restore failed runs the visitor's, so
 *   shared posts and profiles render signed out; the switch to an account deletes it.
 * - Pauses it while the tab is hidden, under the same visibility setting as the stream poller, and resumes it when
 *   the tab comes back. Its own loop syncs every minute, so there is no interval here.
 * - Sign-out deletes the index database (`AuthController`); a stop keeps it for the next session.
 * - Without `local` among the sources, it only deletes the database an earlier `local` deploy left for the visitor
 *   and for each account that signs in, best effort and without waiting.
 */
export class IndexerCoordinator {
  private static instance: IndexerCoordinator | null = null;

  private unsubscribe: (() => void) | null = null;
  /** The index this coordinator runs: an account's, a visitor's (`null`), or none yet (`undefined`). */
  private owner: Pubky | null | undefined = undefined;

  static getInstance(): IndexerCoordinator {
    return (this.instance ??= new IndexerCoordinator());
  }

  static resetInstance(): void {
    this.instance?.stop();
    this.instance = null;
  }

  start(): void {
    if (this.unsubscribe) return;
    if (!hasLocalIndexSource()) {
      this.unsubscribe = useAuthStore.subscribe(this.discardLeftover);
      this.discardLeftover();
      return;
    }
    this.unsubscribe = useAuthStore.subscribe(this.follow);
    document.addEventListener('visibilitychange', this.applyVisibility);
    this.follow();
  }

  stop(): void {
    if (!this.unsubscribe) return;
    this.unsubscribe();
    this.unsubscribe = null;
    document.removeEventListener('visibilitychange', this.applyVisibility);
    this.owner = undefined;
    IndexerController.stopLocalIndex();
  }

  /** The account the app reads as: none behind the migration gate (ADR-0026) or after a failed restore. */
  private signedInOwner(): Pubky | null {
    const state = useAuthStore.getState();
    return state.restoreStatus === 'social-migration' ? null : selectDisplayUserPubky(state);
  }

  private discardLeftover = () => {
    const owner = this.signedInOwner();
    if (owner === this.owner) return;
    this.owner = owner;
    IndexerController.discardLocalIndex(owner);
  };

  private follow = () => {
    const owner = this.signedInOwner();
    if (owner === this.owner) return;
    this.owner = owner;
    IndexerController.startLocalIndex(owner);
    this.applyVisibility();
  };

  private applyVisibility = () => {
    if (this.owner === undefined || !getStreamRespectPageVisibility()) return;
    if (document.visibilityState === 'hidden') IndexerController.pauseLocalIndex();
    else IndexerController.resumeLocalIndex();
  };
}
