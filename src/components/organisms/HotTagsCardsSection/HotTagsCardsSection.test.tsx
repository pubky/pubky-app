import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HotTagsCardsSection } from './HotTagsCardsSection';

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

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: vi.fn(() => false),
}));

vi.mock('@/hooks/useBulkUserAvatars/useBulkUserAvatars', () => ({
  useBulkUserAvatars: vi.fn(() => ({
    getUsersWithAvatars: vi.fn(() => []),
  })),
}));

vi.mock('@/config', () => ({
  HOT_TAGS_FEATURED_COUNT: 3,
}));

vi.mock('@/atoms', () => ({
  Container: ({
    children,
    overrideDefaults: _overrideDefaults,
    ...props
  }: {
    children: React.ReactNode;
    overrideDefaults?: boolean;
    [key: string]: unknown;
  }) => <div {...props}>{children}</div>,
  Heading: ({ children }: { children: React.ReactNode }) => <h5>{children}</h5>,
  Typography: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <p className={className}>{children}</p>
  ),
  Skeleton: ({ className, ...props }: { className?: string; [key: string]: unknown }) => (
    <div className={className} data-slot="skeleton" {...props} />
  ),
}));

vi.mock('@/molecules', () => ({
  HotTagCard: ({ tagName }: { tagName: string }) => <div data-testid={`hot-tag-card-${tagName}`}>{tagName}</div>,
}));

describe('HotTagsCardsSection', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockUseHotTags.mockClear();
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
    expect(screen.getByTestId('hot-tag-card-bitcoin')).toBeInTheDocument();
    expect(screen.getByTestId('hot-tag-card-keys')).toBeInTheDocument();
    expect(screen.getByTestId('hot-tag-card-pubky')).toBeInTheDocument();
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
});
