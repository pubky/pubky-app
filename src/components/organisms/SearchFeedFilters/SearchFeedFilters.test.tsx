import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchFeedFilters } from './SearchFeedFilters';

const mocks = vi.hoisted(() => ({
  query: null as string | null,
}));

vi.mock('@/hooks/useSearchStreamId/useSearchStreamId', () => ({
  useContentSearchQuery: () => mocks.query,
}));

vi.mock('@/organisms/HomeFeedSidebar/HomeFeedSidebar', () => ({
  HomeFeedSidebar: ({ hideSortFilter }: { hideSortFilter?: boolean }) => (
    <div data-hide-sort={String(Boolean(hideSortFilter))} data-testid="sidebar" />
  ),
  HomeFeedDrawer: ({ hideSortFilter }: { hideSortFilter?: boolean }) => (
    <div data-hide-sort={String(Boolean(hideSortFilter))} data-testid="drawer" />
  ),
  HomeFeedDrawerMobile: ({ hideSortFilter }: { hideSortFilter?: boolean }) => (
    <div data-hide-sort={String(Boolean(hideSortFilter))} data-testid="mobile" />
  ),
}));

describe('SearchFeedFilters', () => {
  beforeEach(() => {
    mocks.query = null;
  });

  it('keeps Sort for tag search and hides it for full-text search across shell variants', () => {
    const { rerender } = render(<SearchFeedFilters variant="sidebar" />);
    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-hide-sort', 'false');

    mocks.query = 'bitcoin';
    rerender(<SearchFeedFilters variant="sidebar" />);
    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-hide-sort', 'true');

    rerender(<SearchFeedFilters variant="drawer" />);
    expect(screen.getByTestId('drawer')).toHaveAttribute('data-hide-sort', 'true');

    rerender(<SearchFeedFilters variant="mobile" />);
    expect(screen.getByTestId('mobile')).toHaveAttribute('data-hide-sort', 'true');
  });
});
