import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthApplication } from '@/application/auth/auth';
import { AuthController } from '@/controllers/auth/auth';
import { useAuthStatus } from '@/hooks/useAuthStatus/useAuthStatus';
import { AuthStatus } from '@/hooks/useAuthStatus/useAuthStatus.types';
import { Identity } from '@/libs/identity/identity';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { mockSession } from '@/test-utils/pubky';

vi.mock('@/database/franky/franky.helpers', () => ({
  clearDatabase: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/libs/query-client/query-client.factory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs/query-client/query-client.factory')>();
  return {
    ...actual,
    clearAllQueryClients: vi.fn(),
  };
});

vi.mock('@/libs/utils/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs/utils/utils')>();
  return {
    ...actual,
    clearCookies: vi.fn(),
  };
});

const PREVIOUS_PUBKY = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Pubky;
const RESTORED_PUBKY = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y' as Pubky;

describe('AuthController restore finalization — real useAuthStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().reset();
    useOnboardingStore.getState().reset();
    useOnboardingStore.getState().setHydrated(true);
    useAuthStore.setState({
      session: null,
      sessionExport: 'old-session-export',
      currentUserPubky: PREVIOUS_PUBKY,
      hasProfile: true,
      hasHydrated: true,
      isRestoringSession: false,
      sessionRestoreDeferred: false,
    });
  });

  afterEach(() => {
    AuthController.cancelModerationFollow();
    useAuthStore.getState().reset();
    useOnboardingStore.getState().reset();
    vi.restoreAllMocks();
  });

  it('keeps useAuthStatus loading until init on identity-change restore', async () => {
    const session = mockSession();
    let resolveSignedUp: ((value: boolean) => void) | undefined;
    vi.spyOn(AuthApplication, 'restorePersistedSession').mockResolvedValue({
      status: 'restored',
      session,
    });
    vi.spyOn(Identity, 'z32FromSession').mockReturnValue(RESTORED_PUBKY);
    vi.spyOn(AuthApplication, 'userIsSignedUp').mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveSignedUp = resolve;
      }),
    );

    const ticks: Array<{ isLoading: boolean; status: AuthStatus }> = [];
    const { result } = renderHook(() => {
      const auth = useAuthStatus();
      ticks.push({ isLoading: auth.isLoading, status: auth.status });
      return auth;
    });

    let restorePromise: Promise<{ status: string }>;
    await act(async () => {
      restorePromise = AuthController.restorePersistedSession();
    });
    await waitFor(() => {
      expect(AuthApplication.userIsSignedUp).toHaveBeenCalled();
    });

    expect(useAuthStore.getState().isRestoringSession).toBe(true);
    expect(result.current.isLoading).toBe(true);
    expect(ticks.some((tick) => tick.isLoading === false && tick.status === AuthStatus.UNAUTHENTICATED)).toBe(false);

    await act(async () => {
      resolveSignedUp?.(true);
      await restorePromise;
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.status).toBe(AuthStatus.AUTHENTICATED);
    expect(useAuthStore.getState().isRestoringSession).toBe(false);
    expect(useAuthStore.getState().currentUserPubky).toBe(RESTORED_PUBKY);
    expect(useAuthStore.getState().hasProfile).toBe(true);
    expect(ticks.some((tick) => tick.isLoading === false && tick.status === AuthStatus.UNAUTHENTICATED)).toBe(false);
  });
});
