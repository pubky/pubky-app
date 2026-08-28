import { render, screen, waitFor } from '@testing-library/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileController } from '@/controllers/file/file';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { FeedbackCard } from './FeedbackCard';

// Mock dexie-react-hooks
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(),
}));

// Mock dependencies
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: vi.fn(),
}));
vi.mock('@/controllers/profile/profile', () => ({
  ProfileController: {
    read: vi.fn(),
  },
}));
vi.mock('@/controllers/user/user', () => ({
  UserController: {
    getDetails: vi.fn().mockResolvedValue(null),
    getOrFetchDetails: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getAvatarUrl: vi.fn((pubky: string) => `https://cdn.example.com/avatar/${pubky}`),
  },
}));

vi.mock('@/hooks/useCurrentUserProfile/useCurrentUserProfile', () => ({
  useCurrentUserProfile: vi.fn(),
}));

// Mock Organisms
vi.mock('@/organisms/AvatarWithFallback/AvatarWithFallback', () => {
  return {
    AvatarWithFallback: ({
      avatarUrl,
      name,
      className,
      fallbackClassName,
    }: {
      avatarUrl?: string;
      name: string;
      className?: string;
      fallbackClassName?: string;
    }) => (
      <div
        data-testid="avatar-with-fallback"
        data-avatar-url={avatarUrl || 'no-url'}
        data-name={name}
        className={className}
      >
        {avatarUrl ? (
          <img data-testid="avatar-image" src={avatarUrl} alt={name} />
        ) : (
          <div data-testid="avatar-fallback" className={fallbackClassName}>
            {name.charAt(0)}
          </div>
        )}
      </div>
    ),
  };
});

vi.mock('@/organisms/DialogFeedback/DialogFeedback', () => {
  return {
    DialogFeedback: () => <div data-testid="dialog-feedback" />,
  };
});

// Mock Molecules
vi.mock('@/molecules/Toaster/toast');

// Mock Atoms
vi.mock('@/atoms/Button/Button', () => {
  return {
    Button: ({
      children,
      className,
      ...props
    }: {
      children: React.ReactNode;
      className?: string;
      [key: string]: unknown;
    }) => (
      <button data-testid="button" className={className} {...props}>
        {children}
      </button>
    ),
  };
});

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({
      children,
      className,
      'data-testid': dataTestId,
      ...props
    }: {
      children: React.ReactNode;
      className?: string;
      'data-testid'?: string;
      [key: string]: unknown;
    }) => (
      <div data-testid={dataTestId || 'container'} className={className} {...props}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Heading/Heading', () => {
  return {
    Heading: ({
      children,
      level,
      size,
      className,
    }: {
      children: React.ReactNode;
      level?: number;
      size?: string;
      className?: string;
    }) => (
      <div data-testid="heading" data-level={level} data-size={size} className={className}>
        {children}
      </div>
    ),
  };
});

