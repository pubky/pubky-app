import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFeatureDiscoveryStorageKey, COLLECTIONS_NAV_NEW_BADGE_STORAGE_ID } from '@/config/featureDiscovery';
import { useCollectionsNavDiscovery } from './useCollectionsNavDiscovery';

const mocks = vi.hoisted(() => ({
  currentUserPubky: 'pk:test-user-pubky' as string | null,
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: vi.fn((selector: (state: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky: mocks.currentUserPubky }),
  ),
}));

describe('useCollectionsNavDiscovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.currentUserPubky = 'pk:test-user-pubky';
  });

  it('shows the Collections NEW treatment for authenticated users who have not seen it locally', async () => {
    const { result } = renderHook(() => useCollectionsNavDiscovery());

    await waitFor(() => {
      expect(result.current.showCollectionsNew).toBe(true);
    });
  });

  it('does not show the treatment for guests', async () => {
    mocks.currentUserPubky = null;

    const { result } = renderHook(() => useCollectionsNavDiscovery());

    await waitFor(() => {
      expect(result.current.showCollectionsNew).toBe(false);
    });
  });

  it('does not show the treatment after local dismissal', async () => {
    window.localStorage.setItem(
      buildFeatureDiscoveryStorageKey('pk:test-user-pubky', COLLECTIONS_NAV_NEW_BADGE_STORAGE_ID),
      'seen',
    );

    const { result } = renderHook(() => useCollectionsNavDiscovery());

    await waitFor(() => {
      expect(result.current.showCollectionsNew).toBe(false);
    });
  });

  it('marks Collections nav as seen in per-user localStorage only while the treatment is visible', async () => {
    const { result, rerender } = renderHook(() => useCollectionsNavDiscovery());

    await waitFor(() => {
      expect(result.current.showCollectionsNew).toBe(true);
    });

    act(() => result.current.markCollectionsNavSeen());

    expect(
      window.localStorage.getItem(
        buildFeatureDiscoveryStorageKey('pk:test-user-pubky', COLLECTIONS_NAV_NEW_BADGE_STORAGE_ID),
      ),
    ).toBe('seen');
    expect(result.current.showCollectionsNew).toBe(false);

    rerender();

    act(() => result.current.markCollectionsNavSeen());

    expect(window.localStorage.length).toBe(1);
  });

  it('does not reuse dismissal while switching users in the same tab', async () => {
    const { result, rerender } = renderHook(() => useCollectionsNavDiscovery());

    await waitFor(() => {
      expect(result.current.showCollectionsNew).toBe(true);
    });

    act(() => result.current.markCollectionsNavSeen());
    expect(result.current.showCollectionsNew).toBe(false);

    mocks.currentUserPubky = 'pk:second-user';
    rerender();

    await waitFor(() => {
      expect(result.current.showCollectionsNew).toBe(true);
    });

    expect(
      window.localStorage.getItem(
        buildFeatureDiscoveryStorageKey('pk:second-user', COLLECTIONS_NAV_NEW_BADGE_STORAGE_ID),
      ),
    ).toBeNull();
  });
});
