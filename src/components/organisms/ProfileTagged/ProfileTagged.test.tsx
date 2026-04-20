import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProfileTagged } from './ProfileTagged';
import * as Hooks from '@/hooks';

// Mock providers
vi.mock('@/providers', () => ({
  useProfileContext: () => ({
    pubky: 'test-user-pubky',
    isOwnProfile: true,
    isLoading: false,
  }),
}));

// Mock hooks
vi.mock('@/hooks', () => ({
  useCurrentUserProfile: vi.fn(),
  useUserProfile: vi.fn(),
  useTagged: vi.fn(),
}));

// Mock molecules
vi.mock('@/molecules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/molecules')>();
  return {
    ...actual,
    TaggedSection: () => <div data-testid="tagged-section">TaggedSection</div>,
    TaggedEmpty: () => <div data-testid="tagged-empty">TaggedEmpty</div>,
  };
});

const mockUseCurrentUserProfile = vi.mocked(Hooks.useCurrentUserProfile);
const mockUseUserProfile = vi.mocked(Hooks.useUserProfile);
const mockUseTagged = vi.mocked(Hooks.useTagged);

const mockTaggedOneTag = {
  tags: [
    {
      label: 'bitcoin',
      taggers: [{ id: 'user1', avatarUrl: 'https://cdn.example.com/avatar/user1' }],
      taggers_count: 1,
      relationship: false,
    },
  ],
  count: 1,
  isLoading: false,
  isLoadingMore: false,
  hasMore: false,
  loadMore: vi.fn(),
  handleTagAdd: vi.fn().mockResolvedValue({ success: true }),
  handleTagToggle: vi.fn(),
};

const mockTaggedLoading = {
  tags: [],
  count: 0,
  isLoading: true,
  isLoadingMore: false,
  hasMore: false,
  loadMore: vi.fn(),
  handleTagAdd: vi.fn(),
  handleTagToggle: vi.fn(),
};

const mockTaggedEmpty = {
  tags: [],
  count: 0,
  isLoading: false,
  isLoadingMore: false,
  hasMore: false,
  loadMore: vi.fn(),
  handleTagAdd: vi.fn(),
  handleTagToggle: vi.fn(),
};

// Set up common mocks that are shared across all tests
beforeEach(() => {
  vi.clearAllMocks();
  mockUseCurrentUserProfile.mockReturnValue({
    userDetails: { name: 'Satoshi' },
    currentUserPubky: 'test-user-pubky',
  } as ReturnType<typeof Hooks.useCurrentUserProfile>);
  mockUseUserProfile.mockReturnValue({
    profile: { name: 'Satoshi' },
    isLoading: false,
  } as ReturnType<typeof Hooks.useUserProfile>);
});

describe('ProfileTagged', () => {
  beforeEach(() => {
    mockUseTagged.mockReturnValue(mockTaggedOneTag);
  });

  it('renders TaggedSection when tags exist', () => {
    render(<ProfileTagged />);
    expect(screen.getByTestId('tagged-section')).toBeInTheDocument();
  });

  it('renders tag count heading', () => {
    render(<ProfileTagged />);
    expect(screen.getByText('Tagged (1)')).toBeInTheDocument();
  });
});

describe('ProfileTagged - Loading State', () => {
  beforeEach(() => {
    mockUseTagged.mockReturnValue(mockTaggedLoading);
  });

  it('renders skeleton loading state when isLoading is true', () => {
    render(<ProfileTagged />);
    expect(screen.getAllByRole('generic').some((el) => el.getAttribute('data-slot') === 'skeleton')).toBe(true);
    expect(screen.queryByTestId('tagged-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tagged-empty')).not.toBeInTheDocument();
  });
});

describe('ProfileTagged - Empty State', () => {
  beforeEach(() => {
    mockUseTagged.mockReturnValue(mockTaggedEmpty);
  });

  it('renders empty state when no tags', () => {
    render(<ProfileTagged />);
    expect(screen.getByTestId('tagged-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('tagged-section')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('generic').every((el) => el.getAttribute('data-slot') !== 'skeleton')).toBe(true);
  });
});

describe('ProfileTagged - Snapshots', () => {
  it('matches snapshot', () => {
    mockUseTagged.mockReturnValue(mockTaggedOneTag);
    const { container } = render(<ProfileTagged />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for loading state', () => {
    mockUseTagged.mockReturnValue(mockTaggedLoading);
    const { container } = render(<ProfileTagged />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for empty state', () => {
    mockUseTagged.mockReturnValue(mockTaggedEmpty);
    const { container } = render(<ProfileTagged />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
