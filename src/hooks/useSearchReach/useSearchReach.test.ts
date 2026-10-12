import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useHomeStore } from '@/stores/home/home.store';
import { REACH } from '@/stores/home/home.types';
import { useSearchStore } from '@/stores/search/search.store';
import { useSearchReach } from './useSearchReach';

describe('Search reach', () => {
  beforeEach(() => {
    useSearchStore.getState().reset();
    useHomeStore.getState().reset();
    useAuthStore.setState({ currentUserPubky: 'viewer', showSignInDialog: false });
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.mocked(window.scrollTo).mockRestore();
  });

  it('keeps Search and Home independent and retains Search during navigation', () => {
    const first = renderHook(() => useSearchReach());
    expect(first.result.current.reach).toBe(REACH.ALL);
    act(() => first.result.current.setReach(REACH.NETWORK));
    expect(first.result.current.nexusReach).toBe('wot');
    expect(useHomeStore.getState().reach).toBe(REACH.ALL);
    act(() => useHomeStore.getState().setReach(REACH.FRIENDS));
    expect(first.result.current.reach).toBe(REACH.NETWORK);
    first.unmount();
    const next = renderHook(() => useSearchReach());
    expect(next.result.current.reach).toBe(REACH.NETWORK);
    expect(window.scrollTo).toHaveBeenCalledTimes(1);
    act(() => next.result.current.setReach(REACH.NETWORK));
    expect(window.scrollTo).toHaveBeenCalledTimes(1);
  });

  it('keeps the query and history when changing reach, and excludes reach from persistence', () => {
    useSearchStore.getState().setActiveTags(['bitcoin', 'pubky']);
    useSearchStore.getState().addQuery('wallets');
    const { result } = renderHook(() => useSearchReach());
    act(() => result.current.setReach(REACH.FOLLOWING));
    expect(useSearchStore.getState().activeTags).toEqual(['bitcoin', 'pubky']);
    const options = useSearchStore.persist.getOptions();
    expect(options.partialize?.(useSearchStore.getState())).not.toHaveProperty('reach');
    act(() => useSearchStore.getState().clearRecentSearches());
    expect(result.current.reach).toBe(REACH.FOLLOWING);
    act(() => useSearchStore.getState().reset());
    expect(result.current.reach).toBe(REACH.ALL);
  });

  it('prompts a guest to sign in without selecting a scoped reach', () => {
    useAuthStore.setState({ currentUserPubky: null });
    const { result } = renderHook(() => useSearchReach());
    act(() => result.current.setReach(REACH.FRIENDS));
    expect(useAuthStore.getState().showSignInDialog).toBe(true);
    expect(result.current.reach).toBe(REACH.ALL);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('resolves a signed-out viewer to All even before the logout reset completes', () => {
    useSearchStore.getState().setReach(REACH.FOLLOWING);
    const { result } = renderHook(() => useSearchReach());
    act(() => useAuthStore.setState({ currentUserPubky: null }));
    expect(result.current.reach).toBe(REACH.ALL);
    expect(result.current.nexusReach).toBeUndefined();
  });
});
