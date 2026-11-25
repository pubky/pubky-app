import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IndexerController } from '@/controllers/indexer/indexer';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { mockSession } from '@/test-utils/pubky';
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

  it('deletes the index an earlier local deploy left, once per account that signs in, without the source', () => {
    config.local = false;
    coordinator.start();
    expect(IndexerController.discardLocalIndex).not.toHaveBeenCalled();

    useAuthStore.setState({ session: mockSession(), currentUserPubky: ALICE });
    useAuthStore.setState({ hasProfile: true });
    expect(IndexerController.discardLocalIndex).toHaveBeenCalledExactlyOnceWith(ALICE);

    useAuthStore.setState({ session: mockSession(), currentUserPubky: BOB });
    expect(IndexerController.discardLocalIndex).toHaveBeenLastCalledWith(BOB);
    expect(IndexerController.discardLocalIndex).toHaveBeenCalledTimes(2);
  });

  it('never deletes the index while it is a source', () => {
    useAuthStore.setState({ session: mockSession(), currentUserPubky: ALICE });

    coordinator.start();

    expect(IndexerController.discardLocalIndex).not.toHaveBeenCalled();
  });

  it('starts the index when a session enters the store, once per account, and stops it when it leaves', () => {
    coordinator.start();
    expect(IndexerController.startLocalIndex).not.toHaveBeenCalled();

    useAuthStore.setState({ currentUserPubky: ALICE });
    expect(IndexerController.startLocalIndex).not.toHaveBeenCalled();
    useAuthStore.setState({ session: mockSession() });
    useAuthStore.setState({ hasProfile: true });
    expect(IndexerController.startLocalIndex).toHaveBeenCalledExactlyOnceWith(ALICE);

    useAuthStore.setState({ session: mockSession(), currentUserPubky: BOB });
    expect(IndexerController.startLocalIndex).toHaveBeenLastCalledWith(BOB);

    useAuthStore.setState({ session: null });
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
