import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FileController } from '@/controllers/file/file';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { useLocalFirstQuery } from '@/hooks/useLocalFirstQuery/useLocalFirstQuery';
import { Collections } from './Collections';

vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getAvatarUrl: vi.fn(
      (pubky: string, version?: string | number) => `https://example.com/avatar/${pubky}?v=${version}`,
    ),
  },
}));

vi.mock('@/hooks/useCurrentUserProfile/useCurrentUserProfile', () => ({
  useCurrentUserProfile: vi.fn(() => ({
    currentUserPubky: 'test-pubky',
    userDetails: {
      id: 'test-pubky',
      name: 'Test User',
      image: 'avatar',
      indexed_at: 123,
      bio: '',
      links: [],
      status: '',
    },
  })),
}));

vi.mock('@/hooks/useLocalFirstQuery/useLocalFirstQuery', () => ({
  useLocalFirstQuery: vi.fn(() => ({
    data: { bookmarks: 29 },
    isLoading: false,
  })),
}));

vi.mock('@/stores/localFiles/localFiles.store', () => ({
  useLocalFilesStore: vi.fn((selector: (state: { profile: string | null }) => unknown) => selector({ profile: null })),
}));

vi.mock('@/organisms/AvatarWithFallback/AvatarWithFallback', () => ({
  AvatarWithFallback: ({
    avatarUrl,
    name,
    fallbackSeed,
    size,
  }: {
    avatarUrl?: string;
    name: string;
    fallbackSeed?: string;
    size?: string;
  }) => (
    <div
      data-testid="avatar-with-fallback"
      data-avatar-url={avatarUrl}
      data-name={name}
      data-fallback-seed={fallbackSeed}
      data-size={size}
    >
      {name}
    </div>
  ),
}));

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({
    children,
    showLeftMobileButton,
    showRightMobileButton,
    className,
  }: {
    children: ReactNode;
    showLeftMobileButton?: boolean;
    showRightMobileButton?: boolean;
    className?: string;
  }) => (
    <div
      data-testid="content-layout"
      data-show-left-mobile-button={String(showLeftMobileButton)}
      data-show-right-mobile-button={String(showRightMobileButton)}
      className={className}
    >
      {children}
    </div>
  ),
}));

describe('Collections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useCurrentUserProfile).mockReturnValue({
      currentUserPubky: 'test-pubky',
      userDetails: {
        id: 'test-pubky',
        name: 'Test User',
        image: 'avatar',
        indexed_at: 123,
        bio: '',
        links: [],
        status: '',
      },
    });
    vi.mocked(useLocalFirstQuery).mockReturnValue({
      data: { bookmarks: 29 },
      isLoading: false,
    });
  });

  it('renders the Collections landing page with the default Bookmarks collection', () => {
    render(<Collections />);

    expect(screen.getByRole('heading', { name: 'My Collections' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Bookmarks' })).toHaveAttribute('href', '/collections/bookmarks');
    expect(screen.getByText('Everything you want to save for later.')).toBeInTheDocument();
    expect(screen.getByText('29')).toBeInTheDocument();
    expect(screen.getByText('PRIVATE')).toBeInTheDocument();
  });

  it('renders current user avatar metadata on the Bookmarks card', () => {
    render(<Collections />);

    expect(FileController.getAvatarUrl).toHaveBeenCalledWith('test-pubky', 123);
    const avatar = screen.getByTestId('avatar-with-fallback');
    expect(avatar).toHaveAttribute('data-avatar-url', 'https://example.com/avatar/test-pubky?v=123');
    expect(avatar).toHaveAttribute('data-name', 'Test User');
    expect(avatar).toHaveAttribute('data-fallback-seed', 'test-pubky');
  });

  it('renders without feed drawer mobile buttons', () => {
    render(<Collections />);

    const contentLayout = screen.getByTestId('content-layout');
    expect(contentLayout).toHaveAttribute('data-show-left-mobile-button', 'false');
    expect(contentLayout).toHaveAttribute('data-show-right-mobile-button', 'false');
  });
});

describe('Collections - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<Collections />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
