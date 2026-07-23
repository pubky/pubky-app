import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { HomeFeedDrawer, HomeFeedDrawerMobile, HomeFeedSidebar } from './HomeFeedSidebar';

const {
  mockSetContent,
  mockUseHomeStore,
  mockFilterContent,
  mockFilterProfileTags,
  mockUseFeedLayoutResolution,
  mockCurrentUserPubky,
  mockSetReach,
  mockSetProfileTagScope,
} = vi.hoisted(() => ({
  mockSetContent: vi.fn(),
  mockUseHomeStore: vi.fn(),
  mockFilterContent: vi.fn(({ disabledTabs, selectedTab }: { disabledTabs?: string[]; selectedTab?: string }) => (
    <div
      data-testid="filter-content"
      data-disabled-tabs={(disabledTabs ?? []).length ? disabledTabs?.join(',') : undefined}
      data-selected-tab={selectedTab}
    >
      FilterContent
    </div>
  )),
  mockFilterProfileTags: vi.fn(
    ({ hidden, inputDisabled, scope }: { hidden?: boolean; inputDisabled?: boolean; scope?: string }) => (
      <div
        data-testid="filter-profile-tags"
        data-hidden={hidden ? 'true' : 'false'}
        data-input-disabled={inputDisabled ? 'true' : 'false'}
        data-scope={scope}
      >
        FilterProfileTags
      </div>
    ),
  ),
  mockUseFeedLayoutResolution: vi.fn(() => ({
    requestedLayout: 'columns',
    effectiveLayout: 'columns',
    isVisualRequested: false,
    isVisualActive: false,
    isPhoneViewport: false,
  })),
  mockCurrentUserPubky: { value: 'viewer-pubky' as string | null },
  mockSetReach: vi.fn(),
  mockSetProfileTagScope: vi.fn(),
}));

// Mock useHomeStore
vi.mock('@/stores/home/home.types', () => ({
  HOME_PROFILE_TAGS_MAX_SELECTED: 5,
  REACH: {
    ME: 'me',
    FRIENDS: 'friends',
    FOLLOWING: 'following',
    NETWORK: 'network',
    ALL: 'all',
  },
  CONTENT: {
    ALL: 'all',
    SHORT: 'short',
    LONG: 'long',
    IMAGES: 'images',
    VIDEOS: 'videos',
    LINKS: 'links',
    FILES: 'files',
  },
}));
vi.mock('@/stores/home/home.store', () => ({
  useHomeStore: () => mockUseHomeStore(),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky: mockCurrentUserPubky.value }),
}));

vi.mock('@/hooks/useFeedLayoutResolution/useFeedLayoutResolution', () => ({
  useFeedLayoutResolution: () => mockUseFeedLayoutResolution(),
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
    FilterContent: (props: { disabledTabs?: string[]; selectedTab?: string }) => mockFilterContent(props),
  };
});

vi.mock('@/molecules/Filters/FilterLayout/FilterLayout', () => {
  return {
    FilterLayout: ({ showVisual }: { showVisual?: boolean }) => (
      <div data-testid="filter-layout" data-show-visual={showVisual ? 'true' : undefined}>
        FilterLayout
      </div>
    ),
  };
});

vi.mock('@/molecules/Filters/FilterReach/FilterReach', () => {
  return {
    FilterReach: ({ selectedTab }: { selectedTab?: string }) => (
      <div data-testid="filter-reach" data-selected-tab={selectedTab}>
        FilterReach
      </div>
    ),
  };
});

vi.mock('@/molecules/Filters/FilterProfileTags/FilterProfileTags', () => ({
  FilterProfileTags: (props: { hidden?: boolean; inputDisabled?: boolean; scope?: string }) =>
    mockFilterProfileTags(props),
}));

vi.mock('@/molecules/Filters/FilterSort/FilterSort', () => {
  return {
    FilterSort: () => <div data-testid="filter-sort">FilterSort</div>,
  };
});

beforeEach(() => {
  mockSetContent.mockClear();
  mockSetReach.mockClear();
  mockSetProfileTagScope.mockClear();
  mockCurrentUserPubky.value = 'viewer-pubky';
  mockUseHomeStore.mockReturnValue({
    layout: 'columns',
    setLayout: vi.fn(),
    reach: 'following',
    setReach: mockSetReach,
    sort: 'timeline',
    setSort: vi.fn(),
    content: 'all',
    setContent: mockSetContent,
    profileTags: [],
    profileTagScope: 'network',
    addProfileTag: vi.fn(),
    removeProfileTag: vi.fn(),
    setProfileTagScope: mockSetProfileTagScope,
  });
  mockFilterContent.mockClear();
  mockFilterProfileTags.mockClear();
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
    expect(screen.getByTestId('filter-profile-tags')).toHaveAttribute('data-hidden', 'false');
    expect(screen.getByTestId('filter-profile-tags')).toHaveAttribute('data-scope', 'network');
    expect(screen.getByTestId('filter-sort')).toBeInTheDocument();
    expect(screen.getByTestId('filter-content')).toBeInTheDocument();
    expect(screen.getByTestId('filter-layout')).toBeInTheDocument();
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
      sort: 'timeline',
      setSort: vi.fn(),
      content: 'short',
      setContent: mockSetContent,
      profileTags: [],
      profileTagScope: 'network',
      addProfileTag: vi.fn(),
      removeProfileTag: vi.fn(),
      setProfileTagScope: mockSetProfileTagScope,
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
    expect(screen.getByTestId('filter-profile-tags')).toHaveAttribute('data-hidden', 'false');
    expect(screen.getByTestId('filter-profile-tags')).toHaveAttribute('data-input-disabled', 'true');
  });

  it('falls back to All when logged out with Network persisted', () => {
    mockCurrentUserPubky.value = null;
    mockUseHomeStore.mockReturnValue({
      layout: 'columns',
      setLayout: vi.fn(),
      reach: 'network',
      setReach: mockSetReach,
      sort: 'timeline',
      setSort: vi.fn(),
      content: 'all',
      setContent: mockSetContent,
      profileTags: [],
      profileTagScope: 'network',
      addProfileTag: vi.fn(),
      removeProfileTag: vi.fn(),
      setProfileTagScope: mockSetProfileTagScope,
    });

    render(<HomeFeedSidebar />);

    expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-selected-tab', 'all');
    expect(screen.getByTestId('filter-profile-tags')).toHaveAttribute('data-hidden', 'false');
    expect(screen.getByTestId('filter-profile-tags')).toHaveAttribute('data-input-disabled', 'true');
  });

  it('hides Tagged as only for Me reach', () => {
    mockUseHomeStore.mockReturnValue({
      layout: 'columns',
      setLayout: vi.fn(),
      reach: 'me',
      setReach: mockSetReach,
      sort: 'timeline',
      setSort: vi.fn(),
      content: 'all',
      setContent: mockSetContent,
      profileTags: ['bitcoiner'],
      profileTagScope: 'following',
      addProfileTag: vi.fn(),
      removeProfileTag: vi.fn(),
      setProfileTagScope: mockSetProfileTagScope,
    });

    render(<HomeFeedSidebar />);

    expect(screen.getByTestId('filter-profile-tags')).toHaveAttribute('data-hidden', 'true');
    expect(screen.getByTestId('filter-profile-tags')).toHaveAttribute('data-scope', 'following');
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
