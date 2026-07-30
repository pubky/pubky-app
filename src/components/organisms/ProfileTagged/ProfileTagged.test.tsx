import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { useEnrichedTags } from '@/hooks/useEnrichedTags/useEnrichedTags';
import { useTagged } from '@/hooks/useTagged/useTagged';
import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import { ProfileTagged } from './ProfileTagged';

// Mock providers
vi.mock('@/providers/ProfileProvider/ProfileProvider', () => ({
  useProfileContext: () => ({
    pubky: 'test-user-pubky',
    isOwnProfile: true,
    isLoading: false,
  }),
}));

// Mock hooks
vi.mock('@/hooks/useCurrentUserProfile/useCurrentUserProfile', () => ({
  useCurrentUserProfile: vi.fn(),
}));

vi.mock('@/hooks/useUserProfile/useUserProfile', () => ({
  useUserProfile: vi.fn(),
}));

vi.mock('@/hooks/useTagged/useTagged', () => ({
  useTagged: vi.fn(),
}));

vi.mock('@/hooks/useEnrichedTags/useEnrichedTags', () => ({
  useEnrichedTags: vi.fn((tags: unknown[]) => ({ enrichedTags: tags, isLoading: false })),
}));

// Mock molecules
vi.mock('@/molecules/TaggedEmpty/TaggedEmpty', () => {
  return {
    TaggedEmpty: () => <div data-testid="tagged-empty">TaggedEmpty</div>,
  };
});

vi.mock('@/molecules/TaggedSection/TaggedSection', () => {
  return {
    TaggedSection: ({ tags }: { tags: Array<{ taggers: Array<{ name?: string }> }> }) => (
      <div data-testid="tagged-section" data-tagger-name={tags[0]?.taggers[0]?.name ?? ''}>
        TaggedSection
      </div>
    ),
  };
});

const mockUseCurrentUserProfile = vi.mocked(useCurrentUserProfile);
const mockUseUserProfile = vi.mocked(useUserProfile);
const mockUseTagged = vi.mocked(useTagged);
const mockUseEnrichedTags = vi.mocked(useEnrichedTags);

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
  } as ReturnType<typeof useCurrentUserProfile>);
  mockUseUserProfile.mockReturnValue({
    profile: { name: 'Satoshi' },
    isLoading: false,
  } as ReturnType<typeof useUserProfile>);
  mockUseEnrichedTags.mockImplementation((tags: unknown[]) => ({
    enrichedTags: tags as ReturnType<typeof useEnrichedTags>['enrichedTags'],
    isLoading: false,
  }));
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

  it('passes enriched tags to TaggedSection for hashface username initials', () => {
    const enrichedTags = [
      {
        label: 'bitcoin',
        taggers: [{ id: 'user1', name: 'Not Vlada', avatarUrl: 'https://cdn.example.com/avatar/user1' }],
        taggers_count: 1,
        relationship: false,
      },
    ];
    mockUseEnrichedTags.mockReturnValue({ enrichedTags, isLoading: false });

    render(<ProfileTagged />);

    expect(mockUseEnrichedTags).toHaveBeenCalledWith(mockTaggedOneTag.tags);
    expect(screen.getByTestId('tagged-section')).toHaveAttribute('data-tagger-name', 'Not Vlada');
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
