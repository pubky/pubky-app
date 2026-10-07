import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/app/routes';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { useExperienceCompletedGuard } from './useExperienceCompletedGuard';

const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace }),
}));

const ACTIVE_PUBKY = 'guard-test-pubky';
let mockCurrentUserPubky: string | null = ACTIVE_PUBKY;
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky: mockCurrentUserPubky }),
}));

describe('useExperienceCompletedGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentUserPubky = ACTIVE_PUBKY;
    useOnboardingStore.setState({ hasHydrated: true, experienceCompletedByPubky: {} });
  });

  it('is ready for an account that has not completed the experience', () => {
    const { result } = renderHook(() => useExperienceCompletedGuard());

    expect(result.current.isReady).toBe(true);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects home and stays not ready for an account that already completed', () => {
    useOnboardingStore.setState({ experienceCompletedByPubky: { [ACTIVE_PUBKY]: true } });

    const { result } = renderHook(() => useExperienceCompletedGuard());

    expect(result.current.isReady).toBe(false);
    expect(mockReplace).toHaveBeenCalledWith(APP_ROUTES.HOME);
  });

  it('still prompts a different pubky on the same browser', () => {
    useOnboardingStore.setState({ experienceCompletedByPubky: { 'someone-else': true } });

    const { result } = renderHook(() => useExperienceCompletedGuard());

    expect(result.current.isReady).toBe(true);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('holds until the persisted completion map is rehydrated', () => {
    useOnboardingStore.setState({ hasHydrated: false, experienceCompletedByPubky: { [ACTIVE_PUBKY]: true } });

    const { result } = renderHook(() => useExperienceCompletedGuard());

    expect(result.current.isReady).toBe(false);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does not subscribe to completion written during the current visit', () => {
    const { result } = renderHook(() => useExperienceCompletedGuard());
    expect(result.current.isReady).toBe(true);

    // The screen's Finish handler owns navigation in this case; the store write alone must not
    // re-render the guard and trigger a second redirect.
    useOnboardingStore.getState().markExperienceCompleted(ACTIVE_PUBKY);

    expect(result.current.isReady).toBe(true);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
