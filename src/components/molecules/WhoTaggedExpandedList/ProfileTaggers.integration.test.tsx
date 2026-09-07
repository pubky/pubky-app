import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TagKind } from '@/application/tag/tag.types';
import { UserController } from '@/controllers/user/user';
import { TAGGERS_PAGE_SIZE } from '@/hooks/useEntityTaggers/useEntityTaggers.constants';
import { asOpaque } from '@/test-utils/type-assertions';
import { TaggedList } from '../TaggedList/TaggedList';

vi.mock('@/controllers/user/user', () => ({ UserController: { fetchTaggers: vi.fn() } }));
vi.mock('@/controllers/post/post', () => ({ PostController: { fetchTaggers: vi.fn() } }));

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock useFollowUser hook
const mockToggleFollow = vi.fn();
const mockIsUserLoading = vi.fn().mockReturnValue(false);
vi.mock('@/hooks/useFollowUser/useFollowUser', () => ({
  useFollowUser: vi.fn(() => ({
    toggleFollow: mockToggleFollow,
    isUserLoading: mockIsUserLoading,
  })),
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: vi.fn(() => ({
    isAuthenticated: true,
    requireAuth: vi.fn((action: () => void) => action()),
  })),
}));

vi.mock('@/hooks/useBulkUserAvatars/useBulkUserAvatars', () => ({
  useBulkUserAvatars: vi.fn((ids: string[]) => ({
    getUsersWithAvatars: () => ids.map((id) => ({ id, name: undefined, avatarUrl: '' })),
    isLoading: false,
  })),
}));

// Mock auth store
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: vi.fn((selector) => {
    const state = { currentUserPubky: 'current-user-pubky' };
    return selector ? selector(state) : state;
  }),
}));

// Mock TaggerUserRow - this is what WhoTaggedExpandedList directly uses
vi.mock('@/molecules/TaggerUserRow/TaggerUserRow', () => {
  return {
    TaggerUserRow: ({
      tagger,
      onUserClick,
      onFollowClick,
      isLoading,
      isCurrentUser,
    }: {
      tagger: { id: string; name?: string };
      onUserClick?: (id: string) => void;
      onFollowClick?: (id: string, isFollowing: boolean, displayName: string) => void;
      isLoading?: boolean;
      isCurrentUser?: boolean;
    }) => (
      <div data-testid={`user-list-item-${tagger.id}`} data-loading={isLoading} data-current-user={isCurrentUser}>
        <span>{tagger.name || tagger.id}</span>
        <button data-testid={`user-click-${tagger.id}`} onClick={() => onUserClick?.(tagger.id)}>
          View Profile
        </button>
        <button
          data-testid={`follow-click-${tagger.id}`}
          onClick={() => onFollowClick?.(tagger.id, false, tagger.name ?? tagger.id)}
        >
          Follow
        </button>
      </div>
    ),
  };
});

const ids = Array.from({ length: TAGGERS_PAGE_SIZE }, (_, i) => `user-${i}`);
const tags = [
  {
    label: 'bitcoin',
    taggers: ids.slice(0, 5).map((id) => ({ id })),
    taggers_count: ids.length + 1,
    relationship: false,
  },
];
const renderList = () =>
  render(<TaggedList tags={tags} taggedId="profile" taggedKind={TagKind.USER} onTagToggle={vi.fn()} />);

describe('Profile tagger expansion integration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('expands a five-person preview and loads the next page when scrolling to the end', async () => {
    const observed: Array<{ callback: IntersectionObserverCallback; target: Element }> = [];
    const originalObserver = window.IntersectionObserver;
    class Observer {
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        observed.push({ callback: this.callback, target });
      }
      unobserve() {}
      disconnect() {}
    }
    window.IntersectionObserver = asOpaque<typeof IntersectionObserver>(Observer);
    try {
      vi.mocked(UserController.fetchTaggers)
        .mockResolvedValueOnce({ users: ids, relationship: false })
        .mockResolvedValueOnce({ users: ['last-user'], relationship: false });
      renderList();
      fireEvent.click(screen.getByRole('button', { name: 'Show 51 users who tagged' }));
      await waitFor(() => expect(screen.getAllByTestId(/^user-list-item-/)).toHaveLength(50));
      const sentinel = screen.getByTestId('who-tagged-expanded-list-sentinel');
      const observer = observed.find((entry) => entry.target === sentinel);
      expect(observer).toBeDefined();
      act(() =>
        observer?.callback(
          [asOpaque<IntersectionObserverEntry>({ isIntersecting: true, target: sentinel })],
          asOpaque<IntersectionObserver>({}),
        ),
      );
      await waitFor(() => expect(screen.getByTestId('user-list-item-last-user')).toBeInTheDocument());
      expect(UserController.fetchTaggers).toHaveBeenLastCalledWith({
        user_id: 'profile',
        label: 'bitcoin',
        skip: 50,
        limit: 50,
      });
      expect(screen.queryByTestId('who-tagged-expanded-list-sentinel')).not.toBeInTheDocument();
    } finally {
      window.IntersectionObserver = originalObserver;
    }
  });

  it('stops automatic requests after an initial error and lets the viewer retry', async () => {
    vi.mocked(UserController.fetchTaggers)
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementation(() => new Promise(() => {}));
    renderList();
    fireEvent.click(screen.getByRole('button', { name: 'Show 51 users who tagged' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument());
    expect(UserController.fetchTaggers).toHaveBeenCalledTimes(1);
    vi.mocked(UserController.fetchTaggers).mockResolvedValue({ users: ids, relationship: false });
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    await waitFor(() => expect(screen.getAllByTestId(/^user-list-item-/)).toHaveLength(50));
  });
});
