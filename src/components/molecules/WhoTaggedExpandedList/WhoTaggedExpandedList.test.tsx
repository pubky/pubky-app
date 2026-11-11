import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaggerWithAvatar } from '@/molecules/TaggedItem/TaggedItem.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { WhoTaggedExpandedList } from './WhoTaggedExpandedList';

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
    waitForAuth: async () => true,
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
  useAuthStore: vi.fn(() => ({
    currentUserPubky: 'current-user-pubky',
  })),
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
      nameAside,
    }: {
      tagger: { id: string; name?: string };
      onUserClick?: (id: string) => void;
      onFollowClick?: (id: string, isFollowing: boolean) => void;
      isLoading?: boolean;
      isCurrentUser?: boolean;
      nameAside?: React.ReactNode;
    }) => (
      <div data-testid={`user-list-item-${tagger.id}`} data-loading={isLoading} data-current-user={isCurrentUser}>
        <span>{tagger.name || tagger.id}</span>
        {nameAside}
        <button data-testid={`user-click-${tagger.id}`} onClick={() => onUserClick?.(tagger.id)}>
          View Profile
        </button>
        <button data-testid={`follow-click-${tagger.id}`} onClick={() => onFollowClick?.(tagger.id, false)}>
          Follow
        </button>
      </div>
    ),
  };
});

const mockTaggers: TaggerWithAvatar[] = [
  { id: 'user1', avatarUrl: 'https://cdn.example.com/avatar/user1', name: 'Alice' },
  { id: 'user2', avatarUrl: 'https://cdn.example.com/avatar/user2', name: 'Bob' },
  { id: 'user3', avatarUrl: 'https://cdn.example.com/avatar/user3' },
];
const mockTaggerIds = mockTaggers.map((tagger) => tagger.id);

