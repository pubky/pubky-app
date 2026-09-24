import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TAGGED_AS_FILTER_KEY, TIMELINE_FEED_VARIANT } from '@/config/feed';
import { CONTENT, homeInitialState, LAYOUT, REACH, SORT } from '@/stores/home/home.types';
import { HomeFeedDrawer, HomeFeedDrawerMobile, HomeFeedSidebar } from './HomeFeedSidebar';

const {
  mockSetContent,
  mockSetReach,
  mockSetTaggedAsActive,
  mockUseHomeStore,
  mockFilterContent,
  mockFilterReach,
  mockFilterSort,
  mockFilterLayout,
  mockUseFeedLayoutResolution,
  mockCurrentUserPubky,
} = vi.hoisted(() => ({
  mockSetContent: vi.fn(),
  mockSetReach: vi.fn(),
  mockSetTaggedAsActive: vi.fn(),
  mockUseHomeStore: vi.fn(),
  mockFilterContent: vi.fn(
    ({
      disabledTabs,
      selectedTab,
    }: {
      disabledTabs?: string[];
      selectedTab?: string;
      onTabChange?: (value: string) => void;
    }) => (
      <div
        data-testid="filter-content"
        data-disabled-tabs={(disabledTabs ?? []).length ? disabledTabs?.join(',') : undefined}
        data-selected-tab={selectedTab}
      >
        FilterContent
      </div>
    ),
  ),
  mockFilterReach: vi.fn(
    ({
      selectedTab,
      showTaggedAs,
      profileTags,
      profileTagsDisabled,
    }: {
      selectedTab?: string;
      showTaggedAs?: boolean;
      profileTags?: string[];
      profileTagsDisabled?: boolean;
      onTabChange?: (value: string) => void;
      onProfileTagAdd?: (tag: string) => void;
      onProfileTagRemove?: (tag: string) => void;
    }) => (
      <div
        data-testid="filter-reach"
        data-selected-tab={selectedTab}
        data-show-tagged-as={showTaggedAs ? 'true' : undefined}
        data-profile-tags={(profileTags ?? []).join(',')}
        data-profile-tags-disabled={profileTagsDisabled ? 'true' : undefined}
      >
        FilterReach
      </div>
    ),
  ),
  mockFilterSort: vi.fn((_props: { onTabChange?: (value: string) => void }) => (
    <div data-testid="filter-sort">FilterSort</div>
  )),
  mockFilterLayout: vi.fn(({ showVisual }: { showVisual?: boolean; onTabChange?: (value: string) => void }) => (
    <div data-testid="filter-layout" data-show-visual={showVisual ? 'true' : undefined}>
      FilterLayout
    </div>
  )),
  mockUseFeedLayoutResolution: vi.fn(() => ({
    requestedLayout: 'columns',
    effectiveLayout: 'columns',
    isVisualRequested: false,
    isVisualActive: false,
    isPhoneViewport: false,
  })),
  mockCurrentUserPubky: { value: 'viewer-pubky' as string | null },
}));

// Mock useHomeStore; getState() reads the same state so handlers see it too
vi.mock('@/stores/home/home.store', () => ({
  useHomeStore: Object.assign(
    (selector?: (state: unknown) => unknown) => (selector ? selector(mockUseHomeStore()) : mockUseHomeStore()),
    { getState: () => mockUseHomeStore() },
  ),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky: mockCurrentUserPubky.value }),
}));

vi.mock('@/hooks/useFeedLayoutResolution/useFeedLayoutResolution', () => ({
  useFeedLayoutResolution: () => mockUseFeedLayoutResolution(),
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  // Mirror the real hook: authentication is derived from the auth store, so
  // signed-out tests (mockCurrentUserPubky.value = null) flow through here.
  useRequireAuth: () => ({
    requireAuth: (action: () => unknown) => (mockCurrentUserPubky.value ? action() : undefined),
    isAuthenticated: Boolean(mockCurrentUserPubky.value),
  }),
}));

// Mock Atoms
vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="container" className={className}>
        {children}
      </div>
    ),
  };
});

