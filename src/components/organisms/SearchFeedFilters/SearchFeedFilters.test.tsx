import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REACH } from '@/stores/home/home.types';
import { useSearchStore } from '@/stores/search/search.store';
import { SearchFeedFilters } from './SearchFeedFilters';

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  isPhoneViewport: false,
  homeState: {
    layout: 'columns',
    setLayout: vi.fn(),
    reach: 'all',
    setReach: vi.fn(),
    taggedAsActive: false,
    setTaggedAsActive: vi.fn(),
    sort: 'timeline',
    setSort: vi.fn(),
    content: 'all',
    setContent: vi.fn(),
    profileTags: [],
    addProfileTag: vi.fn(),
    removeProfileTag: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('@/stores/home/home.store', () => ({
  useHomeStore: () => mocks.homeState,
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) =>
    selector({ currentUserPubky: 'viewer-pubky' }),
}));

vi.mock('@/hooks/useFeedLayoutResolution/useFeedLayoutResolution', () => ({
  useFeedLayoutResolution: () => ({
    requestedLayout: 'columns',
    effectiveLayout: 'columns',
    isVisualRequested: false,
    isVisualActive: false,
    isPhoneViewport: mocks.isPhoneViewport,
  }),
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({
    requireAuth: (action: () => unknown) => action(),
    isAuthenticated: true,
    waitForAuth: async () => true,
  }),
}));

beforeEach(() => useSearchStore.getState().reset());

describe('SearchFeedFilters', () => {
  beforeEach(() => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    mocks.searchParams = new URLSearchParams({ tags: 'bitcoin' });
    mocks.isPhoneViewport = false;
  });

  afterEach(() => {
    vi.mocked(window.scrollTo).mockRestore();
  });

  it.each(['sidebar', 'drawer', 'mobile'] as const)(
    'shows the Search choices in the %s and changes only Search',
    (variant) => {
      render(<SearchFeedFilters variant={variant} />);
      const reach = screen.getByTestId('filter-reach-radiogroup');
      expect(
        within(reach)
          .getAllByRole('radio')
          .map((radio) => radio.getAttribute('aria-label')),
      ).toEqual(['All', 'My network', 'Following', 'Friends']);
      fireEvent.click(within(reach).getByRole('radio', { name: 'Following' }));
      expect(useSearchStore.getState().reach).toBe(REACH.FOLLOWING);
      expect(mocks.homeState.setReach).not.toHaveBeenCalled();
      expect(within(reach).getByRole('radio', { name: 'Following' })).toHaveAttribute('aria-checked', 'true');
    },
  );

  it('keeps Sort for tag search', () => {
    render(<SearchFeedFilters variant="sidebar" />);

    expect(screen.getByText('Sort')).toBeInTheDocument();
    expect(screen.getByText('Recent')).toBeInTheDocument();
    expect(screen.getByText('Popularity')).toBeInTheDocument();
  });

  it('hides only Sort for full-text search', () => {
    mocks.searchParams = new URLSearchParams({ q: 'bitcoin' });
    render(<SearchFeedFilters variant="sidebar" />);

    expect(screen.queryByText('Sort')).not.toBeInTheDocument();
    expect(screen.getByText('Layout')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('hides Sort but retains drawer controls for full-text search', () => {
    mocks.searchParams = new URLSearchParams({ q: 'bitcoin' });
    render(<SearchFeedFilters variant="drawer" />);

    expect(screen.queryByText('Sort')).not.toBeInTheDocument();
    expect(screen.getByText('Layout')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('keeps the existing Content-only mobile filter surface for full-text search', () => {
    mocks.searchParams = new URLSearchParams({ q: 'bitcoin' });
    mocks.isPhoneViewport = true;
    render(<SearchFeedFilters variant="mobile" />);

    expect(screen.queryByText('Sort')).not.toBeInTheDocument();
    expect(screen.queryByText('Layout')).not.toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });
});
