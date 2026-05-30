import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WhoToFollowPage } from './WhoToFollowPage';

// Mock Organisms - ContentLayout renders all props
vi.mock('@/organisms/ActiveUsers/ActiveUsers', () => {
  return {
    ActiveUsers: () => <div data-testid="active-users">ActiveUsers</div>,
  };
});

vi.mock('@/organisms/ContentLayout/ContentLayout', () => {
  return {
    ContentLayout: ({
      children,
      leftSidebarContent,
      rightSidebarContent,
      leftDrawerContent,
      rightDrawerContent,
      disableWideShellLayout,
    }: {
      children: React.ReactNode;
      leftSidebarContent?: React.ReactNode;
      rightSidebarContent?: React.ReactNode;
      leftDrawerContent?: React.ReactNode;
      rightDrawerContent?: React.ReactNode;
      disableWideShellLayout?: boolean;
    }) => (
      <div data-testid="content-layout" data-disable-wide-shell-layout={String(disableWideShellLayout)}>
        {leftSidebarContent && <div data-testid="left-sidebar">{leftSidebarContent}</div>}
        {rightSidebarContent && <div data-testid="right-sidebar">{rightSidebarContent}</div>}
        {leftDrawerContent && <div data-testid="left-drawer">{leftDrawerContent}</div>}
        {rightDrawerContent && <div data-testid="right-drawer">{rightDrawerContent}</div>}
        {children}
      </div>
    ),
  };
});

vi.mock('@/organisms/FeedbackCard/FeedbackCard', () => {
  return {
    FeedbackCard: () => <div data-testid="feedback-card">FeedbackCard</div>,
  };
});

vi.mock('@/organisms/WhoToFollow/WhoToFollow', () => {
  return {
    WhoToFollow: () => <div data-testid="who-to-follow">WhoToFollow</div>,
  };
});

// Mock Molecules
vi.mock('@/molecules/Filters/FilterSortWhoToFollow/FilterSortWhoToFollow', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/molecules/Filters/FilterSortWhoToFollow/FilterSortWhoToFollow')>();
  return {
    ...actual,
    FilterSortWhoToFollow: () => <div data-testid="filter-sort-who-to-follow">FilterSortWhoToFollow</div>,
  };
});

// Mock Atoms
vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({
      children,
      overrideDefaults: _overrideDefaults,
      ...props
    }: {
      children: React.ReactNode;
      overrideDefaults?: boolean;
      [key: string]: unknown;
    }) => (
      <div data-testid="container" {...props}>
        {children}
      </div>
    ),
  };
});

describe('WhoToFollowPage', () => {
  it('renders without errors', () => {
    render(<WhoToFollowPage />);
    expect(screen.getByTestId('content-layout')).toBeInTheDocument();
  });

  it('renders WhoToFollow', () => {
    render(<WhoToFollowPage />);
    expect(screen.getByTestId('who-to-follow')).toBeInTheDocument();
  });

  it('renders FilterSortWhoToFollow in left sidebar and drawer', () => {
    render(<WhoToFollowPage />);
    expect(screen.getAllByTestId('filter-sort-who-to-follow')).toHaveLength(2);
  });

  it('renders ActiveUsers in right sidebar and drawer', () => {
    render(<WhoToFollowPage />);
    expect(screen.getAllByTestId('active-users')).toHaveLength(2);
  });

  it('renders FeedbackCard in right sidebar and drawer', () => {
    render(<WhoToFollowPage />);
    expect(screen.getAllByTestId('feedback-card')).toHaveLength(2);
  });

  it('disables wide shell layout without resetting the saved feed preference', () => {
    render(<WhoToFollowPage />);
    expect(screen.getByTestId('content-layout')).toHaveAttribute('data-disable-wide-shell-layout', 'true');
  });
});

describe('WhoToFollowPage - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<WhoToFollowPage />);
    expect(container).toMatchSnapshot();
  });
});
