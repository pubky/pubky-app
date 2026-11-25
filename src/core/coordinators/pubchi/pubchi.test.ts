import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PubchiController } from '@/controllers/pubchi/pubchi';
import { PubchiCoordinator } from '@/coordinators/pubchi/pubchi';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { usePubchiStore } from '@/stores/pubchi/pubchi.store';
import { mockSession } from '@/test-utils/pubky';

vi.mock('@/libs/pubchi/flags', () => ({
  isPubchiEnabled: vi.fn(() => true),
  isPubchiPanelEnabled: vi.fn(() => true),
}));

vi.mock('@/controllers/pubchi/pubchi', () => ({
  PubchiController: {
    subscribeDatabaseBlocked: () => () => undefined,
    loadPubchi: vi.fn(),
    runAppOpenProactive: vi.fn().mockResolvedValue([]),
  },
}));

const firstOwner = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y' as Pubky;
const secondOwner = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub5' as Pubky;

describe('PubchiCoordinator', () => {
  beforeEach(() => {
    PubchiCoordinator.resetInstance();
    useAuthStore.getState().reset();
    usePubchiStore.getState().clear();
    vi.mocked(PubchiController.loadPubchi).mockReset();
    vi.mocked(PubchiController.runAppOpenProactive).mockReset();
    vi.mocked(PubchiController.runAppOpenProactive).mockResolvedValue([]);
    vi.mocked(PubchiController.loadPubchi).mockImplementation(async () => {
      const owner = useAuthStore.getState().currentUserPubky;
      usePubchiStore.getState().setPubchi(
        {
          bot: firstOwner,
          displayName: 'Pubchi',
          createdAt: 1,
          backupConfirmedAt: 1,
          verified: true,
        },
        owner,
      );
      return undefined;
    });
  });

  afterEach(() => {
    PubchiCoordinator.resetInstance();
  });

  it('hydrates once per owner, rehydrates after identity switch, and does not load after sign-out', async () => {
    const coordinator = PubchiCoordinator.getInstance();
    coordinator.start();

    useAuthStore.getState().init({
      session: mockSession(),
      currentUserPubky: firstOwner,
      hasProfile: true,
    });
    await vi.waitFor(() => expect(PubchiController.loadPubchi).toHaveBeenCalledTimes(1));

    useAuthStore.getState().setCurrentUserPubky(firstOwner);
    await Promise.resolve();
    expect(PubchiController.loadPubchi).toHaveBeenCalledTimes(1);

    useAuthStore.getState().init({
      session: mockSession(),
      currentUserPubky: secondOwner,
      hasProfile: true,
    });
    await vi.waitFor(() => expect(PubchiController.loadPubchi).toHaveBeenCalledTimes(2));

    useAuthStore.getState().reset();
    expect(usePubchiStore.getState().ownerPubky).toBeNull();
    await Promise.resolve();
    expect(PubchiController.loadPubchi).toHaveBeenCalledTimes(2);

    useAuthStore.getState().init({
      session: mockSession(),
      currentUserPubky: firstOwner,
      hasProfile: true,
    });
    await vi.waitFor(() => expect(PubchiController.loadPubchi).toHaveBeenCalledTimes(3));
  });

  it('ticks app-open proactive after hydrate and on becoming visible', async () => {
    const coordinator = PubchiCoordinator.getInstance();
    coordinator.start();
    useAuthStore.getState().init({
      session: mockSession(),
      currentUserPubky: firstOwner,
      hasProfile: true,
    });
    await vi.waitFor(() => expect(PubchiController.runAppOpenProactive).toHaveBeenCalled());
    const afterHydrate = vi.mocked(PubchiController.runAppOpenProactive).mock.calls.length;
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() =>
      expect(vi.mocked(PubchiController.runAppOpenProactive).mock.calls.length).toBeGreaterThan(afterHydrate),
    );
  });
});
