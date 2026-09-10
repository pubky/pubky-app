import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { tryResolveFeedsShellConfig } from '@/app/(feeds)/_shell/configs';
import { HomeFeedRightDrawer, HomeFeedRightSidebar, HotFeedRightDrawer, HotFeedRightSidebar } from './FeedRightSidebar';

// Mock Molecules
vi.mock('@/organisms/VibesCard/VibesCard', () => ({
  VibesCard: () => <div data-testid="vibes-card">VibesCard</div>,
}));

describe('Vibes sidebar placement', () => {
  it.each(['rightSidebarContent', 'rightDrawerContent'] as const)('keeps the permanent Home entry in %s', (content) => {
    render(tryResolveFeedsShellConfig('/home')![content]);
    expect(screen.getByTestId('feedback-card').previousElementSibling).toBe(screen.getByTestId('vibes-card'));
  });

  it('places Vibes directly above Feedback in the Home sidebar', () => {
    render(<HomeFeedRightSidebar showVibes />);
    expect(screen.getByTestId('feedback-card').previousElementSibling).toBe(screen.getByTestId('vibes-card'));
  });

  it.each([HomeFeedRightSidebar, HomeFeedRightDrawer])('excludes Vibes from other regular feed surfaces', (Surface) => {
    render(<Surface />);
    expect(screen.queryByTestId('vibes-card')).not.toBeInTheDocument();
  });

  it.each([HotFeedRightSidebar, HotFeedRightDrawer])('places Vibes directly above Hot feedback', (Sidebar) => {
    render(<Sidebar />);
    expect(screen.getByTestId('feedback-card').previousElementSibling).toBe(screen.getByTestId('vibes-card'));
  });
});

// Mock Organisms
vi.mock('@/organisms/ActiveUsers/ActiveUsers', () => {
  return {
    ActiveUsers: () => <div data-testid="active-users">ActiveUsers</div>,
  };
});

vi.mock('@/organisms/FeedbackCard/FeedbackCard', () => {
  return {
    FeedbackCard: () => <div data-testid="feedback-card">FeedbackCard</div>,
  };
});

vi.mock('@/organisms/HotTags/HotTags', () => {
  return {
    HotTags: () => <div data-testid="hot-tags">HotTags</div>,
  };
});

vi.mock('@/organisms/WhoToFollowSidebar/WhoToFollowSidebar', () => {
  return {
    WhoToFollowSidebar: () => <div data-testid="who-to-follow">WhoToFollowSidebar</div>,
  };
});

describe('HomeFeedRightSidebar', () => {
  it('renders all components', () => {
    render(<HomeFeedRightSidebar />);

    expect(screen.getByTestId('who-to-follow')).toBeInTheDocument();
    expect(screen.getByTestId('active-users')).toBeInTheDocument();
    expect(screen.getByTestId('hot-tags')).toBeInTheDocument();
    expect(screen.getByTestId('feedback-card')).toBeInTheDocument();
  });

  it('matches snapshot', () => {
    const { container } = render(<HomeFeedRightSidebar />);
    expect(container).toMatchSnapshot();
  });
});

describe('HomeFeedRightDrawer', () => {
  it('renders all components', () => {
    render(<HomeFeedRightDrawer />);

    expect(screen.getByTestId('who-to-follow')).toBeInTheDocument();
    expect(screen.getByTestId('active-users')).toBeInTheDocument();
    expect(screen.getByTestId('hot-tags')).toBeInTheDocument();
    expect(screen.getByTestId('feedback-card')).toBeInTheDocument();
  });

  it('matches snapshot', () => {
    const { container } = render(<HomeFeedRightDrawer />);
    expect(container).toMatchSnapshot();
  });
});

describe('HotFeedRightSidebar', () => {
  it('renders WhoToFollow and FeedbackCard', () => {
    render(<HotFeedRightSidebar />);

    expect(screen.getByTestId('who-to-follow')).toBeInTheDocument();
    expect(screen.getByTestId('feedback-card')).toBeInTheDocument();
  });

  it('matches snapshot', () => {
    const { container } = render(<HotFeedRightSidebar />);
    expect(container).toMatchSnapshot();
  });
});

describe('HotFeedRightDrawer', () => {
  it('renders WhoToFollow and FeedbackCard', () => {
    render(<HotFeedRightDrawer />);

    expect(screen.getByTestId('who-to-follow')).toBeInTheDocument();
    expect(screen.getByTestId('feedback-card')).toBeInTheDocument();
  });

  it('matches snapshot', () => {
    const { container } = render(<HotFeedRightDrawer />);
    expect(container).toMatchSnapshot();
  });
});
