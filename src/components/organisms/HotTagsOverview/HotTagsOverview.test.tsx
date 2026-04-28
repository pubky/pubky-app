import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HotTagsOverview } from './HotTagsOverview';

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

vi.mock('@/hooks/useHotTags/useHotTags', () => ({
  useHotTags: (params: unknown) => mockUseHotTags(params),
}));

describe('HotTagsOverview', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockUseHotTags.mockReset();
  });

  it('renders skeleton tags while loading', () => {
    mockUseHotTags.mockReturnValue({
      rawTags: [],
      isLoading: true,
      error: null,
    });

    render(<HotTagsOverview />);

    expect(screen.getByTestId('hot-tags-overview-skeleton-0')).toBeInTheDocument();
    expect(screen.getByTestId('hot-tags-overview-skeleton-11')).toBeInTheDocument();
  });

  it('skips featured tags and navigates to search when a tag is clicked', () => {
    mockUseHotTags.mockReturnValue({
      rawTags: [
        { label: 'featured-1', taggers_id: [], tagged_count: 111, taggers_count: 10 },
        { label: 'featured-2', taggers_id: [], tagged_count: 95, taggers_count: 8 },
        { label: 'featured-3', taggers_id: [], tagged_count: 72, taggers_count: 5 },
        { label: 'ai', taggers_id: [], tagged_count: 44, taggers_count: 3 },
        { label: 'nostr', taggers_id: [], tagged_count: 31, taggers_count: 2 },
      ],
      isLoading: false,
      error: null,
    });

    render(<HotTagsOverview />);

    expect(screen.getByText('ai')).toBeInTheDocument();
    expect(screen.getByText('nostr')).toBeInTheDocument();
    expect(screen.queryByText('featured-1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('ai'));

    expect(mockPush).toHaveBeenCalledWith('/search?tags=ai');
  });
});

describe('HotTagsOverview - Snapshots', () => {
  it('matches snapshot while loading', () => {
    mockUseHotTags.mockReturnValue({
      rawTags: [],
      isLoading: true,
      error: null,
    });

    const { container } = render(<HotTagsOverview />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
