import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WhoToFollowPage } from './WhoToFollowPage';

// Mock Hooks
vi.mock('@/hooks', () => ({
  useLayoutReset: vi.fn(),
}));

// Mock Organisms - ContentLayout renders all props
vi.mock('@/organisms', () => ({
  ContentLayout: ({
    children,
    leftSidebarContent,
    rightSidebarContent,
    leftDrawerContent,
    rightDrawerContent,
  }: {
    children: React.ReactNode;
    leftSidebarContent?: React.ReactNode;
    rightSidebarContent?: React.ReactNode;
    leftDrawerContent?: React.ReactNode;
    rightDrawerContent?: React.ReactNode;
  }) => (
    <div data-testid="content-layout">
      {leftSidebarContent && <div data-testid="left-sidebar">{leftSidebarContent}</div>}
      {rightSidebarContent && <div data-testid="right-sidebar">{rightSidebarContent}</div>}
      {leftDrawerContent && <div data-testid="left-drawer">{leftDrawerContent}</div>}
      {rightDrawerContent && <div data-testid="right-drawer">{rightDrawerContent}</div>}
      {children}
    </div>
  ),
  WhoToFollowPageMain: () => <div data-testid="who-to-follow-page-main">WhoToFollowPageMain</div>,
  ActiveUsers: () => <div data-testid="active-users">ActiveUsers</div>,
  FeedbackCard: () => <div data-testid="feedback-card">FeedbackCard</div>,
}));

// Mock Molecules
vi.mock('@/molecules', () => ({
  FilterSortWhoToFollow: () => <div data-testid="filter-sort-who-to-follow">FilterSortWhoToFollow</div>,
}));

// Mock Atoms
vi.mock('@/atoms', () => ({
  Container: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
    <div data-testid="container" {...props}>
      {children}
    </div>
  ),
}));

describe('WhoToFollowPage', () => {
  it('renders without errors', () => {
    render(<WhoToFollowPage />);
    expect(screen.getByTestId('content-layout')).toBeInTheDocument();
  });

  it('renders WhoToFollowPageMain', () => {
    render(<WhoToFollowPage />);
    expect(screen.getByTestId('who-to-follow-page-main')).toBeInTheDocument();
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
});

describe('WhoToFollowPage - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<WhoToFollowPage />);
    expect(container).toMatchSnapshot();
  });
});