// Mock Molecules
vi.mock('@/molecules/Filters/FilterContent/FilterContent', () => {
  return {
    FilterContent: (props: { disabledTabs?: string[]; selectedTab?: string; onTabChange?: (value: string) => void }) =>
      mockFilterContent(props),
  };
});

vi.mock('@/molecules/Filters/FilterLayout/FilterLayout', () => {
  return {
    FilterLayout: (props: { showVisual?: boolean; onTabChange?: (value: string) => void }) => mockFilterLayout(props),
  };
});

vi.mock('@/molecules/Filters/FilterReach/FilterReach', () => {
  return {
    TAGGED_AS_FILTER_KEY: 'tagged_as',
    FilterReach: (props: {
      selectedTab?: string;
      showTaggedAs?: boolean;
      profileTags?: string[];
      profileTagsDisabled?: boolean;
      onTabChange?: (value: string) => void;
      onProfileTagAdd?: (tag: string) => void;
      onProfileTagRemove?: (tag: string) => void;
    }) => mockFilterReach(props),
  };
});

vi.mock('@/molecules/Filters/FilterSort/FilterSort', () => {
  return {
    FilterSort: (props: { onTabChange?: (value: string) => void }) => mockFilterSort(props),
  };
});

beforeEach(() => {
  mockSetContent.mockClear();
  mockSetReach.mockClear();
  mockSetTaggedAsActive.mockClear();
  mockCurrentUserPubky.value = 'viewer-pubky';
  mockUseHomeStore.mockReturnValue({
    layout: 'columns',
    setLayout: vi.fn(),
    reach: 'following',
    setReach: mockSetReach,
    taggedAsActive: false,
    setTaggedAsActive: mockSetTaggedAsActive,
    sort: 'timeline',
    setSort: vi.fn(),
    content: 'all',
    setContent: mockSetContent,
    profileTags: [],
    addProfileTag: vi.fn(),
    removeProfileTag: vi.fn(),
  });
  mockFilterContent.mockClear();
  mockFilterReach.mockClear();
  mockFilterSort.mockClear();
  mockFilterLayout.mockClear();
  mockUseFeedLayoutResolution.mockReturnValue({
    requestedLayout: 'columns',
    effectiveLayout: 'columns',
    isVisualRequested: false,
    isVisualActive: false,
    isPhoneViewport: false,
  });
});

