import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFeatureDiscoveryStorageKey } from '@/config/featureDiscovery';
import { PWA_INSTALL_STORAGE_ID } from '@/config/pwa';
import { promptInstall } from '@/libs/pwa/installPrompt';
import { resetInstallReminderMemory } from '@/libs/pwa/installReminder';
import { useInstallPrompt } from './useInstallPrompt';

const PUBKY = 'pk:alice';
const KEY = buildFeatureDiscoveryStorageKey(PUBKY, PWA_INSTALL_STORAGE_ID);

const mocks = vi.hoisted(() => ({
  currentUserPubky: 'pk:alice' as string | null,
  secretKey: null as string | null,
  isStandalone: false,
  isIos: false,
  snapshot: { canPrompt: true, installed: false },
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: vi.fn((selector: (state: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky: mocks.currentUserPubky }),
  ),
}));

vi.mock('@/stores/onboarding/onboarding.store', () => ({
  useOnboardingStore: vi.fn((selector: (state: { secretKey: string | null }) => unknown) =>
    selector({ secretKey: mocks.secretKey }),
  ),
}));

vi.mock('@/hooks/useIsStandalone/useIsStandalone', () => ({
  useIsStandalone: () => mocks.isStandalone,
}));

vi.mock('@/libs/pwa/platform', () => ({
  isIosDevice: () => mocks.isIos,
}));

vi.mock('@/libs/pwa/installPrompt', () => ({
  getInstallPromptSnapshot: () => mocks.snapshot,
  getServerInstallPromptSnapshot: () => ({ canPrompt: false, installed: false }),
  subscribeToInstallPrompt: () => () => undefined,
  promptInstall: vi.fn(),
}));

function readStored() {
  return JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as { done: boolean; laterCount: number } | null;
}

describe('useInstallPrompt', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetInstallReminderMemory();
    mocks.currentUserPubky = PUBKY;
    mocks.secretKey = null;
    mocks.isStandalone = false;
    mocks.isIos = false;
    mocks.snapshot = { canPrompt: true, installed: false };
    vi.mocked(promptInstall).mockResolvedValue('accepted');
  });

  it('is visible for a signed-in user in a tab once the browser can install', async () => {
    const { result } = renderHook(() => useInstallPrompt());

    await waitFor(() => expect(result.current.visible).toBe(true));
    expect(result.current.platform).toBe('native');
  });

  it.each([
    ['guest', () => (mocks.currentUserPubky = null)],
    ['already installed (standalone)', () => (mocks.isStandalone = true)],
    ['installed during this session', () => (mocks.snapshot = { canPrompt: false, installed: true })],
    ['pending backup reminder', () => (mocks.secretKey = 'secret')],
    ['browser cannot install', () => (mocks.snapshot = { canPrompt: false, installed: false })],
    [
      'snoozed',
      () =>
        window.localStorage.setItem(
          KEY,
          JSON.stringify({ done: false, laterCount: 1, nextShowAt: Date.now() + 60_000 }),
        ),
    ],
    [
      'dismissed for good',
      () => window.localStorage.setItem(KEY, JSON.stringify({ done: true, laterCount: 0, nextShowAt: 0 })),
    ],
  ])('stays hidden: %s', async (_label, arrange) => {
    arrange();
    const { result } = renderHook(() => useInstallPrompt());

    await act(async () => {});
    expect(result.current.visible).toBe(false);
  });

  it('offers the manual steps on iOS when no native prompt exists', async () => {
    mocks.isIos = true;
    mocks.snapshot = { canPrompt: false, installed: false };
    const { result } = renderHook(() => useInstallPrompt());
    await waitFor(() => expect(result.current.visible).toBe(true));
    expect(result.current.platform).toBe('ios');

    await act(async () => result.current.install());
    expect(result.current.iosDialogOpen).toBe(true);
    expect(promptInstall).not.toHaveBeenCalled();

    act(() => result.current.closeIosDialog(true));
    expect(result.current.iosDialogOpen).toBe(false);
    expect(readStored()?.done).toBe(true);
  });

  it('snoozes when the iOS dialog is closed without confirming', async () => {
    mocks.isIos = true;
    mocks.snapshot = { canPrompt: false, installed: false };
    const { result } = renderHook(() => useInstallPrompt());
    await waitFor(() => expect(result.current.visible).toBe(true));

    await act(async () => result.current.install());
    act(() => result.current.closeIosDialog(false));

    expect(readStored()).toMatchObject({ done: false, laterCount: 1 });
    expect(result.current.visible).toBe(false);
  });

  it('shows the native prompt and retires the banner when accepted', async () => {
    const { result } = renderHook(() => useInstallPrompt());
    await waitFor(() => expect(result.current.visible).toBe(true));

    await act(async () => result.current.install());

    expect(promptInstall).toHaveBeenCalledTimes(1);
    expect(readStored()?.done).toBe(true);
    expect(result.current.visible).toBe(false);
  });

  it('snoozes when the native prompt cannot be shown', async () => {
    vi.mocked(promptInstall).mockResolvedValue('unavailable');
    const { result } = renderHook(() => useInstallPrompt());
    await waitFor(() => expect(result.current.visible).toBe(true));

    await act(async () => result.current.install());

    expect(readStored()).toMatchObject({ done: false, laterCount: 1 });
  });

  it('does not touch storage for users who can never see the banner', async () => {
    mocks.isStandalone = true;
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    renderHook(() => useInstallPrompt());
    await act(async () => {});
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(getItem).not.toHaveBeenCalledWith(KEY);
    getItem.mockRestore();
  });

  it('snoozes when the native prompt is dismissed', async () => {
    vi.mocked(promptInstall).mockResolvedValue('dismissed');
    const { result } = renderHook(() => useInstallPrompt());
    await waitFor(() => expect(result.current.visible).toBe(true));

    await act(async () => result.current.install());

    expect(readStored()).toMatchObject({ done: false, laterCount: 1 });
    expect(result.current.visible).toBe(false);
  });

  it('snoozes on Later', async () => {
    const { result } = renderHook(() => useInstallPrompt());
    await waitFor(() => expect(result.current.visible).toBe(true));

    act(() => result.current.remindLater());

    expect(readStored()).toMatchObject({ done: false, laterCount: 1 });
    expect(result.current.visible).toBe(false);
  });

  it('re-checks eligibility when the tab regains focus', async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ done: false, laterCount: 1, nextShowAt: Date.now() + 1_000 }));
    const { result } = renderHook(() => useInstallPrompt());
    await act(async () => {});
    expect(result.current.visible).toBe(false);

    window.localStorage.setItem(KEY, JSON.stringify({ done: false, laterCount: 1, nextShowAt: 0 }));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(result.current.visible).toBe(true);
  });
});
