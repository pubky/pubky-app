import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomeFeedSidebar, HomeFeedDrawer, HomeFeedDrawerMobile } from './HomeFeedSidebar';
import { TIMELINE_FEED_VARIANT } from '../TimelineFeed/TimelineFeed.types';

// Mock Core.useHomeStore
vi.mock('@/core', () => ({
  CONTENT: {
    ALL: 'all',
    SHORT: 'short',
    LONG: 'long',
    IMAGES: 'images',
    VIDEOS: 'videos',
    LINKS: 'links',
    FILES: 'files',
  },
  useHomeStore: vi.fn(() => ({
    layout: 'columns',
    setLayout: vi.fn(),
    reach: 'following',
    setReach: vi.fn(),
    sort: 'timeline',
    setSort: vi.fn(),
    content: 'all',
    setContent: vi.fn(),
  })),
}));

const mockUseFeedLayoutResolution = vi.fn(() => ({
  requestedLayout: 'columns',
  effectiveLayout: 'columns',
  isVisualRequested: false,
  isVisualActive: false,
  isPhoneViewport: false,
}));

vi.mock('@/hooks', () => ({
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
  FilterContent: ({ disabledTabs }: { disabledTabs?: string[] }) => (
    <div
      data-testid="filter-content"
      data-disabled-tabs={(disabledTabs ?? []).length ? disabledTabs?.join(',') : undefined}
    >
      FilterContent
    </div>
  ),
  FilterLayout: ({ showVisual }: { showVisual?: boolean }) => (
    <div data-testid="filter-layout" data-show-visual={showVisual ? 'true' : undefined}>
      FilterLayout
    </div>
  ),
}));

beforeEach(() => {
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
