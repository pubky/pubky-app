import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
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
  }),
}));

describe('SearchFeedFilters', () => {
  beforeEach(() => {
    mocks.searchParams = new URLSearchParams({ tags: 'bitcoin' });
    mocks.isPhoneViewport = false;
  });

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

describe('SearchFeedFilters - Snapshots', () => {
  beforeEach(() => {
    mocks.isPhoneViewport = false;
  });

  it('matches full-text filters snapshot without Sort', () => {
    mocks.searchParams = new URLSearchParams({ q: 'bitcoin' });
    const { container } = render(<SearchFeedFilters variant="sidebar" />);
    expect(container).toMatchSnapshot();
  });

  it('matches tag-search filters snapshot', () => {
    mocks.searchParams = new URLSearchParams({ tags: 'bitcoin' });
    const { container } = render(<SearchFeedFilters variant="sidebar" />);
    expect(container).toMatchSnapshot();
  });

  it('matches full-text drawer filters snapshot', () => {
    mocks.searchParams = new URLSearchParams({ q: 'bitcoin' });
    const { container } = render(<SearchFeedFilters variant="drawer" />);
    expect(container).toMatchSnapshot();
  });

  it('matches full-text mobile-shell filters snapshot', () => {
    mocks.searchParams = new URLSearchParams({ q: 'bitcoin' });
    const { container } = render(<SearchFeedFilters variant="mobile" />);
    expect(container).toMatchSnapshot();
  });
});

describe('SearchFeedFilters - Mobile Snapshots', () => {
  beforeEach(() => {
    mocks.searchParams = new URLSearchParams({ q: 'bitcoin' });
    mocks.isPhoneViewport = true;
    setMobileViewport();
  });

  afterEach(() => {
    resetViewport();
  });

  it('matches full-text sidebar filters snapshot on a mobile viewport', () => {
    const { container } = render(<SearchFeedFilters variant="sidebar" />);
    expect(container).toMatchSnapshot();
  });
});
