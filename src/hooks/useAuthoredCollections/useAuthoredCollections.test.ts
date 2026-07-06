import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthoredCollections } from './useAuthoredCollections';

type LocalFirstParams = {
  queryFn: () => Promise<unknown>;
  fetchFn: () => Promise<unknown>;
  deps: unknown[];
  enabled: boolean;
};

const mocks = vi.hoisted(() => ({
  currentUserPubky: 'current-user' as string | null,
  capturedParams: null as LocalFirstParams | null,
  localFirstResult: {
    data: undefined as unknown,
    isLoading: false,
  },
  getAuthoredCollections: vi.fn(),
  fetchAuthoredCollections: vi.fn(),
}));

const authoredCollections = [
  {
    details: { id: 'current-user:collection1' },
    content: {
      name: 'Proof of Work',
      description: 'Bitcoin writing',
      items: [],
    },
  },
];

vi.mock('@/controllers/post/post', () => ({
  PostController: {
    getAuthoredCollections: (...args: unknown[]) => mocks.getAuthoredCollections(...args),
    fetchAuthoredCollections: (...args: unknown[]) => mocks.fetchAuthoredCollections(...args),
  },
}));

vi.mock('@/hooks/useLocalFirstQuery/useLocalFirstQuery', () => ({
  useLocalFirstQuery: (params: LocalFirstParams) => {
    mocks.capturedParams = params;
    return mocks.localFirstResult;
  },
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky: mocks.currentUserPubky }),
}));

describe('useAuthoredCollections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUserPubky = 'current-user';
    mocks.capturedParams = null;
    mocks.localFirstResult = {
      data: authoredCollections,
      isLoading: false,
    };
    mocks.getAuthoredCollections.mockResolvedValue(authoredCollections);
    mocks.fetchAuthoredCollections.mockResolvedValue(authoredCollections);
  });

  it('returns collections and loading state from the local-first query', () => {
    const { result } = renderHook(() => useAuthoredCollections());

    expect(result.current.collections).toEqual(authoredCollections);
    expect(result.current.isLoading).toBe(false);
  });

  it('wires local and network collection reads to the current user', async () => {
    renderHook(() => useAuthoredCollections());

    expect(mocks.capturedParams).toMatchObject({
      deps: ['current-user'],
      enabled: true,
    });

    await mocks.capturedParams!.queryFn();
    await mocks.capturedParams!.fetchFn();

    expect(mocks.getAuthoredCollections).toHaveBeenCalledWith({ authorId: 'current-user' });
    expect(mocks.fetchAuthoredCollections).toHaveBeenCalledWith({
      authorId: 'current-user',
      viewerId: 'current-user',
    });
  });

  it('returns an empty list and disables reads when there is no current user', () => {
    mocks.currentUserPubky = null;
    mocks.localFirstResult = {
      data: undefined,
      isLoading: false,
    };

    const { result } = renderHook(() => useAuthoredCollections());

    expect(result.current.collections).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(mocks.capturedParams).toMatchObject({
      deps: [null],
      enabled: false,
    });
  });

  it('respects an explicit disabled flag', () => {
    renderHook(() => useAuthoredCollections(false));

    expect(mocks.capturedParams).toMatchObject({
      deps: ['current-user'],
      enabled: false,
    });
  });
});
