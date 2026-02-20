import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HotTagsCardsSection } from './HotTagsCardsSection';

const mockPush = vi.fn();
const mockUseHotTags = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('@/core', () => ({
  useHotStore: () => ({
    reach: 'all',
    timeframe: 'week',
  }),
}));

vi.mock('@/hooks', () => ({
  useHotTags: (params: unknown) => mockUseHotTags(params),
  useIsMobile: () => false,
  useBulkUserAvatars: () => ({
    getUsersWithAvatars: () => [],
  }),
}));

vi.mock('@/molecules', () => ({
  HotTagCard: ({ rank, tagName, postCount }: { rank: number; tagName: string; postCount: number }) => (
    <div data-testid={`hot-tag-card-${rank}`}>
      {tagName} ({postCount})
    </div>
  ),
}));

describe('HotTagsCardsSection', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockUseHotTags.mockReset();
  });

  it('renders three skeleton cards while loading', () => {
    mockUseHotTags.mockReturnValue({
      rawTags: [],
      isLoading: true,
      error: null,
    });

    render(<HotTagsCardsSection />);

    expect(screen.getByTestId('hot-tags-card-skeleton-0')).toBeInTheDocument();
    expect(screen.getByTestId('hot-tags-card-skeleton-1')).toBeInTheDocument();
    expect(screen.getByTestId('hot-tags-card-skeleton-2')).toBeInTheDocument();
  });

  it('renders featured hot tag cards when loading is complete', () => {
    mockUseHotTags.mockReturnValue({
      rawTags: [
        { label: 'bitcoin', taggers_id: [], tagged_count: 111, taggers_count: 10 },
        { label: 'nostr', taggers_id: [], tagged_count: 95, taggers_count: 8 },
        { label: 'pubky', taggers_id: [], tagged_count: 72, taggers_count: 5 },
      ],
      isLoading: false,
      error: null,
    });

    render(<HotTagsCardsSection />);

    expect(screen.getByTestId('hot-tag-card-1')).toHaveTextContent('bitcoin (111)');
    expect(screen.getByTestId('hot-tag-card-2')).toHaveTextContent('nostr (95)');
    expect(screen.getByTestId('hot-tag-card-3')).toHaveTextContent('pubky (72)');
  });
});

describe('HotTagsCardsSection - Snapshots', () => {
  it('matches snapshot while loading', () => {
    mockUseHotTags.mockReturnValue({
      rawTags: [],
      isLoading: true,
      error: null,
    });

    const { container } = render(<HotTagsCardsSection />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
