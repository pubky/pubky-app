import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useResourceParticipants } from './useResourceParticipants';

const mocks = vi.hoisted(() => ({
  muted: new Set<string>(),
  tags: [] as { label: string; taggers: string[] }[],
  tagsUri: undefined as string | null | undefined,
}));

vi.mock('@/hooks/useMutedUsers/useMutedUsers', () => ({ useMutedUsers: () => ({ mutedUserIdSet: mocks.muted }) }));
vi.mock('@/hooks/useResourceTags/useResourceTags', () => ({
  useResourceTags: (uri: string | null) => {
    mocks.tagsUri = uri;
    return { tags: mocks.tags };
  },
}));
vi.mock('@/hooks/useBulkUserAvatars/useBulkUserAvatars', () => ({
  useBulkUserAvatars: (ids: string[]) => ({
    usersMap: new Map(ids.map((id) => [id, { name: `name-${id}`, avatarUrl: `avatar-${id}` }])),
    isLoading: false,
  }),
}));

const URI = 'https://www.openstreetmap.org/node/240109189';

describe('useResourceParticipants', () => {
  beforeEach(() => {
    mocks.muted = new Set();
    mocks.tags = [
      { label: 'berlin', taggers: ['tagger', 'replier'] },
      { label: 'city', taggers: ['muted'] },
    ];
  });

  it('lists the thread’s repliers, then who tagged the link, once each, muted users left out', () => {
    mocks.muted = new Set(['muted']);
    const { result } = renderHook(() => useResourceParticipants(URI, ['replier:0035A', 'replier:0035B', 'bad']));

    expect(result.current.participants.map((p) => p.id)).toEqual(['replier', 'tagger']);
    expect(result.current.participants[0]).toMatchObject({ name: 'name-replier', avatarUrl: 'avatar-replier' });
    expect(mocks.tagsUri).toBe(URI);
  });

  it('lists at most `limit` people', () => {
    const { result } = renderHook(() => useResourceParticipants(URI, ['a:1', 'b:1', 'c:1'], { limit: 2 }));

    expect(result.current.participants.map((p) => p.id)).toEqual(['a', 'b']);
  });
});
