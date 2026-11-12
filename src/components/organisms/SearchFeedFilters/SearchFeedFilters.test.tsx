import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REACH } from '@/stores/home/home.types';
import { useSearchStore } from '@/stores/search/search.store';
import { SearchFeedFilters } from './SearchFeedFilters';

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  isPhoneViewport: false,
  viewer: 'viewer-pubky' as string | null,
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
  useHomeStore: (selector?: (state: typeof mocks.homeState) => unknown) =>
    selector ? selector(mocks.homeState) : mocks.homeState,
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky: mocks.viewer }),
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

// Whether the configured Pinakes serves My network (`wot_2`)
const reachSet = vi.hoisted(() => ({ served: false }));
vi.mock('@/config/pinakes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/pinakes')>()),
  isPinakesReachSetServed: () => reachSet.served,
}));

vi.mock('@/organisms/SearchResources/SearchResourceFilters', () => ({
  SearchResourceFilters: () => <div data-testid="search-resource-filters" />,
}));

beforeEach(() => useSearchStore.getState().reset());

describe('SearchFeedFilters', () => {
  beforeEach(() => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    mocks.searchParams = new URLSearchParams({ tags: 'bitcoin' });
    mocks.isPhoneViewport = false;
    mocks.homeState.content = 'all';
    mocks.viewer = 'viewer-pubky';
    reachSet.served = false;
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

  it('applies the Search reach to External resources, and leaves the sort to the tab', () => {
    mocks.homeState.content = 'resources';
    render(<SearchFeedFilters variant="sidebar" />);

    const reach = screen.getByRole('radiogroup', { name: 'Reach' });
    // My network is not listed (Pinakes has none), with no note about it
    expect(
      within(reach)
        .getAllByRole('radio')
        .map((radio) => radio.getAttribute('aria-label')),
    ).toEqual(['All', 'Following', 'Friends']);
    expect(screen.queryByText(/My network reach/)).not.toBeInTheDocument();
    fireEvent.click(within(reach).getByRole('radio', { name: 'Following' }));
    expect(useSearchStore.getState().reach).toBe(REACH.FOLLOWING);
    expect(screen.queryByTestId('filter-sort-radiogroup')).not.toBeInTheDocument();
  });

  it('lists My network for External resources where Pinakes serves it', () => {
    reachSet.served = true;
    mocks.homeState.content = 'resources';
    render(<SearchFeedFilters variant="sidebar" />);

    const reach = screen.getByRole('radiogroup', { name: 'Reach' });
    expect(
      within(reach)
        .getAllByRole('radio')
        .map((radio) => radio.getAttribute('aria-label')),
    ).toEqual(['All', 'My network', 'Following', 'Friends']);
    fireEvent.click(within(reach).getByRole('radio', { name: 'My network' }));
    expect(useSearchStore.getState().reach).toBe(REACH.NETWORK);
  });

  it.each(['sidebar', 'drawer', 'mobile'] as const)(
    'adds the External resources filters under the reach in the %s, for a search only',
    (variant) => {
      mocks.homeState.content = 'resources';
      const { unmount } = render(<SearchFeedFilters variant={variant} />);
      const reach = screen.getByTestId('filter-reach-radiogroup');
      const filters = screen.getByTestId('search-resource-filters');
      expect(reach.compareDocumentPosition(filters) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      unmount();

      mocks.searchParams = new URLSearchParams();
      render(<SearchFeedFilters variant={variant} />);
      expect(screen.queryByTestId('search-resource-filters')).not.toBeInTheDocument();
    },
  );

  it('adds the External resources filters for filters alone (no text or tags)', () => {
    mocks.homeState.content = 'resources';
    mocks.searchParams = new URLSearchParams('by=hkdrfoddu3rmeucj1mazu4aeg11nxj7uaxybnmots5o9s5hd3t6y');
    render(<SearchFeedFilters variant="sidebar" />);
    expect(screen.getByTestId('search-resource-filters')).toBeInTheDocument();
  });

  it('treats filters alone as External resources whatever the Content (Visual shows All): its filters, no My network, no post sort', () => {
    mocks.homeState.content = 'all';
    mocks.searchParams = new URLSearchParams('by=hkdrfoddu3rmeucj1mazu4aeg11nxj7uaxybnmots5o9s5hd3t6y');
    render(<SearchFeedFilters variant="sidebar" />);

    expect(screen.getByTestId('search-resource-filters')).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'My network' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('filter-sort-radiogroup')).not.toBeInTheDocument();
  });

  it('shows no External resources filters for posts', () => {
    render(<SearchFeedFilters variant="sidebar" />);
    expect(screen.queryByTestId('search-resource-filters')).not.toBeInTheDocument();
  });

  it('shows All for a stored My network on External resources, keeping it for posts', () => {
    mocks.homeState.content = 'resources';
    useSearchStore.getState().setReach(REACH.NETWORK);
    render(<SearchFeedFilters variant="sidebar" />);

    const reach = screen.getByRole('radiogroup', { name: 'Reach' });
    expect(within(reach).getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'true');
    expect(useSearchStore.getState().reach).toBe(REACH.NETWORK);
  });

  it('signed out, shows All for External resources like posts, with no note', () => {
    mocks.homeState.content = 'resources';
    mocks.viewer = null;
    render(<SearchFeedFilters variant="sidebar" />);

    const reach = screen.getByRole('radiogroup', { name: 'Reach' });
    expect(within(reach).getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'true');
    for (const name of ['Following', 'Friends']) {
      expect(within(reach).getByRole('radio', { name })).not.toHaveAttribute('aria-disabled');
    }
    expect(within(reach).queryByRole('radio', { name: 'My network' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Sign in to see/)).not.toBeInTheDocument();
  });

  it('treats a link search like External resources: no My network, no post sort', () => {
    mocks.searchParams = new URLSearchParams({ q: 'https://open.spotify.com/track/69kOkLUCkxIZYexIgSG8rq' });
    render(<SearchFeedFilters variant="sidebar" />);

    expect(screen.queryByRole('radio', { name: 'My network' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('filter-sort-radiogroup')).not.toBeInTheDocument();
  });

  it('keeps Sort for tag search', () => {
    render(<SearchFeedFilters variant="sidebar" />);

    expect(screen.getByText('Sort')).toBeInTheDocument();
    expect(screen.getByText('Recent')).toBeInTheDocument();
    expect(screen.getByText('Popularity')).toBeInTheDocument();
  });

  it.each(['sidebar', 'drawer', 'mobile'] as const)('disables only Locks for full-text search in the %s', (variant) => {
    mocks.searchParams = new URLSearchParams({ q: 'bitcoin' });
    render(<SearchFeedFilters variant={variant} />);
    const content = screen.getByTestId('filter-content-radiogroup');

    expect(within(content).getByRole('radio', { name: 'Locks' })).toHaveAttribute('aria-disabled', 'true');
    expect(within(content).getByRole('radio', { name: 'Posts' })).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('shows All for full-text search without clearing a stored Locks choice', () => {
    mocks.searchParams = new URLSearchParams({ q: 'bitcoin' });
    mocks.homeState.content = 'locks';
    render(<SearchFeedFilters variant="sidebar" />);
    const content = screen.getByTestId('filter-content-radiogroup');

    expect(within(content).getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'true');
    expect(within(content).getByRole('radio', { name: 'Locks' })).toHaveAttribute('aria-checked', 'false');
    expect(mocks.homeState.setContent).not.toHaveBeenCalled();
  });

  it('keeps Locks enabled and selected for tag search', () => {
    mocks.homeState.content = 'locks';
    render(<SearchFeedFilters variant="sidebar" />);
    const locks = within(screen.getByTestId('filter-content-radiogroup')).getByRole('radio', { name: 'Locks' });

    expect(locks).not.toHaveAttribute('aria-disabled', 'true');
    expect(locks).toHaveAttribute('aria-checked', 'true');
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