describe('HomeFeedSidebar', () => {
  it('renders all filter components', () => {
    render(<HomeFeedSidebar />);

    expect(screen.getByTestId('filter-reach')).toBeInTheDocument();
    expect(screen.getByTestId('filter-sort')).toBeInTheDocument();
    expect(screen.getByTestId('filter-content')).toBeInTheDocument();
    expect(screen.getByTestId('filter-layout')).toBeInTheDocument();
  });

  it('can hide sort without hiding layout or content', () => {
    render(<HomeFeedSidebar hideSortFilter />);

    expect(screen.queryByTestId('filter-sort')).not.toBeInTheDocument();
    expect(screen.getByTestId('filter-layout')).toBeInTheDocument();
    expect(screen.getByTestId('filter-content')).toBeInTheDocument();
  });

  it('shows visual layout when enabled on desktop/tablet', () => {
    render(<HomeFeedSidebar allowVisualLayout feedVariant={TIMELINE_FEED_VARIANT.HOME} />);

    expect(screen.getByTestId('filter-layout')).toHaveAttribute('data-show-visual', 'true');
  });

  it('disables unsupported content options while visual is active', () => {
    mockUseFeedLayoutResolution.mockReturnValue({
      requestedLayout: 'visual',
      effectiveLayout: 'visual',
      isVisualRequested: true,
      isVisualActive: true,
      isPhoneViewport: false,
    });

    render(<HomeFeedSidebar allowVisualLayout feedVariant={TIMELINE_FEED_VARIANT.HOME} />);

    expect(screen.getByTestId('filter-content')).toHaveAttribute(
      'data-disabled-tabs',
      'short,long,collections,links,files',
    );
  });

  it('shows the resolved visual content without mutating the store from the sidebar', () => {
    mockUseHomeStore.mockReturnValue({
      layout: 'visual',
      setLayout: vi.fn(),
      reach: 'following',
      setReach: mockSetReach,
      taggedAsActive: false,
      setTaggedAsActive: mockSetTaggedAsActive,
      sort: 'timeline',
      setSort: vi.fn(),
      content: 'short',
      setContent: mockSetContent,
    });
    mockUseFeedLayoutResolution.mockReturnValue({
      requestedLayout: 'visual',
      effectiveLayout: 'visual',
      isVisualRequested: true,
      isVisualActive: true,
      isPhoneViewport: false,
    });

    render(<HomeFeedSidebar allowVisualLayout feedVariant={TIMELINE_FEED_VARIANT.HOME} />);

    expect(screen.getByTestId('filter-content')).toHaveAttribute('data-selected-tab', 'all');
    expect(mockSetContent).not.toHaveBeenCalled();
  });

  it('forces all reach when logged out', () => {
    mockCurrentUserPubky.value = null;

    render(<HomeFeedSidebar />);

    expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-selected-tab', 'all');
  });

  it('does not persist a signed-out All selection', () => {
    mockCurrentUserPubky.value = null;

    render(<HomeFeedSidebar />);
    act(() => {
      mockFilterReach.mock.calls.at(-1)?.[0].onTabChange?.('all');
    });

    expect(mockSetReach).not.toHaveBeenCalled();
  });

  it('opts Home into the standalone Tagged-as reach controls', () => {
    mockUseHomeStore.mockReturnValue({
      layout: 'columns',
      setLayout: vi.fn(),
      reach: 'network',
      setReach: mockSetReach,
      taggedAsActive: false,
      setTaggedAsActive: mockSetTaggedAsActive,
      sort: 'timeline',
      setSort: vi.fn(),
      content: 'all',
      setContent: mockSetContent,
      profileTags: ['bitcoin', 'dev'],
      addProfileTag: vi.fn(),
      removeProfileTag: vi.fn(),
    });

    render(<HomeFeedSidebar />);

    expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-show-tagged-as', 'true');
    expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-profile-tags', 'bitcoin,dev');
    expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-profile-tags-disabled', 'true');
  });

  it('parks and disables profile tags while a base reach is selected', () => {
    mockUseHomeStore.mockReturnValue({
      layout: 'columns',
      setLayout: vi.fn(),
      reach: 'all',
      setReach: mockSetReach,
      taggedAsActive: false,
      setTaggedAsActive: mockSetTaggedAsActive,
      sort: 'timeline',
      setSort: vi.fn(),
      content: 'all',
      setContent: mockSetContent,
      profileTags: ['bitcoin'],
      addProfileTag: vi.fn(),
      removeProfileTag: vi.fn(),
    });

    render(<HomeFeedSidebar />);

    expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-profile-tags', 'bitcoin');
    expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-profile-tags-disabled', 'true');
  });

  it('selects Tagged as and enables its editor while retaining the base reach', () => {
    mockUseHomeStore.mockReturnValue({
      layout: 'columns',
      setLayout: vi.fn(),
      reach: 'me',
      setReach: mockSetReach,
      taggedAsActive: true,
      setTaggedAsActive: mockSetTaggedAsActive,
      sort: 'timeline',
      setSort: vi.fn(),
      content: 'all',
      setContent: mockSetContent,
      profileTags: ['bitcoin'],
      addProfileTag: vi.fn(),
      removeProfileTag: vi.fn(),
    });

    render(<HomeFeedSidebar />);

    expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-selected-tab', 'tagged_as');
    expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-profile-tags', 'bitcoin');
    expect(screen.getByTestId('filter-reach')).not.toHaveAttribute('data-profile-tags-disabled');
  });

  it('highlights the base reach while an empty Tagged-as editor is open', () => {
    mockUseHomeStore.mockReturnValue({
      layout: 'columns',
      setLayout: vi.fn(),
      reach: 'me',
      setReach: mockSetReach,
      taggedAsActive: true,
      setTaggedAsActive: mockSetTaggedAsActive,
      sort: 'timeline',
      setSort: vi.fn(),
      content: 'all',
      setContent: mockSetContent,
      profileTags: [],
      addProfileTag: vi.fn(),
      removeProfileTag: vi.fn(),
    });

    render(<HomeFeedSidebar />);

    expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-selected-tab', 'me');
    expect(screen.getByTestId('filter-reach')).not.toHaveAttribute('data-profile-tags-disabled');
  });

  it('activates Tagged as without changing the parked base reach', () => {
    render(<HomeFeedSidebar />);

    act(() => {
      mockFilterReach.mock.calls.at(-1)?.[0].onTabChange?.('tagged_as');
    });

    expect(mockSetTaggedAsActive).toHaveBeenCalledWith(true);
    expect(mockSetReach).not.toHaveBeenCalled();
  });
});

