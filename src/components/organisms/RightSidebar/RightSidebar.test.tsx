import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RightSidebar } from './RightSidebar';

// Mock the organisms (WhoToFollow and ActiveUsers were moved from molecules to organisms)
vi.mock('@/organisms/ActiveUsers/ActiveUsers', () => {
  return {
    ActiveUsers: () => <div data-testid="active-users">Active Users</div>,
  };
});

vi.mock('@/organisms/FeedbackCard/FeedbackCard', () => {
  return {
    FeedbackCard: () => <div data-testid="feedback-card">Feedback Card</div>,
  };
});

vi.mock('@/organisms/WhoToFollowSidebar/WhoToFollowSidebar', () => {
  return {
    WhoToFollowSidebar: () => <div data-testid="who-to-follow">Who to Follow</div>,
  };
});

// Mock the libs

describe('RightSidebar', () => {
  it('renders with default props', () => {
    render(<RightSidebar />);

    expect(screen.getByTestId('right-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('who-to-follow')).toBeInTheDocument();
    expect(screen.getByTestId('active-users')).toBeInTheDocument();
    expect(screen.getByTestId('feedback-card')).toBeInTheDocument();
  });

  it('renders with custom className', () => {
    render(<RightSidebar className="custom-sidebar" />);

    const sidebar = screen.getByTestId('right-sidebar');
    expect(sidebar).toHaveClass('custom-sidebar');
  });

  it('applies correct base classes', () => {
    render(<RightSidebar />);

    const sidebar = screen.getByTestId('right-sidebar');
    expect(sidebar).toHaveClass(
      'w-(--filter-bar-width)',
      'hidden',
      'lg:flex',
      'flex-col',
      'gap-6',
      'justify-start',
      'items-start',
    );
  });

  it('renders components in correct order', () => {
    render(<RightSidebar />);

    const sidebar = screen.getByTestId('right-sidebar');
    const children = Array.from(sidebar.children);

    expect(children[0]).toHaveAttribute('data-testid', 'who-to-follow');
    expect(children[1]).toHaveAttribute('data-testid', 'active-users');
    expect(children[2]).toHaveClass('self-start', 'sticky', 'top-[100px]');
  });

  it('has sticky positioning for feedback card', () => {
    render(<RightSidebar />);

    const stickyContainer = screen.getByTestId('feedback-card').parentElement;
    expect(stickyContainer).toHaveClass('self-start', 'sticky', 'top-[100px]');
  });

  it('applies responsive classes correctly', () => {
    render(<RightSidebar />);

    const sidebar = screen.getByTestId('right-sidebar');
    expect(sidebar).toHaveClass('hidden', 'lg:flex');
  });

  it('has correct width and layout classes', () => {
    render(<RightSidebar />);

    const sidebar = screen.getByTestId('right-sidebar');
    expect(sidebar).toHaveClass('w-(--filter-bar-width)', 'flex-col', 'gap-6', 'justify-start', 'items-start');
  });

  it('renders all required components', () => {
    render(<RightSidebar />);

    // Check that all three main components are rendered
    expect(screen.getByTestId('who-to-follow')).toBeInTheDocument();
    expect(screen.getByTestId('active-users')).toBeInTheDocument();
    expect(screen.getByTestId('feedback-card')).toBeInTheDocument();
  });

  it('maintains proper spacing between components', () => {
    render(<RightSidebar />);

    const sidebar = screen.getByTestId('right-sidebar');
    expect(sidebar).toHaveClass('gap-6');
  });
});

describe('RightSidebar - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<RightSidebar />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<RightSidebar className="custom-sidebar" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with different styling', () => {
    const { container } = render(<RightSidebar className="border-l border-border bg-secondary/10" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
