import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserWithAvatar } from '@/hooks/useBulkUserAvatars/useBulkUserAvatars.types';
import type { UseMutedUsersResult } from '@/hooks/useMutedUsers/useMutedUsers.types';
import type { Pubky } from '@/models/models.types';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
import { HotTagsCardsSection } from './HotTagsCardsSection';

const mockUseBulkUserAvatars = vi.hoisted(() =>
  vi.fn(() => ({
    getUsersWithAvatars: vi.fn((_userIds: Pubky[]): UserWithAvatar[] => []),
  })),
);

const mockUseMutedUsers = vi.hoisted(() =>
  vi.fn(
    (): UseMutedUsersResult => ({
      mutedUserIds: [],
      mutedUserIdSet: new Set(),
      isMuted: (_userId: Pubky) => false,
      isLoading: false,
    }),
  ),
);

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('@/stores/hot/hot.store', () => ({
  useHotStore: vi.fn(() => ({
    reach: 'all',
    timeframe: 'this_month',
  })),
}));

const mockUseHotTags = vi.fn();

vi.mock('@/hooks/useHotTags/useHotTags', () => ({
  useHotTags: (params: unknown) => mockUseHotTags(params),
}));

const mockUseIsMobile = vi.hoisted(() => vi.fn((_options?: { breakpoint?: string }) => false));

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: (options?: { breakpoint?: string }) => mockUseIsMobile(options),
}));

vi.mock('@/hooks/useMutedUsers/useMutedUsers', () => ({
  useMutedUsers: mockUseMutedUsers,
}));

vi.mock('@/hooks/useBulkUserAvatars/useBulkUserAvatars', () => ({
  useBulkUserAvatars: mockUseBulkUserAvatars,
}));

vi.mock('@/config/tags', () => ({
  HOT_TAGS_FEATURED_COUNT: 3,
}));

const snapshotTaggers: UserWithAvatar[] = [
  { id: 'user1' as Pubky, name: 'Alice', avatarUrl: 'https://example.com/avatar1.png' },
  { id: 'user2' as Pubky, name: 'Bob', avatarUrl: 'https://example.com/avatar2.png' },
  { id: 'user3' as Pubky, name: 'Charlie', avatarUrl: 'https://example.com/avatar3.png' },
  { id: 'user4' as Pubky, name: 'Dave', avatarUrl: 'https://example.com/avatar4.png' },
  { id: 'user5' as Pubky, name: 'Eve', avatarUrl: 'https://example.com/avatar5.png' },
];

const snapshotRawTags = [
  { label: 'bitcoin', tagged_count: 16, taggers_id: ['user1', 'user2', 'user3', 'user4', 'user5'] },
  { label: 'keys', tagged_count: 176, taggers_id: ['user1', 'user2', 'user3', 'user4', 'user5'] },
  { label: 'pubky', tagged_count: 149, taggers_id: ['user1', 'user2', 'user3', 'user4', 'user5'] },
];

function mockDesktopViewportBreakpoints() {
  mockUseIsMobile.mockImplementation((options?: { breakpoint?: string }) => {
    if (options?.breakpoint === 'sm') return false;
    if (options?.breakpoint === 'xl') return true;
    return false;
  });
}

function mockMobileViewportBreakpoints() {
  mockUseIsMobile.mockImplementation((options?: { breakpoint?: string }) => {
    if (options?.breakpoint === 'sm') return true;
    if (options?.breakpoint === 'xl') return true;
    return true;
  });
}

function setupSnapshotTaggers() {
  mockUseBulkUserAvatars.mockImplementation(() => ({
    getUsersWithAvatars: vi.fn((_userIds: Pubky[]): UserWithAvatar[] => snapshotTaggers),
  }));
}