describe('FeedbackCard', () => {
  const mockPubky = 'user123pubky';
  const mockUseLiveQuery = vi.mocked(useLiveQuery);
  const mockUseAuthStore = vi.mocked(useAuthStore);
  const mockUseCurrentUserProfile = vi.mocked(useCurrentUserProfile);

  beforeEach(() => {
    vi.clearAllMocks();
    // Make useCurrentUserProfile delegate to the existing mocks
    mockUseCurrentUserProfile.mockImplementation((): ReturnType<typeof useCurrentUserProfile> => {
      const currentUserPubky = mockUseAuthStore(
        (state: { currentUserPubky: string | null }) => state.currentUserPubky,
      ) as string | null;
      const userDetails = mockUseLiveQuery(() => null, [], null) as NexusUserDetails | null | undefined;
      return { userDetails, currentUserPubky };
    });
  });

  describe('User Authentication', () => {
    it('renders with authenticated user with avatar image', async () => {
      mockUseAuthStore.mockReturnValue({ currentUserPubky: mockPubky } as never);
      mockUseLiveQuery.mockReturnValue({
        id: mockPubky,
        name: 'Miguel Medeiros',
        image: 'avatar.jpg',
      } as never);

      render(<FeedbackCard />);

      await waitFor(() => {
        expect(screen.getByTestId('feedback-card')).toBeInTheDocument();
      });

      const avatarWithFallback = screen.getByTestId('avatar-with-fallback');
      expect(avatarWithFallback).toHaveAttribute('data-avatar-url', `https://cdn.example.com/avatar/${mockPubky}`);
      expect(avatarWithFallback).toHaveAttribute('data-name', 'Miguel Medeiros');

      expect(screen.getByTestId('avatar-image')).toHaveAttribute('alt', 'Miguel Medeiros');
    });

    it('renders with authenticated user without avatar image', async () => {
      mockUseAuthStore.mockReturnValue({ currentUserPubky: mockPubky } as never);
      mockUseLiveQuery.mockReturnValue({
        name: 'Miguel Medeiros',
        image: null,
      } as never);

      render(<FeedbackCard />);

      await waitFor(() => {
        const avatarWithFallback = screen.getByTestId('avatar-with-fallback');
        expect(avatarWithFallback).toHaveAttribute('data-avatar-url', 'no-url');
        expect(screen.getByTestId('avatar-fallback')).toBeInTheDocument();
        expect(screen.getByTestId('avatar-fallback')).toHaveTextContent('M');
      });
    });

    it('renders with default name when user is not authenticated', async () => {
      mockUseAuthStore.mockReturnValue({ currentUserPubky: null } as never);
      mockUseLiveQuery.mockReturnValue(null as never);

      render(<FeedbackCard />);

      await waitFor(() => {
        const avatarWithFallback = screen.getByTestId('avatar-with-fallback');
        expect(avatarWithFallback).toHaveAttribute('data-name', 'Your Name');
      });
    });

    it('renders with default name when userDetails is null', async () => {
      mockUseAuthStore.mockReturnValue({ currentUserPubky: mockPubky } as never);
      mockUseLiveQuery.mockReturnValue(null as never);

      render(<FeedbackCard />);

      await waitFor(() => {
        expect(screen.getByTestId('avatar-with-fallback')).toHaveAttribute('data-name', 'Your Name');
      });
    });
  });

  describe('Avatar Name Handling', () => {
    it('passes the full name to the avatar for long names', async () => {
      mockUseAuthStore.mockReturnValue({ currentUserPubky: mockPubky } as never);
      mockUseLiveQuery.mockReturnValue({
        name: 'VeryLongUserName',
        image: null,
      } as never);

      render(<FeedbackCard />);

      await waitFor(() => {
        const avatarWithFallback = screen.getByTestId('avatar-with-fallback');
        expect(avatarWithFallback).toHaveAttribute('data-name', 'VeryLongUserName');
        expect(screen.getByTestId('avatar-fallback')).toHaveTextContent('V');
      });
    });

    it('passes short names to the avatar and renders the correct fallback initial', async () => {
      mockUseAuthStore.mockReturnValue({ currentUserPubky: mockPubky } as never);
      mockUseLiveQuery.mockReturnValue({
        name: 'John',
        image: null,
      } as never);

      render(<FeedbackCard />);

      await waitFor(() => {
        const avatarWithFallback = screen.getByTestId('avatar-with-fallback');
        expect(avatarWithFallback).toHaveAttribute('data-name', 'John');
        expect(screen.getByTestId('avatar-fallback')).toHaveTextContent('J');
      });
    });

    it('passes medium length names to the avatar and renders the correct fallback initial', async () => {
      mockUseAuthStore.mockReturnValue({ currentUserPubky: mockPubky } as never);
      mockUseLiveQuery.mockReturnValue({
        name: '1234567890',
        image: null,
      } as never);

      render(<FeedbackCard />);

      await waitFor(() => {
        const avatarWithFallback = screen.getByTestId('avatar-with-fallback');
        expect(avatarWithFallback).toHaveAttribute('data-name', '1234567890');
        expect(screen.getByTestId('avatar-fallback')).toHaveTextContent('1');
      });
    });
  });

  describe('Avatar Handling', () => {
    it('shows avatar image when user has image', async () => {
      mockUseAuthStore.mockReturnValue({ currentUserPubky: mockPubky } as never);
      mockUseLiveQuery.mockReturnValue({
        name: 'Miguel',
        image: 'has-image.jpg',
      } as never);

      render(<FeedbackCard />);

      await waitFor(() => {
        expect(screen.getByTestId('avatar-image')).toBeInTheDocument();
      });
    });

    it('shows avatar fallback when user has no image', async () => {
      mockUseAuthStore.mockReturnValue({ currentUserPubky: mockPubky } as never);
      mockUseLiveQuery.mockReturnValue({
        name: 'Miguel',
        image: null,
      } as never);

      render(<FeedbackCard />);

      await waitFor(() => {
        expect(screen.getByTestId('avatar-fallback')).toBeInTheDocument();
        expect(screen.getByTestId('avatar-fallback')).toHaveTextContent('M');
      });
    });

    it('does not call getAvatarUrl when image is not available', async () => {
      const mockGetAvatarUrl = vi.mocked(FileController.getAvatarUrl);
      mockUseAuthStore.mockReturnValue({ currentUserPubky: mockPubky } as never);
      mockUseLiveQuery.mockReturnValue({
        name: 'Miguel',
        image: null,
      } as never);

      render(<FeedbackCard />);

      await waitFor(() => {
        expect(screen.getByTestId('avatar-fallback')).toBeInTheDocument();
      });

      // Should not be called because image is null
      expect(mockGetAvatarUrl).not.toHaveBeenCalled();
    });

    it('calls getAvatarUrl with correct pubky when image exists', async () => {
      const mockGetAvatarUrl = vi.mocked(FileController.getAvatarUrl);
      mockUseAuthStore.mockReturnValue({ currentUserPubky: mockPubky } as never);
      mockUseLiveQuery.mockReturnValue({
        id: mockPubky,
        name: 'Miguel',
        image: 'avatar.jpg',
      } as never);

      render(<FeedbackCard />);

      await waitFor(() => {
        expect(mockGetAvatarUrl).toHaveBeenCalledWith(mockPubky);
      });
    });

    it('does not call getAvatarUrl when currentUserPubky is null', async () => {
      const mockGetAvatarUrl = vi.mocked(FileController.getAvatarUrl);
      mockUseAuthStore.mockReturnValue({ currentUserPubky: null } as never);
      mockUseLiveQuery.mockReturnValue(null as never); // When no pubky, userDetails should be null

      render(<FeedbackCard />);

      await waitFor(() => {
        expect(screen.getByTestId('feedback-card')).toBeInTheDocument();
      });

      expect(mockGetAvatarUrl).not.toHaveBeenCalled();
    });
  });

  describe('UI Structure', () => {
    it('renders skeleton while user profile is loading', async () => {
      mockUseAuthStore.mockReturnValue({ currentUserPubky: mockPubky } as never);
      mockUseLiveQuery.mockReturnValue(undefined as never);

      render(<FeedbackCard />);

      await waitFor(() => {
        expect(screen.getByTestId('feedback-card-skeleton')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('feedback-card')).not.toBeInTheDocument();
      expect(screen.queryByTestId('avatar-with-fallback')).not.toBeInTheDocument();
    });

    it('renders feedback heading correctly', async () => {
      mockUseAuthStore.mockReturnValue({ currentUserPubky: null } as never);
      mockUseLiveQuery.mockReturnValue(null as never);

      render(<FeedbackCard />);

      const heading = screen.getByText('Feedback');
      expect(heading).toBeInTheDocument();
      expect(heading).toHaveClass('font-light', 'text-muted-foreground');
    });

    it('renders feedback question button', async () => {
      mockUseAuthStore.mockReturnValue({ currentUserPubky: null } as never);
      mockUseLiveQuery.mockReturnValue(null as never);

      render(<FeedbackCard />);

      const button = screen.getByTestId('button');
      expect(button).toHaveTextContent('What do you think about Pubky?');
      expect(button).toHaveClass('text-left', 'text-base', 'leading-normal', 'font-medium', 'text-muted-foreground');
    });

    it('applies correct container classes', async () => {
      mockUseAuthStore.mockReturnValue({ currentUserPubky: null } as never);
      mockUseLiveQuery.mockReturnValue(null as never);

      render(<FeedbackCard />);

      const container = screen.getByTestId('feedback-card');
      expect(container).toHaveClass('flex', 'flex-col', 'gap-2');
    });

    it('applies correct avatar container classes', async () => {
      mockUseAuthStore.mockReturnValue({ currentUserPubky: mockPubky } as never);
      mockUseLiveQuery.mockReturnValue({
        name: 'Miguel',
        image: null,
      } as never);

      render(<FeedbackCard />);

      await waitFor(() => {
        const avatarWithFallback = screen.getByTestId('avatar-with-fallback');
        expect(avatarWithFallback).toHaveClass('h-12', 'w-12');
      });
    });
  });

  describe('Data Flow', () => {
    it('fetches user details when currentUserPubky is available', async () => {
      mockUseAuthStore.mockReturnValue({ currentUserPubky: mockPubky } as never);
      mockUseCurrentUserProfile.mockReturnValue({
        userDetails: { name: 'Miguel', image: null },
        currentUserPubky: mockPubky,
      } as never);

      render(<FeedbackCard />);

      await waitFor(() => {
        expect(mockUseCurrentUserProfile).toHaveBeenCalled();
      });
    });

    it('does not fetch user details when currentUserPubky is null', async () => {
      mockUseAuthStore.mockReturnValue({ currentUserPubky: null } as never);
      mockUseLiveQuery.mockReturnValue(null as never);

      render(<FeedbackCard />);

      await waitFor(() => {
        expect(screen.getByTestId('feedback-card')).toBeInTheDocument();
      });
    });
  });
});

describe('FeedbackCard - Snapshots', () => {
  const mockPubky = 'user123pubky';
  const mockUseLiveQuery = vi.mocked(useLiveQuery);
  const mockUseAuthStore = vi.mocked(useAuthStore);
  const mockUseCurrentUserProfile = vi.mocked(useCurrentUserProfile);

  beforeEach(() => {
    vi.clearAllMocks();
    // Make useCurrentUserProfile delegate to the existing mocks
    mockUseCurrentUserProfile.mockImplementation((): ReturnType<typeof useCurrentUserProfile> => {
      const currentUserPubky = mockUseAuthStore(
        (state: { currentUserPubky: string | null }) => state.currentUserPubky,
      ) as string | null;
      const userDetails = mockUseLiveQuery(() => null, [], null) as NexusUserDetails | null | undefined;
      return { userDetails, currentUserPubky };
    });
  });

  it('matches snapshot with authenticated user with avatar', async () => {
    mockUseAuthStore.mockReturnValue({ currentUserPubky: mockPubky } as never);
    mockUseLiveQuery.mockReturnValue({
      id: mockPubky,
      name: 'Miguel Medeiros',
      image: 'avatar.jpg',
    } as never);

    const { container } = render(<FeedbackCard />);

    await waitFor(() => {
      expect(screen.getByTestId('avatar-image')).toBeInTheDocument();
    });

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with authenticated user without avatar', async () => {
    mockUseAuthStore.mockReturnValue({ currentUserPubky: mockPubky } as never);
    mockUseLiveQuery.mockReturnValue({
      name: 'Miguel',
      image: null,
    } as never);

    const { container } = render(<FeedbackCard />);

    await waitFor(() => {
      expect(screen.getByTestId('avatar-fallback')).toBeInTheDocument();
    });

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with unauthenticated user', async () => {
    mockUseAuthStore.mockReturnValue({ currentUserPubky: null } as never);
    mockUseLiveQuery.mockReturnValue(null as never);

    const { container } = render(<FeedbackCard />);

    await waitFor(() => {
      expect(screen.getByTestId('feedback-card')).toBeInTheDocument();
    });

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with long name (CSS truncation)', async () => {
    mockUseAuthStore.mockReturnValue({ currentUserPubky: mockPubky } as never);
    mockUseLiveQuery.mockReturnValue({
      name: 'VeryLongUserNameThatExceedsTenCharacters',
      image: null,
    } as never);

    const { container } = render(<FeedbackCard />);

    await waitFor(() => {
      expect(screen.getByTestId('avatar-fallback')).toBeInTheDocument();
    });

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when loading', async () => {
    mockUseAuthStore.mockReturnValue({ currentUserPubky: mockPubky } as never);
    mockUseLiveQuery.mockReturnValue(undefined as never);

    const { container } = render(<FeedbackCard />);

    await waitFor(() => {
      expect(screen.getByTestId('feedback-card-skeleton')).toBeInTheDocument();
    });

    expect(container.firstChild).toMatchSnapshot();
  });
});