describe('WhoTaggedExpandedList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPush.mockClear();
  });

  it('renders with default props', () => {
    render(<WhoTaggedExpandedList taggerIds={mockTaggerIds} />);
    expect(screen.getByTestId('who-tagged-expanded-list')).toBeInTheDocument();
  });

  it('renders all taggers as UserListItems', () => {
    render(<WhoTaggedExpandedList taggerIds={mockTaggerIds} />);
    expect(screen.getByTestId('user-list-item-user1')).toBeInTheDocument();
    expect(screen.getByTestId('user-list-item-user2')).toBeInTheDocument();
    expect(screen.getByTestId('user-list-item-user3')).toBeInTheDocument();
  });

  it('keeps overflowing tagger rows in a constrained scroll container', () => {
    const taggerIds = Array.from({ length: 6 }, (_, index) => `user${index + 1}`);
    render(<WhoTaggedExpandedList taggerIds={taggerIds} />);

    expect(screen.getByRole('list', { name: 'Who tagged expanded list' })).toHaveClass(
      'max-h-(--who-tagged-expanded-list-max-height)',
      'overflow-y-auto',
    );
  });

  it('renders a load-more sentinel only when more taggers can be loaded', () => {
    const { rerender } = render(<WhoTaggedExpandedList taggerIds={mockTaggerIds} />);
    expect(screen.queryByTestId('who-tagged-expanded-list-sentinel')).not.toBeInTheDocument();

    rerender(<WhoTaggedExpandedList taggerIds={mockTaggerIds} hasMore onLoadMore={vi.fn()} />);
    expect(screen.getByTestId('who-tagged-expanded-list-sentinel')).toBeInTheDocument();
    expect(screen.getByTestId('who-tagged-expanded-list-sentinel')).toBeEmptyDOMElement();
  });

  it('shows a loading row while the next page loads and keeps the rows visible', () => {
    render(<WhoTaggedExpandedList taggerIds={mockTaggerIds} hasMore isLoadingMore onLoadMore={vi.fn()} />);

    expect(screen.getByTestId('user-list-item-user1')).toBeInTheDocument();
    expect(screen.getByTestId('who-tagged-expanded-list-sentinel')).not.toBeEmptyDOMElement();
    expect(screen.queryByTestId('who-tagged-expanded-list-skeleton')).not.toBeInTheDocument();
  });

  it('keeps loaded rows and replaces automatic pagination with a manual retry after an error', () => {
    const onLoadMore = vi.fn();
    render(<WhoTaggedExpandedList taggerIds={mockTaggerIds} hasMore hasError onLoadMore={onLoadMore} />);

    expect(screen.getByTestId('user-list-item-user1')).toBeInTheDocument();
    expect(screen.queryByTestId('who-tagged-expanded-list-sentinel')).not.toBeInTheDocument();
    expect(onLoadMore).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading taggers' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('loads more when the sentinel scrolls into view', () => {
    vi.useFakeTimers();
    const originalObserver = window.IntersectionObserver;
    const observed: Array<{ callback: IntersectionObserverCallback; target: Element }> = [];
    class ObservingIntersectionObserver {
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        observed.push({ callback: this.callback, target });
      }
      unobserve() {}
      disconnect() {}
    }
    window.IntersectionObserver = asOpaque<typeof IntersectionObserver>(ObservingIntersectionObserver);

    try {
      const onLoadMore = vi.fn();
      render(<WhoTaggedExpandedList taggerIds={mockTaggerIds} hasMore onLoadMore={onLoadMore} />);

      const sentinel = screen.getByTestId('who-tagged-expanded-list-sentinel');
      const observer = observed.find((entry) => entry.target === sentinel);
      expect(observer).toBeDefined();

      act(() => {
        observer?.callback(
          [asOpaque<IntersectionObserverEntry>({ isIntersecting: true, target: sentinel })],
          asOpaque<IntersectionObserver>({}),
        );
        vi.runAllTimers();
      });

      expect(onLoadMore).toHaveBeenCalledTimes(1);
    } finally {
      window.IntersectionObserver = originalObserver;
      vi.useRealTimers();
    }
  });

  it('returns null when taggers array is empty', () => {
    const { container } = render(<WhoTaggedExpandedList taggerIds={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('keeps known people visible during the initial refresh', () => {
    render(<WhoTaggedExpandedList taggerIds={mockTaggerIds} isLoadingTaggers />);
    expect(screen.queryByTestId('who-tagged-expanded-list-skeleton')).not.toBeInTheDocument();
    expect(screen.getByTestId('who-tagged-expanded-list')).toBeInTheDocument();
    expect(screen.getByTestId('user-list-item-user1')).toBeInTheDocument();
  });

  it('shows initial loading and retry states even without preview taggers', () => {
    const { rerender } = render(<WhoTaggedExpandedList taggerIds={[]} isLoadingTaggers />);
    expect(screen.getByTestId('who-tagged-expanded-list-skeleton')).toBeInTheDocument();

    rerender(<WhoTaggedExpandedList taggerIds={[]} hasError onLoadMore={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Retry loading taggers' })).toBeInTheDocument();
  });

  it('navigates to user profile when user is clicked', () => {
    render(<WhoTaggedExpandedList taggerIds={mockTaggerIds} />);
    fireEvent.click(screen.getByTestId('user-click-user1'));
    expect(mockPush).toHaveBeenCalledWith('/profile/user1');
  });

  it('calls toggleFollow when follow button is clicked', () => {
    render(<WhoTaggedExpandedList taggerIds={mockTaggerIds} fallbackTaggers={mockTaggers} />);
    fireEvent.click(screen.getByTestId('follow-click-user1'));
    expect(mockToggleFollow).toHaveBeenCalledWith('user1', false);
  });

  it('applies custom data-testid', () => {
    render(<WhoTaggedExpandedList taggerIds={mockTaggerIds} data-testid="custom-test-id" />);
    expect(screen.getByTestId('custom-test-id')).toBeInTheDocument();
  });

  it('lists a second group after a thin rule, both named for screen readers only', () => {
    render(
      <WhoTaggedExpandedList
        taggerIds={['user1']}
        secondaryTaggerIds={['user2', 'user3']}
        groupNames={['Tagged on this link', 'Tagged only on other services']}
      />,
    );
    const list = screen.getByTestId('who-tagged-expanded-list');
    const order = [...list.children].map((child) => child.getAttribute('data-testid') ?? child.textContent ?? '');
    expect(order).toEqual([
      'Tagged on this link',
      'user-list-item-user1',
      'who-tagged-expanded-list-divider',
      'Tagged only on other services',
      'user-list-item-user2',
      'user-list-item-user3',
    ]);
    expect(screen.getByText('Tagged on this link')).toHaveClass('sr-only');
    expect(screen.getByTestId('who-tagged-expanded-list-divider')).toHaveAttribute('aria-hidden');
  });

  it('has no rule when only the second group has people', () => {
    render(<WhoTaggedExpandedList taggerIds={[]} secondaryTaggerIds={['user2']} />);
    expect(screen.getByTestId('user-list-item-user2')).toBeInTheDocument();
    expect(screen.queryByTestId('who-tagged-expanded-list-divider')).not.toBeInTheDocument();
  });

  it('shows in each tagger’s row what the caller renders for that tagger', () => {
    render(
      <WhoTaggedExpandedList
        taggerIds={['user1']}
        secondaryTaggerIds={['user2']}
        renderTaggerAside={(id) => <span data-testid={`aside-${id}`} />}
      />,
    );
    for (const id of ['user1', 'user2']) {
      expect(screen.getByTestId(`user-list-item-${id}`)).toContainElement(screen.getByTestId(`aside-${id}`));
    }
  });

  it('shows "+N" for people counted but not listed', () => {
    const { rerender } = render(<WhoTaggedExpandedList taggerIds={mockTaggerIds} moreCount={4} />);
    expect(screen.getByText('+4')).toHaveTextContent('+4 more, not listed');

    rerender(<WhoTaggedExpandedList taggerIds={mockTaggerIds} />);
    expect(screen.queryByText(/not listed/)).not.toBeInTheDocument();
  });
});