describe('HomeFeedSidebar - scroll to top on stream change', () => {
  // The real store, so every filter action applies its actual semantics
  // (Reach clears Tagged as, a duplicate profile tag is a no-op, ...).
  let realHomeStore: typeof import('@/stores/home/home.store').useHomeStore;
  let scrollTo: ReturnType<typeof vi.spyOn>;

  const lastProps = <T,>(mock: { mock: { calls: T[][] } }) => mock.mock.calls.at(-1)?.[0];

  beforeEach(async () => {
    ({ useHomeStore: realHomeStore } =
      await vi.importActual<typeof import('@/stores/home/home.store')>('@/stores/home/home.store'));
    realHomeStore.setState({ ...homeInitialState, reach: REACH.FOLLOWING });
    mockUseHomeStore.mockImplementation(() => realHomeStore.getState());
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  afterEach(() => {
    scrollTo.mockRestore();
  });

  it('smoothly scrolls to the top when Sort selects a different stream', () => {
    render(<HomeFeedSidebar />);

    act(() => lastProps(mockFilterSort)?.onTabChange?.(SORT.ENGAGEMENT));

    expect(realHomeStore.getState().sort).toBe(SORT.ENGAGEMENT);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('scrolls to the top when Content selects a different stream', () => {
    render(<HomeFeedSidebar />);

    act(() => lastProps(mockFilterContent)?.onTabChange?.(CONTENT.IMAGES));

    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('scrolls to the top when Reach selects a different stream', () => {
    render(<HomeFeedSidebar />);

    act(() => lastProps(mockFilterReach)?.onTabChange?.(REACH.FRIENDS));

    expect(realHomeStore.getState().reach).toBe(REACH.FRIENDS);
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('does not scroll when the selected filter already matches the stream', () => {
    render(<HomeFeedSidebar />);

    act(() => lastProps(mockFilterSort)?.onTabChange?.(SORT.TIMELINE));
    act(() => lastProps(mockFilterReach)?.onTabChange?.(REACH.FOLLOWING));

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('does not scroll when a signed-out Reach click only opens the sign-in prompt', () => {
    mockCurrentUserPubky.value = null;
    realHomeStore.setState({ reach: REACH.ALL });
    render(<HomeFeedSidebar />);

    act(() => lastProps(mockFilterReach)?.onTabChange?.(REACH.FOLLOWING));

    expect(realHomeStore.getState().reach).toBe(REACH.ALL);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('scrolls to the top when Tagged as switches to its profile-tag stream', () => {
    realHomeStore.setState({ profileTags: ['bitcoin'] });
    render(<HomeFeedSidebar />);

    act(() => lastProps(mockFilterReach)?.onTabChange?.(TAGGED_AS_FILTER_KEY));

    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('does not scroll when Tagged as opens an empty editor that keeps the stream', () => {
    render(<HomeFeedSidebar />);

    act(() => lastProps(mockFilterReach)?.onTabChange?.(TAGGED_AS_FILTER_KEY));

    expect(realHomeStore.getState().taggedAsActive).toBe(true);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('scrolls to the top when adding or removing a Tagged-as profile tag changes the stream', () => {
    realHomeStore.setState({ taggedAsActive: true, profileTags: ['bitcoin'] });
    render(<HomeFeedSidebar />);

    act(() => lastProps(mockFilterReach)?.onProfileTagAdd?.('dev'));
    act(() => lastProps(mockFilterReach)?.onProfileTagRemove?.('bitcoin'));

    expect(realHomeStore.getState().profileTags).toEqual(['dev']);
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });

  it('does not scroll when a duplicate profile tag leaves the stream unchanged', () => {
    realHomeStore.setState({ taggedAsActive: true, profileTags: ['bitcoin'] });
    render(<HomeFeedSidebar />);

    act(() => lastProps(mockFilterReach)?.onProfileTagAdd?.('bitcoin'));

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('does not scroll when the layout changes', () => {
    render(<HomeFeedSidebar />);

    act(() => lastProps(mockFilterLayout)?.onTabChange?.(LAYOUT.LIST));

    expect(realHomeStore.getState().layout).toBe(LAYOUT.LIST);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('scrolls to the top from the tablet drawer', () => {
    render(<HomeFeedDrawer />);

    act(() => lastProps(mockFilterSort)?.onTabChange?.(SORT.ENGAGEMENT));

    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('scrolls to the top from the mobile drawer on Search', () => {
    render(<HomeFeedDrawerMobile hideReachFilter feedVariant={TIMELINE_FEED_VARIANT.SEARCH} />);

    act(() => lastProps(mockFilterContent)?.onTabChange?.(CONTENT.VIDEOS));

    expect(scrollTo).toHaveBeenCalledTimes(1);
  });
});

describe('HomeFeedDrawer', () => {
  it('renders all filter components', () => {
    render(<HomeFeedDrawer />);

    expect(screen.getByTestId('filter-reach')).toBeInTheDocument();
    expect(screen.getByTestId('filter-sort')).toBeInTheDocument();
    expect(screen.getByTestId('filter-content')).toBeInTheDocument();
    expect(screen.getByTestId('filter-layout')).toBeInTheDocument();
  });
});

describe('HomeFeedDrawerMobile', () => {
  it('renders filter components without layout filter', () => {
    render(<HomeFeedDrawerMobile />);

    expect(screen.getByTestId('filter-reach')).toBeInTheDocument();
    expect(screen.getByTestId('filter-sort')).toBeInTheDocument();
    expect(screen.getByTestId('filter-content')).toBeInTheDocument();
    // Mobile doesn't show layout filter
    expect(screen.queryByTestId('filter-layout')).not.toBeInTheDocument();
  });
});

describe('HomeFeedSidebar - Snapshots', () => {
  beforeEach(() => {
    mockUseFeedLayoutResolution.mockReturnValue({
      requestedLayout: 'columns',
      effectiveLayout: 'columns',
      isVisualRequested: false,
      isVisualActive: false,
      isPhoneViewport: false,
    });
  });

  it('matches snapshot', () => {
    const { container } = render(<HomeFeedSidebar allowVisualLayout={true} feedVariant={TIMELINE_FEED_VARIANT.HOME} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with Sort hidden', () => {
    const { container } = render(
      <HomeFeedSidebar
        allowVisualLayout={true}
        feedVariant={TIMELINE_FEED_VARIANT.SEARCH}
        hideReachFilter
        hideSortFilter
      />,
    );
    expect(container).toMatchSnapshot();
  });
});

describe('HomeFeedDrawer - Snapshots', () => {
  beforeEach(() => {
    mockUseFeedLayoutResolution.mockReturnValue({
      requestedLayout: 'columns',
      effectiveLayout: 'columns',
      isVisualRequested: false,
      isVisualActive: false,
      isPhoneViewport: false,
    });
  });

  it('matches snapshot', () => {
    const { container } = render(<HomeFeedDrawer allowVisualLayout={true} feedVariant={TIMELINE_FEED_VARIANT.HOME} />);
    expect(container).toMatchSnapshot();
  });
});

describe('HomeFeedDrawerMobile - Snapshots', () => {
  beforeEach(() => {
    mockUseFeedLayoutResolution.mockReturnValue({
      requestedLayout: 'columns',
      effectiveLayout: 'columns',
      isVisualRequested: false,
      isVisualActive: false,
      isPhoneViewport: false,
    });
  });

  it('matches snapshot', () => {
    const { container } = render(<HomeFeedDrawerMobile />);
    expect(container).toMatchSnapshot();
  });
});
