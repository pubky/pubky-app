import { hasLocalIndexSource } from '@/config/nexus';
import { IndexerController } from '@/controllers/indexer/indexer';
import { getStreamRespectPageVisibility } from '@/libs/runtime-config/runtime-config';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';

/**
 * Runs the local index for the signed-in account while `PUBKY_RUNTIME_INDEXER_SOURCES` includes `local`.
 *
 * - Starts it the moment a session enters the auth store, which happens after the social v1 migration gate and
 *   before the profile bootstrap, so the bootstrap read already finds it; stops it when the session leaves.
 * - Pauses it while the tab is hidden, under the same visibility setting as the stream poller, and resumes it when
 *   the tab comes back. Its own loop syncs every minute, so there is no interval here.
 * - Sign-out deletes the index database (`AuthController`); a stop keeps it for the next session.
 */
export class IndexerCoordinator {
  private static instance: IndexerCoordinator | null = null;

  private unsubscribe: (() => void) | null = null;
  private owner: Pubky | null = null;

  static getInstance(): IndexerCoordinator {
    return (this.instance ??= new IndexerCoordinator());
  }

  static resetInstance(): void {
    this.instance?.stop();
    this.instance = null;
  }

  start(): void {
    if (this.unsubscribe || !hasLocalIndexSource()) return;
    this.unsubscribe = useAuthStore.subscribe(this.follow);
    document.addEventListener('visibilitychange', this.applyVisibility);
    this.follow();
  }

  stop(): void {
    if (!this.unsubscribe) return;
    this.unsubscribe();
    this.unsubscribe = null;
    document.removeEventListener('visibilitychange', this.applyVisibility);
    this.owner = null;
    IndexerController.stopLocalIndex();
  }

  private follow = () => {
    const { session, currentUserPubky } = useAuthStore.getState();
    const owner = session && currentUserPubky ? currentUserPubky : null;
    if (owner === this.owner) return;
    this.owner = owner;
    if (owner === null) {
      IndexerController.stopLocalIndex();
      return;
    }
    IndexerController.startLocalIndex(owner);
    this.applyVisibility();
  };

  private applyVisibility = () => {
    if (this.owner === null || !getStreamRespectPageVisibility()) return;
    if (document.visibilityState === 'hidden') IndexerController.pauseLocalIndex();
    else IndexerController.resumeLocalIndex();
  };
}
