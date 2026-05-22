import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SinglePostParticipants } from './SinglePostParticipants';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock hooks
const mockUsePostParticipants = vi.fn();
const mockToggleFollow = vi.fn();
const mockIsUserLoading = vi.fn(() => false);

vi.mock('@/hooks/usePostParticipants/usePostParticipants', () => ({
  usePostParticipants: () => mockUsePostParticipants(),
}));

vi.mock('@/hooks/useFollowUser/useFollowUser', () => ({
  useFollowUser: () => ({
    toggleFollow: mockToggleFollow,
    isUserLoading: mockIsUserLoading,
  }),
}));

vi.mock('@/hooks/useIsFollowing/useIsFollowing', () => ({
  useIsFollowing: () => ({
    isFollowing: false,
    isLoading: false,
  }),
}));

// Mock app routes
vi.mock('@/app/routes', () => ({
  APP_ROUTES: {
    PROFILE: '/profile',
  },
}));

// Mock molecules
vi.mock('@/molecules/SidebarSection/SidebarSection', () => {
  return {
    SidebarSection: ({
      title,
      children,
      className,
      'data-testid': dataTestId,
    }: {
      title: string;
      children: React.ReactNode;
      className?: string;
      'data-testid'?: string;
    }) => (
      <div data-testid={dataTestId} className={className}>
        <h2>{title}</h2>
        {children}
      </div>
    ),
  };
});

// Mock organisms
vi.mock('@/organisms/UserListItem/UserListItem', () => {
  return {
    UserListItem: ({
      user,
      onUserClick,
      onFollowClick,
    }: {
      user: { id: string; name?: string };
      onUserClick?: (id: string) => void;
      onFollowClick?: (id: string, isFollowing: boolean) => void;
    }) => (
      <div data-testid={`user-list-item-${user.id}`}>
        <button onClick={() => onUserClick?.(user.id)} data-testid={`user-click-${user.id}`}>
          {user.name || user.id}
        </button>
        <button onClick={() => onFollowClick?.(user.id, false)} data-testid={`follow-click-${user.id}`}>
          Follow
        </button>
      </div>
    ),
  };
});

// Mock atoms
vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div className={className}>{children}</div>
    ),
  };
});

vi.mock('@/atoms/Skeleton/Skeleton', () => {
  return {
    Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
  };
});

vi.mock('@/atoms/Spinner/Spinner', () => {
  return {
    Spinner: ({ size }: { size: string }) => <div data-testid="spinner" data-size={size} />,
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  };
});

// Mock dependencies
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: vi.fn((selector) => {
    const mockState = {
      currentUserPubky: 'mock-current-user',
      selectCurrentUserPubky: () => 'mock-current-user',
    };
    return selector ? selector(mockState) : mockState;
  }),
}));

describe('SinglePostParticipants', () => {
  const mockPostId = 'author:post123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loading state', () => {
    it('should render loading spinner when isLoading and no participants', () => {
      mockUsePostParticipants.mockReturnValue({
        participants: [],
        isLoading: true,
        error: null,
      });

      render(<SinglePostParticipants postId={mockPostId} />);

      expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
    });
  });

  describe('empty state', () => {
    it('should not render anything when no participants', () => {
      mockUsePostParticipants.mockReturnValue({
        participants: [],
        isLoading: false,
        error: null,
      });

      const { container } = render(<SinglePostParticipants postId={mockPostId} />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe('with participants', () => {
    const mockParticipants = [
      { id: 'user1', name: 'User One', avatarUrl: 'https://test.com/1.jpg', isFollowing: false },
      { id: 'user2', name: 'User Two', avatarUrl: 'https://test.com/2.jpg', isFollowing: true },
    ];

    beforeEach(() => {
      mockUsePostParticipants.mockReturnValue({
        participants: mockParticipants,
        isLoading: false,
        error: null,
      });
    });

    it('should render sidebar section with participants', () => {
      render(<SinglePostParticipants postId={mockPostId} />);

      expect(screen.getByTestId('single-post-participants')).toBeInTheDocument();
      expect(screen.getByText('Participants')).toBeInTheDocument();
      expect(screen.getByTestId('user-list-item-user1')).toBeInTheDocument();
      expect(screen.getByTestId('user-list-item-user2')).toBeInTheDocument();
    });

    it('should navigate to profile on user click', () => {
      render(<SinglePostParticipants postId={mockPostId} />);

      fireEvent.click(screen.getByTestId('user-click-user1'));

      expect(mockPush).toHaveBeenCalledWith('/profile/user1');
    });

    it('should call toggleFollow on follow click', async () => {
      render(<SinglePostParticipants postId={mockPostId} />);

      fireEvent.click(screen.getByTestId('follow-click-user1'));

      expect(mockToggleFollow).toHaveBeenCalledWith('user1', false);
    });
  });

  describe('className prop', () => {
    it('should apply custom className', () => {
      mockUsePostParticipants.mockReturnValue({
        participants: [{ id: 'user1', name: 'User One' }],
        isLoading: false,
        error: null,
      });

      render(<SinglePostParticipants postId={mockPostId} className="custom-class" />);

      expect(screen.getByTestId('single-post-participants')).toHaveClass('custom-class');
    });
  });
});
