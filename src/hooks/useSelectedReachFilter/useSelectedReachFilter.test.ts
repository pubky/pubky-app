import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TAGGED_AS_FILTER_KEY } from '@/config/feed';
import { REACH, type ReachType } from '@/stores/home/home.types';
import { useSelectedReachFilter } from './useSelectedReachFilter';

const mockState = {
  reach: REACH.ALL as ReachType,
  taggedAsActive: false,
  profileTags: [] as string[],
  isAuthenticated: true,
};

vi.mock('@/stores/home/home.store', () => ({
  useHomeStore: (selector: (state: typeof mockState) => unknown) => selector(mockState),
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({ isAuthenticated: mockState.isAuthenticated }),
}));

describe('useSelectedReachFilter', () => {
  beforeEach(() => {
    mockState.reach = REACH.ALL;
    mockState.taggedAsActive = false;
    mockState.profileTags = [];
    mockState.isAuthenticated = true;
  });

  it('returns the persisted reach', () => {
    mockState.reach = REACH.NETWORK;

    const { result } = renderHook(() => useSelectedReachFilter());

    expect(result.current).toBe(REACH.NETWORK);
  });

  it('returns Tagged as while the tagged-as filter is active with profile tags', () => {
    mockState.reach = REACH.NETWORK;
    mockState.taggedAsActive = true;
    mockState.profileTags = ['bitcoiner'];

    const { result } = renderHook(() => useSelectedReachFilter());

    expect(result.current).toBe(TAGGED_AS_FILTER_KEY);
  });

  it('ignores tagged-as without profile tags', () => {
    mockState.reach = REACH.FRIENDS;
    mockState.taggedAsActive = true;

    const { result } = renderHook(() => useSelectedReachFilter());

    expect(result.current).toBe(REACH.FRIENDS);
  });

  it('forces All for signed-out visitors', () => {
    mockState.isAuthenticated = false;
    mockState.reach = REACH.NETWORK;
    mockState.taggedAsActive = true;
    mockState.profileTags = ['bitcoiner'];

    const { result } = renderHook(() => useSelectedReachFilter());

    expect(result.current).toBe(REACH.ALL);
  });
});
