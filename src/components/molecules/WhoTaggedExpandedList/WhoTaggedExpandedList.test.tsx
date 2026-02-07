import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WhoTaggedExpandedList } from './WhoTaggedExpandedList';
import type { TaggerWithAvatar } from '@/molecules/TaggedItem/TaggedItem.types';

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
vi.mock('@/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks')>();
  return {
    ...actual,
    useFollowUser: vi.fn(() => ({
      toggleFollow: mockToggleFollow,
      isUserLoading: mockIsUserLoading,
    })),
    useRequireAuth: vi.fn(() => ({
      isAuthenticated: true,
      requireAuth: vi.fn((action: () => void) => action()),
    })),
    useBulkUserAvatars: vi.fn((ids: string[]) => ({
      getUsersWithAvatars: () => ids.map((id) => ({ id, name: id, avatarUrl: '' })),
      isLoading: false,
    })),
  };
});

// Mock core auth store
vi.mock('@/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core')>();
  return {
    ...actual,
    useAuthStore: vi.fn(() => ({
      currentUserPubky: 'current-user-pubky',
    })),
  };
});

// Mock TaggerUserRow - this is what WhoTaggedExpandedList directly uses
vi.mock('@/molecules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/molecules')>();
  return {
    ...actual,
    TaggerUserRow: ({
      tagger,
      onUserClick,
      onFollowClick,
      isLoading,
      isCurrentUser,
    }: {
      tagger: { id: string; name?: string };
      onUserClick?: (id: string) => void;
      onFollowClick?: (id: string, isFollowing: boolean) => void;
      isLoading?: boolean;
      isCurrentUser?: boolean;
    }) => (
      <div data-testid={`user-list-item-${tagger.id}`} data-loading={isLoading} data-current-user={isCurrentUser}>
        <span>{tagger.name || tagger.id}</span>
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

  it('returns null when taggers array is empty', () => {
    const { container } = render(<WhoTaggedExpandedList taggerIds={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('navigates to user profile when user is clicked', () => {
    render(<WhoTaggedExpandedList taggerIds={mockTaggerIds} />);
    fireEvent.click(screen.getByTestId('user-click-user1'));
    expect(mockPush).toHaveBeenCalledWith('/profile/user1');
  });

  it('calls toggleFollow when follow button is clicked', () => {
    render(<WhoTaggedExpandedList taggerIds={mockTaggerIds} />);
    fireEvent.click(screen.getByTestId('follow-click-user1'));
    expect(mockToggleFollow).toHaveBeenCalledWith('user1', false);
  });

  it('applies custom data-testid', () => {
    render(<WhoTaggedExpandedList taggerIds={mockTaggerIds} data-testid="custom-test-id" />);
    expect(screen.getByTestId('custom-test-id')).toBeInTheDocument();
  });
});

describe('WhoTaggedExpandedList - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches snapshot with single user', () => {
    const { container } = render(<WhoTaggedExpandedList taggerIds={['user1']} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with multiple users', () => {
    const { container } = render(<WhoTaggedExpandedList taggerIds={mockTaggerIds} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with empty taggers', () => {
    const { container } = render(<WhoTaggedExpandedList taggerIds={[]} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
