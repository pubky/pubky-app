import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IndexerController } from '@/controllers/indexer/indexer';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { mockGrantReference, mockSession } from '@/test-utils/pubky';
import { IndexerCoordinator } from './indexer';

const config = vi.hoisted(() => ({ local: true, respectVisibility: true }));

vi.mock('@/controllers/indexer/indexer', () => ({
  IndexerController: {
    startLocalIndex: vi.fn(),
    stopLocalIndex: vi.fn(),
    pauseLocalIndex: vi.fn(),
    resumeLocalIndex: vi.fn(),
    discardLocalIndex: vi.fn(),
  },
}));
vi.mock('@/config/nexus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/nexus')>()),
  hasLocalIndexSource: () => config.local,
}));
vi.mock('@/libs/runtime-config/runtime-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/libs/runtime-config/runtime-config')>()),
  getStreamRespectPageVisibility: () => config.respectVisibility,
}));

const ALICE = 'alice-pubky' as Pubky;
const BOB = 'bob-pubky' as Pubky;
let visibility: DocumentVisibilityState = 'visible';

function setVisibility(state: DocumentVisibilityState) {
  visibility = state;
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('IndexerCoordinator', () => {
  const coordinator = IndexerCoordinator.getInstance();

  beforeEach(() => {
    coordinator.stop();
    vi.clearAllMocks();
    config.local = true;
    config.respectVisibility = true;
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    useAuthStore.setState({ ...authInitialState });
  });

  afterEach(() => {
    coordinator.stop();
    vi.restoreAllMocks();
  });

  it('runs no index while the local index is not a configured source', () => {
    config.local = false;
    useAuthStore.setState({ session: mockSession(), currentUserPubky: ALICE });

    coordinator.start();
    setVisibility('hidden');

    expect(IndexerController.startLocalIndex).not.toHaveBeenCalled();
    expect(IndexerController.pauseLocalIndex).not.toHaveBeenCalled();
  });

  it('deletes the index an earlier local deploy left, the visitor’s and once per account that signs in, without the source', () => {
    config.local = false;
    coordinator.start();
    expect(IndexerController.discardLocalIndex).toHaveBeenCalledExactlyOnceWith(null);

    useAuthStore.setState({ session: mockSession(), currentUserPubky: ALICE });
    useAuthStore.setState({ hasProfile: true });
    expect(IndexerController.discardLocalIndex).toHaveBeenLastCalledWith(ALICE);
    expect(IndexerController.discardLocalIndex).toHaveBeenCalledTimes(2);

    useAuthStore.setState({ session: mockSession(), currentUserPubky: BOB });
    expect(IndexerController.discardLocalIndex).toHaveBeenLastCalledWith(BOB);
    expect(IndexerController.discardLocalIndex).toHaveBeenCalledTimes(3);
  });

  it('never deletes the index while it is a source', () => {
    useAuthStore.setState({ session: mockSession(), currentUserPubky: ALICE });

    coordinator.start();

    expect(IndexerController.discardLocalIndex).not.toHaveBeenCalled();
  });

  it('runs the visitor’s index without a session, and the account’s once per account while a session is in', () => {
    coordinator.start();
    expect(IndexerController.startLocalIndex).toHaveBeenCalledExactlyOnceWith(null);

    useAuthStore.setState({ currentUserPubky: ALICE });
    expect(IndexerController.startLocalIndex).toHaveBeenCalledOnce();
    useAuthStore.setState({ session: mockSession() });
    useAuthStore.setState({ hasProfile: true });
    expect(IndexerController.startLocalIndex).toHaveBeenLastCalledWith(ALICE);
    expect(IndexerController.startLocalIndex).toHaveBeenCalledTimes(2);

    useAuthStore.setState({ session: mockSession(), currentUserPubky: BOB });
    expect(IndexerController.startLocalIndex).toHaveBeenLastCalledWith(BOB);

    useAuthStore.setState({ session: null });
    expect(IndexerController.startLocalIndex).toHaveBeenLastCalledWith(null);
    expect(IndexerController.stopLocalIndex).not.toHaveBeenCalled();
  });

  it('runs the account’s index while its saved session restores, none behind the gate, and the visitor’s after a failed restore', () => {
    // A reload: the saved reference is in the store before the session is restored.
    useAuthStore.setState({ sessionReference: mockGrantReference(), currentUserPubky: ALICE, restoreStatus: 'idle' });
    coordinator.start();
    expect(IndexerController.startLocalIndex).toHaveBeenCalledExactlyOnceWith(ALICE);

    useAuthStore.setState({ restoreStatus: 'restoring' });
    useAuthStore.setState({ session: mockSession(), restoreStatus: 'ready' });
    expect(IndexerController.startLocalIndex).toHaveBeenCalledOnce();

    useAuthStore.setState({ session: null, restoreStatus: 'social-migration' });
    expect(IndexerController.stopLocalIndex).toHaveBeenCalledOnce();
    expect(IndexerController.startLocalIndex).toHaveBeenCalledOnce();

    useAuthStore.setState({ restoreStatus: 'restoring' });
    expect(IndexerController.startLocalIndex).toHaveBeenLastCalledWith(ALICE);

    useAuthStore.setState({ restoreStatus: 'temporary-error' });
    expect(IndexerController.startLocalIndex).toHaveBeenLastCalledWith(null);
    expect(IndexerController.startLocalIndex).toHaveBeenCalledTimes(3);
  });

  it('starts no visitor’s index behind the gate of a first sign-in', () => {
    coordinator.start();
    expect(IndexerController.startLocalIndex).toHaveBeenCalledExactlyOnceWith(null);

    // A fresh grant: the identity is committed, then the gate asks before the session enters the store.
    useAuthStore.setState({
      sessionReference: mockGrantReference(),
      currentUserPubky: ALICE,
      restoreStatus: 'restoring',
    });
    useAuthStore.setState({ restoreStatus: 'social-migration' });
    useAuthStore.setState({ session: mockSession(), restoreStatus: 'restoring' });

    expect(vi.mocked(IndexerController.startLocalIndex).mock.calls).toEqual([[null], [ALICE], [ALICE]]);
    expect(IndexerController.stopLocalIndex).toHaveBeenCalledOnce();
  });

  it('starts for a session already in the store, and stops the index with the coordinator', () => {
    useAuthStore.setState({ session: mockSession(), currentUserPubky: ALICE });

    coordinator.start();
    coordinator.stop();
    useAuthStore.setState({ session: null });

    expect(IndexerController.startLocalIndex).toHaveBeenCalledExactlyOnceWith(ALICE);
    expect(IndexerController.stopLocalIndex).toHaveBeenCalledOnce();
  });

  it('pauses the index while the tab is hidden and resumes it when it comes back', () => {
    visibility = 'hidden';
    useAuthStore.setState({ session: mockSession(), currentUserPubky: ALICE });

    coordinator.start();
    expect(IndexerController.pauseLocalIndex).toHaveBeenCalledOnce();

    setVisibility('visible');
    expect(IndexerController.resumeLocalIndex).toHaveBeenCalledOnce();
  });

  it('keeps crawling in a hidden tab when the visibility setting is off', () => {
    config.respectVisibility = false;
    useAuthStore.setState({ session: mockSession(), currentUserPubky: ALICE });
    coordinator.start();

    setVisibility('hidden');

    expect(IndexerController.pauseLocalIndex).not.toHaveBeenCalled();
  });
});
