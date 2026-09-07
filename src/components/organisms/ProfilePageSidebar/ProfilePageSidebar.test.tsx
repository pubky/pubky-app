import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NexusSocialGraphStatus } from '@/services/nexus/nexus.types';
import { ProfilePageSidebar } from './ProfilePageSidebar';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  usePathname: () => '/profile/posts',
}));

// Mock dexie-react-hooks
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(() => null),
}));

// Mock auth store
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: vi.fn(() => ({
    selectCurrentUserPubky: () => 'test-pubky-123',
  })),
}));
vi.mock('@/controllers/profile/profile', () => ({
  ProfileController: {
    read: vi.fn().mockResolvedValue({
      links: [
        { title: 'Example Link', url: 'https://example.com' },
        { title: 'GitHub', url: 'https://github.com/test' },
      ],
    }),
  },
}));

// Mock @/providers
vi.mock('@/providers/ProfileProvider/ProfileProvider', () => ({
  useProfileContext: vi.fn(() => ({
    pubky: 'test-pubky-123',
    isOwnProfile: true,
    isLoading: false,
  })),
}));

// Mock hooks
vi.mock('@/hooks/useCurrentUserProfile/useCurrentUserProfile', () => ({
  useCurrentUserProfile: vi.fn(() => ({
    userDetails: null,
    currentUserPubky: 'test-pubky-123',
  })),
}));

vi.mock('@/hooks/useTagged/useTagged', () => ({
  useTagged: vi.fn(() => ({
    tags: [],
    isLoading: false,
    handleTagToggle: vi.fn(),
  })),
}));

vi.mock('@/hooks/useUserProfile/useUserProfile', () => ({
  useUserProfile: vi.fn(() => ({
    profile: { links: null },
    isLoading: false,
  })),
}));

vi.mock('@/hooks/useAvatarUrl/useAvatarUrl', () => ({
  useAvatarUrl: vi.fn(() => undefined),
}));

const mockUseSocialGraphStatus = vi.fn((_pubky?: string | null) => ({
  status: null as NexusSocialGraphStatus | null,
  isLoading: false,
}));
vi.mock('@/hooks/useSocialGraphStatus/useSocialGraphStatus', () => ({
  useSocialGraphStatus: (pubky: string | null) => mockUseSocialGraphStatus(pubky),
}));

describe('ProfilePageSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSocialGraphStatus.mockReturnValue({ status: null, isLoading: false });
  });

  it('hides the social graph section when no tier is known', () => {
    render(<ProfilePageSidebar />);
    expect(screen.queryByText('Social Graph')).not.toBeInTheDocument();
  });

  it('renders the social graph section above the tags when a tier is known', () => {
    mockUseSocialGraphStatus.mockReturnValue({ status: NexusSocialGraphStatus.NETWORKED, isLoading: false });
    const { container } = render(<ProfilePageSidebar />);

    expect(mockUseSocialGraphStatus).toHaveBeenCalledWith('test-pubky-123');
    expect(screen.getByText('Social Graph')).toBeInTheDocument();
    expect(screen.getByText('Networked')).toHaveAttribute('data-status', 'networked');
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement.firstChild).toHaveAttribute('data-cy', 'profile-social-graph-section');
  });

  it('renders ProfilePageTaggedAs component', () => {
    render(<ProfilePageSidebar />);
    expect(screen.getByText('Tagged as')).toBeInTheDocument();
  });

  it('renders ProfilePageLinks component', () => {
    render(<ProfilePageSidebar />);
    expect(screen.getByText('Links')).toBeInTheDocument();
  });

  it('renders FeedbackCard component', () => {
    render(<ProfilePageSidebar />);
    expect(screen.getByTestId('feedback-card')).toBeInTheDocument();
  });

  it('has correct structure with sticky positioning', () => {
    const { container } = render(<ProfilePageSidebar />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toHaveClass('w-(--filter-bar-width)', 'flex-col', 'gap-6', 'self-start', 'lg:flex', 'sticky');
  });

  it('renders with empty tags initially', () => {
    render(<ProfilePageSidebar />);
    expect(screen.getByText('No tags added yet.')).toBeInTheDocument();
  });

  it('renders heading and container structure', () => {
    render(<ProfilePageSidebar />);
    expect(screen.getByText('Tagged as')).toBeInTheDocument();
    expect(screen.getByText('Links')).toBeInTheDocument();
  });
});

describe('ProfilePageSidebar - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSocialGraphStatus.mockReturnValue({ status: null, isLoading: false });
  });

  it('matches snapshot with default state', () => {
    const { container } = render(<ProfilePageSidebar />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with a social graph tier', () => {
    mockUseSocialGraphStatus.mockReturnValue({ status: NexusSocialGraphStatus.ESTABLISHED, isLoading: false });
    const { container } = render(<ProfilePageSidebar />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot structure', () => {
    const { container } = render(<ProfilePageSidebar />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement.tagName).toBe('DIV');
    expect(rootElement.children.length).toBe(3);
  });
});
