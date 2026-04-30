import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomeFeedSidebar, HomeFeedDrawer, HomeFeedDrawerMobile } from './HomeFeedSidebar';
import { TIMELINE_FEED_VARIANT } from '@/config';

const mockSetContent = vi.fn();
const mockUseHomeStore = vi.fn();
const mockFilterContent = vi.fn(({ disabledTabs, selectedTab }: { disabledTabs?: string[]; selectedTab?: string }) => (
  <div
    data-testid="filter-content"
    data-disabled-tabs={(disabledTabs ?? []).length ? disabledTabs?.join(',') : undefined}
    data-selected-tab={selectedTab}
  >
    FilterContent
  </div>
));

// Mock useHomeStore
vi.mock('@/stores/home/home.types', () => ({
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

const mockUseFeedLayoutResolution = vi.fn(() => ({
  requestedLayout: 'columns',
  effectiveLayout: 'columns',
  isVisualRequested: false,
  isVisualActive: false,
  isPhoneViewport: false,
}));

vi.mock('@/hooks/useFeedLayoutResolution/useFeedLayoutResolution', () => ({
  useFeedLayoutResolution: () => mockUseFeedLayoutResolution(),
}));

// Mock Atoms
vi.mock('@/atoms', () => ({
  Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="container" className={className}>
      {children}
    </div>
  ),
}));

// Mock Molecules
vi.mock('@/molecules', () => ({
  FilterReach: () => <div data-testid="filter-reach">FilterReach</div>,
  FilterSort: () => <div data-testid="filter-sort">FilterSort</div>,
  FilterContent: (props: { disabledTabs?: string[]; selectedTab?: string }) => mockFilterContent(props),
  FilterLayout: ({ showVisual }: { showVisual?: boolean }) => (
    <div data-testid="filter-layout" data-show-visual={showVisual ? 'true' : undefined}>
      FilterLayout
    </div>
  ),
}));

beforeEach(() => {
  mockSetContent.mockClear();
  mockUseHomeStore.mockReturnValue({
    layout: 'columns',
    setLayout: vi.fn(),
    reach: 'following',
    setReach: vi.fn(),
    sort: 'timeline',
    setSort: vi.fn(),
    content: 'all',
    setContent: mockSetContent,
  });
  mockFilterContent.mockClear();
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

  it('matches snapshot', () => {
    const { container } = render(<HomeFeedSidebar />);
    expect(container).toMatchSnapshot();
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

    expect(screen.getByTestId('filter-content')).toHaveAttribute('data-disabled-tabs', 'short,long,links,files');
  });

  it('shows the resolved visual content without mutating the store from the sidebar', () => {
    mockUseHomeStore.mockReturnValue({
      layout: 'visual',
      setLayout: vi.fn(),
      reach: 'following',
      setReach: vi.fn(),
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
});

describe('HomeFeedDrawer', () => {
  it('renders all filter components', () => {
    render(<HomeFeedDrawer />);

    expect(screen.getByTestId('filter-reach')).toBeInTheDocument();
    expect(screen.getByTestId('filter-sort')).toBeInTheDocument();
    expect(screen.getByTestId('filter-content')).toBeInTheDocument();
    expect(screen.getByTestId('filter-layout')).toBeInTheDocument();
  });

  it('matches snapshot', () => {
    const { container } = render(<HomeFeedDrawer />);
    expect(container).toMatchSnapshot();
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

  it('matches snapshot', () => {
    const { container } = render(<HomeFeedDrawerMobile />);
    expect(container).toMatchSnapshot();
  });
});