describe('HotTagsCardsSection', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockUseHotTags.mockClear();
    mockUseBulkUserAvatars.mockImplementation(() => ({
      getUsersWithAvatars: vi.fn((_userIds: Pubky[]): UserWithAvatar[] => []),
    }));
    mockUseMutedUsers.mockImplementation(
      (): UseMutedUsersResult => ({
        mutedUserIds: [],
        mutedUserIdSet: new Set(),
        isMuted: (_userId: Pubky) => false,
        isLoading: false,
      }),
    );
  });

  it('renders heading and empty state when tags are empty', () => {
    mockUseHotTags.mockReturnValue({
      rawTags: [],
      isLoading: false,
      error: null,
    });

    render(<HotTagsCardsSection />);

    expect(screen.getByTestId('hot-tags-cards-section')).toBeInTheDocument();
    expect(screen.getByText('Hot tags')).toBeInTheDocument();
    expect(screen.getByText('No tags to show')).toBeInTheDocument();
  });

  it('renders tag cards when tags are available', () => {
    mockUseHotTags.mockReturnValue({
      rawTags: [
        { label: 'bitcoin', tagged_count: 16, taggers_id: [] },
        { label: 'keys', tagged_count: 176, taggers_id: [] },
        { label: 'pubky', tagged_count: 149, taggers_id: [] },
      ],
      isLoading: false,
      error: null,
    });

    render(<HotTagsCardsSection />);

    expect(screen.getByTestId('hot-tags-cards-section')).toBeInTheDocument();
    expect(screen.getByTestId('hot-tag-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('hot-tag-card-2')).toBeInTheDocument();
    expect(screen.getByTestId('hot-tag-card-3')).toBeInTheDocument();
  });

  it('renders error state with heading', () => {
    mockUseHotTags.mockReturnValue({
      rawTags: [],
      isLoading: false,
      error: 'Network error',
    });

    render(<HotTagsCardsSection />);

    expect(screen.getByText('Hot tags')).toBeInTheDocument();
    expect(screen.getByText('Failed to load tags')).toBeInTheDocument();
  });

  it('renders loading state with heading and skeleton', () => {
    mockUseHotTags.mockReturnValue({
      rawTags: [],
      isLoading: true,
      error: null,
    });

    render(<HotTagsCardsSection />);

    expect(screen.getByText('Hot tags')).toBeInTheDocument();
    expect(screen.getByTestId('hot-tags-card-skeleton-0')).toBeInTheDocument();
    expect(screen.getByTestId('hot-tags-card-skeleton-1')).toBeInTheDocument();
    expect(screen.getByTestId('hot-tags-card-skeleton-2')).toBeInTheDocument();
  });

  it('excludes muted taggers from avatar bulk fetch and HotTagCard taggers', () => {
    mockUseMutedUsers.mockImplementation(
      (): UseMutedUsersResult => ({
        mutedUserIds: ['muted-author'],
        mutedUserIdSet: new Set(['muted-author']),
        isMuted: (id: Pubky) => id === 'muted-author',
        isLoading: false,
      }),
    );

    const getUsersWithAvatars = vi.fn(() => []);
    mockUseBulkUserAvatars.mockImplementation(() => ({ getUsersWithAvatars }));

    mockUseHotTags.mockReturnValue({
      rawTags: [
        { label: 'bitcoin', tagged_count: 16, taggers_id: ['muted-author', 'visible-author'] },
        { label: 'keys', tagged_count: 176, taggers_id: [] },
        { label: 'pubky', tagged_count: 149, taggers_id: [] },
      ],
      isLoading: false,
      error: null,
    });

    render(<HotTagsCardsSection />);

    expect(mockUseBulkUserAvatars).toHaveBeenCalledWith(['visible-author']);
    expect(getUsersWithAvatars).toHaveBeenCalledWith(['visible-author']);
  });
});

describe('HotTagsCardsSection - Snapshots', () => {
  beforeEach(() => {
    mockDesktopViewportBreakpoints();
    setupSnapshotTaggers();
    mockUseHotTags.mockReturnValue({
      rawTags: snapshotRawTags,
      isLoading: false,
      error: null,
    });
  });

  it('matches snapshot with featured tags', () => {
    const { container } = render(<HotTagsCardsSection />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('HotTagsCardsSection - Mobile Snapshots', () => {
  beforeEach(() => {
    mockMobileViewportBreakpoints();
    setMobileViewport();
    setupSnapshotTaggers();
    mockUseHotTags.mockReturnValue({
      rawTags: snapshotRawTags,
      isLoading: false,
      error: null,
    });
  });

  afterEach(() => {
    resetViewport();
  });

  it('matches snapshot on mobile viewport', () => {
    const { container } = render(<HotTagsCardsSection />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
